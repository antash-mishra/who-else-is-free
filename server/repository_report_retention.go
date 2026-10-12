package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// reportMessageSnapshotLimit bounds how much chat evidence one report keeps.
const reportMessageSnapshotLimit = 50

// The snapshot queries copy a report subject's most recent user messages in
// the reported plan into event_report_messages, at most
// reportMessageSnapshotLimit per report. Only conversations the reporter
// belongs to are read, so a Single plan's other private chats never enter the
// record. Both queries share this wrapper and select the same rows; they
// differ only in how they reach the messages.
const (
	snapshotReportMessagesHead = `
INSERT INTO event_report_messages (report_id, message_id, conversation_id, body, attachment_url, sent_at)
SELECT report_id, message_id, conversation_id, body, attachment_url, sent_at
FROM (
	SELECT
		r.id AS report_id,
		m.id AS message_id,
		m.conversation_id,
		m.body,
		m.attachment_url,
		m.created_at AS sent_at,
		ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY m.created_at DESC, m.id DESC) AS row_num`
	snapshotReportMessagesTail = `
)
WHERE row_num <= ?;
`
)

// snapshotOneReportMessagesQuery snapshots one report (arguments: report id,
// limit) while it is filed, on the server's only database connection. It
// starts from the report and follows indexes: the reporter's memberships
// (conversation_members_user_history_idx), each conversation by id, then
// that conversation's messages (messages_conversation_created_idx). The
// membership join cannot duplicate rows: (conversation_id, user_id) is
// conversation_members' primary key. Never hide the report id behind a
// predicate such as `? IS NULL OR r.id = ?`: SQLite then scans every message,
// so filing would slow down as the messages table grows.
const snapshotOneReportMessagesQuery = snapshotReportMessagesHead + `
	FROM event_reports r
	JOIN conversation_members cm ON cm.user_id = r.user_id
	JOIN conversations c ON c.id = cm.conversation_id AND c.event_id = r.event_id
	JOIN messages m ON m.conversation_id = c.id
	WHERE r.id = ?
	  AND m.sender_id = r.subject_user_id
	  AND m.kind = 'user'` + snapshotReportMessagesTail

// snapshotAllReportMessagesQuery snapshots every report (argument: limit),
// once, during the legacy migration. With no report id to start from, SQLite
// starts from messages whichever join is used (the rebuilt event_reports has
// no index yet); this form gets a plain table scan, which measured several
// times faster than the membership join's scan of the messages index.
const snapshotAllReportMessagesQuery = snapshotReportMessagesHead + `
	FROM event_reports r
	JOIN conversations c ON c.event_id = r.event_id
	JOIN messages m ON m.conversation_id = c.id
	WHERE m.sender_id = r.subject_user_id
	  AND m.kind = 'user'
	  AND EXISTS (
		SELECT 1
		FROM conversation_members cm
		WHERE cm.conversation_id = m.conversation_id
		  AND cm.user_id = r.user_id
	  )` + snapshotReportMessagesTail

// snapshotReportMessages copies chat evidence for one report, or for every
// report when reportID is nil (the one-time legacy migration).
func snapshotReportMessages(ctx context.Context, tx *sql.Tx, reportID *int64) error {
	query, args := snapshotAllReportMessagesQuery, []any{reportMessageSnapshotLimit}
	if reportID != nil {
		query, args = snapshotOneReportMessagesQuery, []any{*reportID, reportMessageSnapshotLimit}
	}
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("snapshot report messages: %w", err)
	}
	return nil
}

// insertReportWithSnapshot files a report and, in the same transaction, keeps
// what must outlive the plan and the accounts (#184): the plan title, the
// subject (the reported member, or the host for a plan report), the subject's
// recent messages in the plan and the subject's identity hashes.
//
// The message snapshot reads live conversation memberships and messages, so
// callers must file the report before removing the reporter or the subject
// from the plan: removing the reporter drops the memberships it reads, and
// removing a Single plan's guest deletes that private chat. Both report
// handlers file first.
func (r *EventRepository) insertReportWithSnapshot(
	ctx context.Context,
	eventID, reporterID int64,
	reportedUserID *int64,
	reason string,
) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin report tx: %w", err)
	}
	defer tx.Rollback()

	var title string
	var hostID int64
	if err := tx.QueryRowContext(ctx, `SELECT title, user_id FROM events WHERE id = ?;`, eventID).Scan(&title, &hostID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrEventNotFound
		}
		return 0, fmt.Errorf("load reported plan: %w", err)
	}
	subjectID := hostID
	var reportedValue any
	if reportedUserID != nil {
		subjectID = *reportedUserID
		reportedValue = *reportedUserID
	}

	res, err := tx.ExecContext(ctx, `
		INSERT INTO event_reports (
			event_id, user_id, reported_user_id, reason, status,
			event_title, subject_user_id, subject_name
		)
		VALUES (?, ?, ?, ?, 'pending', ?, ?, (SELECT name FROM users WHERE id = ?));
	`, eventID, reporterID, reportedValue, reason, title, subjectID, subjectID)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return 0, ErrReportAlreadyExists
		}
		return 0, fmt.Errorf("insert report: %w", err)
	}
	reportID, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("fetch report id: %w", err)
	}
	if err := snapshotReportMessages(ctx, tx, &reportID); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO event_report_identities (report_id, provider, identity_hmac)
		SELECT ?, provider, identity_hmac FROM user_identity_hashes WHERE user_id = ?;
	`, reportID, subjectID); err != nil {
		return 0, fmt.Errorf("snapshot report identities: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit report: %w", err)
	}
	return reportID, nil
}

// RecordUserIdentityHash stores a live account's hash for one provider and
// attaches it to reports already filed about the account, so a report filed
// before the hash was known (for example before the subject's next Google
// sign-in) still carries it after the account is deleted.
func (r *EventRepository) RecordUserIdentityHash(ctx context.Context, userID int64, provider, identityHMAC string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin identity hash tx: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO user_identity_hashes (user_id, provider, identity_hmac)
		VALUES (?, ?, ?)
		ON CONFLICT (user_id, provider) DO UPDATE SET identity_hmac = excluded.identity_hmac
		WHERE identity_hmac <> excluded.identity_hmac;
	`, userID, provider, identityHMAC); err != nil {
		return fmt.Errorf("record identity hash: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO event_report_identities (report_id, provider, identity_hmac)
		SELECT id, ?, ? FROM event_reports WHERE subject_user_id = ?;
	`, provider, identityHMAC, userID); err != nil {
		return fmt.Errorf("attach identity hash to reports: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit identity hash: %w", err)
	}
	return nil
}

// BackfillIdentityHashes hashes identifiers live accounts already have on
// file: every account's email, and Apple subjects linked before #184. Google
// subjects were never stored, so a Google hash arrives with the next sign-in.
// Only missing hashes are written, so it is safe to run on every start.
func (r *EventRepository) BackfillIdentityHashes(ctx context.Context, hasher *IdentityHasher) (int, error) {
	if hasher == nil {
		return 0, nil
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, 'email', u.email
		FROM users u
		WHERE NOT EXISTS (
			SELECT 1 FROM user_identity_hashes h
			WHERE h.user_id = u.id AND h.provider = 'email'
		)
		UNION ALL
		SELECT a.user_id, 'apple', a.apple_sub
		FROM apple_accounts a
		WHERE NOT EXISTS (
			SELECT 1 FROM user_identity_hashes h
			WHERE h.user_id = a.user_id AND h.provider = 'apple'
		);
	`)
	if err != nil {
		return 0, fmt.Errorf("list identities to hash: %w", err)
	}
	type pendingHash struct {
		userID   int64
		provider string
		hash     string
	}
	var pending []pendingHash
	for rows.Next() {
		var userID int64
		var provider, value string
		if err := rows.Scan(&userID, &provider, &value); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan identity to hash: %w", err)
		}
		if hash, ok := hasher.Hash(provider, value); ok {
			pending = append(pending, pendingHash{userID: userID, provider: provider, hash: hash})
		}
	}
	iterErr := rows.Err()
	rows.Close() // release the single SQLite connection before writing
	if iterErr != nil {
		return 0, fmt.Errorf("iterate identities to hash: %w", iterErr)
	}
	for _, p := range pending {
		if err := r.RecordUserIdentityHash(ctx, p.userID, p.provider, p.hash); err != nil {
			return 0, err
		}
	}
	return len(pending), nil
}

// eventReportRetentionMonths is the fixed safety-report retention (#184).
const eventReportRetentionMonths = 18

// PurgeExpiredEventReports deletes reports older than the retention period;
// their message and identity snapshots cascade with them. retention_hold
// marks a report under active review and exempts it.
func (r *EventRepository) PurgeExpiredEventReports(ctx context.Context, now time.Time) (int64, error) {
	// created_at holds SQLite CURRENT_TIMESTAMP text (UTC, "YYYY-MM-DD HH:MM:SS"),
	// so a cutoff in the same format compares correctly as text.
	cutoff := now.UTC().AddDate(0, -eventReportRetentionMonths, 0).Format("2006-01-02 15:04:05")
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM event_reports
		WHERE retention_hold = 0 AND created_at < ?;
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("purge expired event reports: %w", err)
	}
	deleted, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("count purged event reports: %w", err)
	}
	return deleted, nil
}
