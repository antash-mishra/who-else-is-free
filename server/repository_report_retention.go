package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// reportMessageSnapshotLimit bounds how much chat evidence one report keeps.
const reportMessageSnapshotLimit = 50

// snapshotReportMessagesQuery copies each report subject's most recent user
// messages in the reported plan into event_report_messages. Only
// conversations the reporter belongs to are read, so a Single plan's other
// private chats never enter the record. The first two arguments select one
// report id, or every report when both are NULL; the third is the limit.
const snapshotReportMessagesQuery = `
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
		ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY m.created_at DESC, m.id DESC) AS row_num
	FROM event_reports r
	JOIN conversations c ON c.event_id = r.event_id
	JOIN messages m ON m.conversation_id = c.id
	WHERE (? IS NULL OR r.id = ?)
	  AND m.sender_id = r.subject_user_id
	  AND m.kind = 'user'
	  AND EXISTS (
		SELECT 1
		FROM conversation_members cm
		WHERE cm.conversation_id = m.conversation_id
		  AND cm.user_id = r.user_id
	  )
)
WHERE row_num <= ?;
`

// snapshotReportMessages copies chat evidence for one report, or for every
// report when reportID is nil (the one-time legacy migration).
func snapshotReportMessages(ctx context.Context, tx *sql.Tx, reportID *int64) error {
	var id any
	if reportID != nil {
		id = *reportID
	}
	if _, err := tx.ExecContext(ctx, snapshotReportMessagesQuery, id, id, reportMessageSnapshotLimit); err != nil {
		return fmt.Errorf("snapshot report messages: %w", err)
	}
	return nil
}

// insertReportWithSnapshot files a report and, in the same transaction, keeps
// what must outlive the plan and the accounts (#184): the plan title, the
// subject (the reported member, or the host for a plan report) and the
// subject's recent messages in the plan.
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
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit report: %w", err)
	}
	return reportID, nil
}
