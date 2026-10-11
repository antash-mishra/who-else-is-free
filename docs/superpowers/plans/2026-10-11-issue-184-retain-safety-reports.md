# Retain Safety Reports Implementation Plan (issue #184)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safety reports, with a snapshot of the chat evidence, survive deletion of the reported
account, the reporter's account, the reviewing admin's account, and the plan, for a fixed
18-month retention window enforced by a scheduled purge.

**Architecture:** Rebuild `event_reports` once (idempotently) so deletes stop cascading:
`event_id`, `user_id` and `reviewed_by` become `ON DELETE SET NULL`; `reported_user_id` and a
new `subject_user_id` keep their ids with no FK. At report time one transaction copies the plan
title, the subject's name, the subject's last 50 messages (into `event_report_messages`) and the
subject's HMAC identity hashes (into `event_report_identities`); both child tables cascade from
the report. A daily goroutine deletes reports older than 18 months unless `retention_hold = 1`.

**Tech Stack:** Go, Gin, SQLite 3.45 via `modernc.org/sqlite` (`foreign_keys(1)` in the DSN, one
pooled connection), `crypto/hmac` + `crypto/sha256`, standard `testing`.

**Spec:** GitHub issue #184, "Keep safety reports (and chat evidence) when an account or plan is
deleted" (`gh issue view 184`). Precedent: `docs/support-data-retention.md` (help submissions
already null their user link on account deletion). Decisions below were made by the controller on
the repo owner's instruction ("make the best decision, retain for 18 months").

## Global Constraints

- Retention: **18 months from `event_reports.created_at`** (repo owner's decision, replacing the
  issue's proposed 12). Expired reports and all their snapshot rows are deleted together.
- Exception: only reports with `retention_hold = 1` (under active review) skip the purge.
- Identity: HMAC-SHA256 keyed by the `REPORT_IDENTITY_HMAC_KEY` env var, input
  `"<provider>:<value>"`, stored as lowercase hex. Providers: `apple` (Apple subject), `google`
  (Google subject), `email` (account email, trimmed and lowercased). Never store a raw Google
  subject. Never log a subject, an email, or a hash.
- Subject of a report: the reported member for a member report, the plan's host for a plan report.
- Snapshot: the subject's most recent **50** `kind = 'user'` messages in the plan, only from
  conversations the reporter belongs to, with their timestamps.
- Reporter deletion → `user_id = NULL`; admin deletion → `reviewed_by = NULL`; plan deletion →
  `event_id = NULL`. Account or plan deletion never deletes a report.
- `user_blocks` keep being deleted with the account (unchanged).
- Keep only: reason, dates, status, plan title, subject id and name, identity hashes, message
  snapshot. No other profile data.
- Migrations live in `server/repository_schema.go`, are idempotent on every startup, and must leave
  SQLite foreign-key enforcement ON.
- Logs carry counts only, never report content (`docs/support-data-retention.md` rules apply).
- Do not modify the privacy policy (`src/content/privacyPolicyMarkdown.ts`) on this branch: the
  issue asks for the policy to change when this ships, not before.

## Decisions

1. **18 months** retention (repo owner).
2. **Email HMAC in addition to provider subjects.** Accounts are keyed by email
   (`getOrCreateUserByEmail`) and the Google subject was never stored, so existing Google accounts
   would have no hash until their next sign-in, and an account deleted right after being reported
   might never get one. An `email` hash is backfilled for every account at startup, which closes
   that gap; Apple subjects are backfilled from `apple_accounts`; Google subjects are captured at
   sign-in (sessions last 24h, so active accounts are covered within a day).
3. **`subject_user_id` column (no FK).** Plan reports have no `reported_user_id`, so without it a
   plan report loses its subject when the host's account and plan are deleted. It also lets a
   hash captured later attach to earlier reports about the same live account.
4. **Hashes attach to existing reports when recorded.** Hashes never change a report's other data.
5. **Legacy reports get a one-time snapshot** of title, subject and messages during the rebuild —
   the deploy is the last moment that evidence still exists.
6. **Deferred:** flagging new accounts that match a report in the admin UI (the issue marks it
   optional; the docs give the SQL lookup), and an admin UI for `retention_hold` (SQL for now, the
   same way reports are reviewed today: nothing in the app sets `reviewed_by`).
7. **Unchanged:** the host "unblock" action (`DeleteMemberReport`) still withdraws the host's own
   member report. That is the reporter's choice, not the reported person's.

## Review Focus

1. **Restart after a deletion.** `cleanupDuplicateEventReports` groups by `(event_id, user_id)`;
   SQLite puts all NULLs in one group, so the next startup would delete retained reports.
   Expect: restarting never removes a retained report. (Task 1,
   `TestEventReportStartupCleanupKeepsNulledReports`.)
2. **Restart with a report about a deleted account.** `backfillUserBlocksFromMemberReports` would
   insert a `user_blocks` row for a deleted user id → FK error → `log.Fatalf` on boot.
   Expect: the server boots. (Task 2, `TestDeletedReportedUserDoesNotBreakInit`.)
3. **Legacy DB with pre-FK orphans.** Old rows may point at plans/accounts that no longer exist.
   Expect: the rebuild nulls those references instead of failing or dropping the row, and FK
   enforcement is ON afterwards. (Task 1, `TestEventReportsRebuildMigratesLegacyRows`.)
4. **Single-plan privacy.** A plan report's subject is the host, and a Single plan has one private
   chat per guest. Expect: only messages from conversations the reporter belongs to are copied.
   (Task 3, `TestPlanReportSnapshotsOnlyReporterVisibleHostMessages`.)
5. **No HMAC key configured.** Expect: sign-in and reporting still work and simply record no
   hashes. (Task 4, `TestLoginWithoutIdentityKeyRecordsNothing`.)

## File Structure

| File | Responsibility |
| --- | --- |
| `server/repository_schema.go` (modify) | DDL, the one-time `event_reports` rebuild, `Init` wiring, startup-cleanup guards |
| `server/repository_report_retention.go` (create) | Report snapshot (messages, identities), identity-hash storage/backfill, purge |
| `server/identity_hash.go` (create) | `IdentityHasher` and provider constants |
| `server/report_retention_job.go` (create) | Daily purge goroutine |
| `server/repository_accounts.go` (modify) | Account deletion keeps reports; report creators delegate to the snapshot insert |
| `server/auth_handler.go` (modify) | Record identity hashes on Google/Apple sign-in |
| `server/main.go` (modify) | Identity backfill at startup, start the purge job |
| `server/event_report_retention_test.go` (create) | All tests for this plan |
| `docs/safety-report-retention.md` (create), `docs/delete-profile-functionality-plan.md`, `AGENTS.md`, `CLAUDE.md` (modify) | Policy, operations, conventions |

All commands below run from `server/` unless they say otherwise.

---

### Task 1: Rebuild `event_reports` so deletes null references

**Files:**
- Modify: `server/repository_schema.go` (`createTableEventReports` ~L340, `Init` ~L864,
  `cleanupOrphanedEventReferences` ~L1781, `cleanupDuplicateEventReports` ~L1823)
- Create: `server/repository_report_retention.go`
- Create: `server/event_report_retention_test.go`

**Interfaces:**
- Produces (later tasks rely on these exact names):
  - `event_reports` columns `event_title TEXT`, `subject_user_id INTEGER`, `subject_name TEXT`,
    `retention_hold INTEGER NOT NULL DEFAULT 0`; table `event_report_messages`.
  - `const reportMessageSnapshotLimit = 50`
  - `func snapshotReportMessages(ctx context.Context, tx *sql.Tx, reportID *int64) error`
  - `func (r *EventRepository) tableHasColumn(ctx context.Context, table, column string) (bool, error)`
  - Test helpers in `event_report_retention_test.go`: `newRetentionTestRepo(t)`,
    `countRows(t, repo, query, args...) int`, `eventReportsFKActions(t, repo) map[string]string`.

- [ ] **Step 1: Write the failing tests** — create `server/event_report_retention_test.go`:

```go
package main

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

// newRetentionTestRepo returns an initialised in-memory repository with one
// seeded user ("tester", id 1).
func newRetentionTestRepo(t *testing.T) *EventRepository {
	t.Helper()
	return newNotificationsTestRepo(t)
}

func countRows(t *testing.T, repo *EventRepository, query string, args ...any) int {
	t.Helper()
	var n int
	if err := repo.db.QueryRowContext(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("count %q: %v", query, err)
	}
	return n
}

// eventReportsFKActions maps each FK column of event_reports to its ON DELETE action.
func eventReportsFKActions(t *testing.T, repo *EventRepository) map[string]string {
	t.Helper()
	rows, err := repo.db.QueryContext(context.Background(), `SELECT "from", on_delete FROM pragma_foreign_key_list('event_reports');`)
	if err != nil {
		t.Fatalf("fk list: %v", err)
	}
	defer rows.Close()
	actions := map[string]string{}
	for rows.Next() {
		var from, onDelete string
		if err := rows.Scan(&from, &onDelete); err != nil {
			t.Fatalf("scan fk: %v", err)
		}
		actions[from] = onDelete
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate fk: %v", err)
	}
	return actions
}

func TestEventReportsSchemaDoesNotCascade(t *testing.T) {
	repo := newRetentionTestRepo(t)
	got := eventReportsFKActions(t, repo)
	want := map[string]string{"event_id": "SET NULL", "user_id": "SET NULL", "reviewed_by": "SET NULL"}
	for column, action := range want {
		if got[column] != action {
			t.Fatalf("FK %s ON DELETE = %q, want %q (all: %v)", column, got[column], action, got)
		}
	}
	for _, column := range []string{"reported_user_id", "subject_user_id"} {
		if _, ok := got[column]; ok {
			t.Fatalf("%s must have no FK so it outlives the account, got %v", column, got)
		}
	}
}

// legacyEventReportsDDL is the pre-#184 event_reports table.
const legacyEventReportsDDL = `
CREATE TABLE event_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reported_user_id INTEGER,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','reviewed','dismissed')) DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by INTEGER,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reported_user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
`

// openLegacyReportsDB builds a pre-#184 database: a Group plan whose host
// reported a member, a message from that member, and a second report whose
// plan, reporter and reviewer no longer exist (pre-FK-era orphans).
func openLegacyReportsDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openDB(filepath.Join(t.TempDir(), "legacy.sqlite"))
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	ctx := context.Background()
	for _, stmt := range []string{
		`PRAGMA foreign_keys = OFF;`,
		createTableUsers,
		createTableEvents,
		createTableConversations,
		createTableConversationMembers,
		createTableMessages,
		legacyEventReportsDDL,
		`INSERT INTO users (id, name, email, password) VALUES
			(1, 'Host', 'host@legacy.test', 'pw'),
			(2, 'Offender', 'offender@legacy.test', 'pw');`,
		`INSERT INTO events (id, user_id, title, location, time, event_date, gender, min_age, max_age, date_label, group_type)
			VALUES (10, 1, 'Board games', 'Cafe', '10:00', '2099-01-01', 'Everyone', 18, 99, 'Today', 'Group');`,
		`INSERT INTO conversations (id, title, created_by, event_id) VALUES (20, 'Board games', 1, 10);`,
		`INSERT INTO conversation_members (conversation_id, user_id) VALUES (20, 1);`,
		`INSERT INTO messages (conversation_id, sender_id, body, kind) VALUES
			(20, 2, 'legacy abuse', 'user'),
			(20, 2, 'Offender joined the plan', 'system');`,
		`INSERT INTO event_reports (id, event_id, user_id, reported_user_id, reason, reviewed_by) VALUES
			(1, 10, 1, 2, 'live row', NULL),
			(2, 999, 555, 2, 'orphan refs', 777);`,
		`PRAGMA foreign_keys = ON;`,
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("legacy setup failed on %q: %v", stmt, err)
		}
	}
	return db
}

func TestEventReportsRebuildMigratesLegacyRows(t *testing.T) {
	db := openLegacyReportsDB(t)
	repo := NewEventRepository(db)
	ctx := context.Background()
	for run := 1; run <= 2; run++ { // the second run proves the rebuild is idempotent
		initCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := repo.Init(initCtx)
		cancel()
		if err != nil {
			t.Fatalf("Init run %d: %v", run, err)
		}
	}

	var eventID, userID, reviewedBy, subjectID sql.NullInt64
	var title, subjectName sql.NullString
	if err := db.QueryRowContext(ctx, `
		SELECT event_id, user_id, reviewed_by, subject_user_id, event_title, subject_name
		FROM event_reports WHERE id = 2`).Scan(&eventID, &userID, &reviewedBy, &subjectID, &title, &subjectName); err != nil {
		t.Fatalf("orphan row was dropped: %v", err)
	}
	if eventID.Valid || userID.Valid || reviewedBy.Valid {
		t.Fatalf("orphan references not nulled: event_id=%v user_id=%v reviewed_by=%v", eventID, userID, reviewedBy)
	}
	if subjectID.Int64 != 2 || subjectName.String != "Offender" || title.Valid {
		t.Fatalf("orphan subject/title = %v/%v/%v, want 2/Offender/NULL", subjectID, subjectName, title)
	}

	if err := db.QueryRowContext(ctx, `
		SELECT event_id, user_id, subject_user_id, event_title, subject_name
		FROM event_reports WHERE id = 1`).Scan(&eventID, &userID, &subjectID, &title, &subjectName); err != nil {
		t.Fatal(err)
	}
	if eventID.Int64 != 10 || userID.Int64 != 1 || subjectID.Int64 != 2 || title.String != "Board games" || subjectName.String != "Offender" {
		t.Fatalf("live row = event %v user %v subject %v %q %q", eventID, userID, subjectID, title.String, subjectName.String)
	}

	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages WHERE report_id = 1 AND body = 'legacy abuse'`); n != 1 {
		t.Fatalf("legacy snapshot rows for the user message = %d, want exactly 1 after two Init runs", n)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages`); n != 1 {
		t.Fatalf("legacy snapshot copied %d rows, want 1 (system rows and the plan-less report excluded)", n)
	}
	if got := eventReportsFKActions(t, repo)["event_id"]; got != "SET NULL" {
		t.Fatalf("legacy table not rebuilt: event_id ON DELETE = %q", got)
	}
	if n := countRows(t, repo, `PRAGMA foreign_keys;`); n != 1 {
		t.Fatal("foreign key enforcement left OFF after the rebuild")
	}
}

func TestEventReportStartupCleanupKeepsNulledReports(t *testing.T) {
	repo := newRetentionTestRepo(t)
	ctx := context.Background()
	// Two plan reports whose plans and reporter are gone: every grouping column
	// is NULL, which the old dedupe treated as one duplicate group.
	if _, err := repo.db.ExecContext(ctx, `
		INSERT INTO event_reports (event_id, user_id, reported_user_id, reason) VALUES
		(NULL, NULL, NULL, 'first'), (NULL, NULL, NULL, 'second');`); err != nil {
		t.Fatal(err)
	}
	initCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := repo.Init(initCtx); err != nil {
		t.Fatalf("re-Init: %v", err)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_reports`); n != 2 {
		t.Fatalf("startup cleanup removed retained reports: %d left, want 2", n)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test -run 'TestEventReports|TestEventReportStartup' -count=1 .`
Expected: FAIL — `FK event_id ON DELETE = "CASCADE"`; the legacy test fails on a missing
column (`subject_user_id`/`event_title`); the startup test fails inserting NULL into
`event_id NOT NULL`.

- [ ] **Step 3: Implement the schema**

Replace `createTableEventReports` in `repository_schema.go` and add the snapshot table:

```go
// event_reports is the safety record and outlives the plan, the reporter and
// the reviewing admin (#184): those references are ON DELETE SET NULL.
// reported_user_id and subject_user_id deliberately have no FK. They keep a
// deleted account's id (users.id is AUTOINCREMENT, so it is never reused),
// which keeps reports about one person grouped and keeps the plan-vs-member
// partial unique indexes meaningful. subject_user_id is the reported member,
// or the host for a plan report; event_title and subject_name are copies taken
// when the report is filed.
const createTableEventReports = `
CREATE TABLE IF NOT EXISTS event_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    user_id INTEGER,
    reported_user_id INTEGER,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','reviewed','dismissed')) DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by INTEGER,
    event_title TEXT,
    subject_user_id INTEGER,
    subject_name TEXT,
    retention_hold INTEGER NOT NULL DEFAULT 0 CHECK(retention_hold IN (0, 1)),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
`

// event_report_messages holds the chat evidence copied when a report is
// filed; it is deleted with its report.
const createTableEventReportMessages = `
CREATE TABLE IF NOT EXISTS event_report_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    attachment_url TEXT,
    sent_at DATETIME NOT NULL,
    FOREIGN KEY (report_id) REFERENCES event_reports(id) ON DELETE CASCADE
);
`

const createEventReportMessagesReportIndex = `
CREATE INDEX IF NOT EXISTS event_report_messages_report_idx
ON event_report_messages (report_id);
`

// copyLegacyEventReports moves pre-#184 rows into the rebuilt table. Legacy
// rows can point at plans or accounts that are already gone (rows from before
// foreign keys were enforced); those references become NULL instead of
// failing the copy. Plan title and subject are filled from what still exists.
const copyLegacyEventReports = `
INSERT INTO event_reports_new (
    id, event_id, user_id, reported_user_id, reason, status, created_at,
    reviewed_at, reviewed_by, event_title, subject_user_id, subject_name
)
SELECT
    r.id,
    e.id,
    reporter.id,
    r.reported_user_id,
    r.reason,
    r.status,
    r.created_at,
    r.reviewed_at,
    reviewer.id,
    e.title,
    COALESCE(r.reported_user_id, e.user_id),
    subject.name
FROM event_reports r
LEFT JOIN events e ON e.id = r.event_id
LEFT JOIN users reporter ON reporter.id = r.user_id
LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
LEFT JOIN users subject ON subject.id = COALESCE(r.reported_user_id, e.user_id);
`
```

Create `server/repository_report_retention.go`:

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
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
```

Add the rebuild and the column helper to `repository_schema.go` (next to
`ensureReportedUserIDColumn`):

```go
// ensureRetainedEventReportsSchema rebuilds a pre-#184 event_reports table.
// SQLite cannot alter a foreign key in place, so rows are copied into the new
// shape with foreign keys off, and legacy reports get the snapshot they never
// had while their messages still exist. Only the new DDL has retention_hold,
// so the rebuild runs once.
func (r *EventRepository) ensureRetainedEventReportsSchema(ctx context.Context) (err error) {
	hasRetentionHold, err := r.tableHasColumn(ctx, "event_reports", "retention_hold")
	if err != nil {
		return err
	}
	if hasRetentionHold {
		return nil
	}

	// PRAGMA foreign_keys is per connection and ignored inside a transaction,
	// so pin one connection and toggle it around the transaction.
	conn, err := r.db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("pin connection for event_reports rebuild: %w", err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = OFF;`); err != nil {
		return fmt.Errorf("disable foreign keys for event_reports rebuild: %w", err)
	}
	// The pool holds a single connection, so leaving enforcement off would
	// disable foreign keys for the whole server: failing to restore it fails Init.
	defer func() {
		if _, fkErr := conn.ExecContext(context.Background(), `PRAGMA foreign_keys = ON;`); fkErr != nil && err == nil {
			err = fmt.Errorf("re-enable foreign keys after event_reports rebuild: %w", fkErr)
		}
	}()

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin event_reports rebuild: %w", err)
	}
	defer tx.Rollback()

	createNew := strings.Replace(createTableEventReports,
		"CREATE TABLE IF NOT EXISTS event_reports (", "CREATE TABLE event_reports_new (", 1)
	for _, step := range []string{
		createNew,
		copyLegacyEventReports,
		`DROP TABLE event_reports;`,
		`ALTER TABLE event_reports_new RENAME TO event_reports;`,
		createTableEventReportMessages,
		createEventReportMessagesReportIndex,
	} {
		if _, err := tx.ExecContext(ctx, step); err != nil {
			return fmt.Errorf("rebuild event_reports: %w", err)
		}
	}
	if err := snapshotReportMessages(ctx, tx, nil); err != nil {
		return err
	}
	for _, table := range []string{"event_reports", "event_report_messages"} {
		var violations int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM pragma_foreign_key_check(?);`, table).Scan(&violations); err != nil {
			return fmt.Errorf("check %s foreign keys: %w", table, err)
		}
		if violations > 0 {
			return fmt.Errorf("rebuilt %s has %d foreign key violations", table, violations)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit event_reports rebuild: %w", err)
	}
	return nil
}

// tableHasColumn closes its cursor before returning, so callers can alter the
// table afterwards on the single SQLite connection.
func (r *EventRepository) tableHasColumn(ctx context.Context, table, column string) (bool, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT 1 FROM pragma_table_info(?) WHERE name = ?;`, table, column)
	if err != nil {
		return false, fmt.Errorf("inspect %s table: %w", table, err)
	}
	defer rows.Close()
	found := rows.Next()
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("inspect %s table: %w", table, err)
	}
	return found, nil
}
```

Wire it into `Init`, directly after the `ensureReportedUserIDColumn` call and before
`cleanupOrphanedEventReferences`:

```go
	if err := r.ensureRetainedEventReportsSchema(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createTableEventReportMessages); err != nil {
		return fmt.Errorf("create event_report_messages table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createEventReportMessagesReportIndex); err != nil {
		return fmt.Errorf("create event_report_messages report index: %w", err)
	}
```

In `cleanupOrphanedEventReferences`, replace the `deleteOrphanedEventReports` block:

```go
	// Reports outlive their plan (#184): null a dangling plan reference
	// instead of deleting the safety record.
	const nullOrphanedEventReportPlans = `
		UPDATE event_reports
		SET event_id = NULL
		WHERE event_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM events e
			WHERE e.id = event_reports.event_id
		);
	`
	if _, err := r.db.ExecContext(ctx, nullOrphanedEventReportPlans); err != nil {
		return fmt.Errorf("null orphaned event report plans: %w", err)
	}
```

In `cleanupDuplicateEventReports`, exclude NULL groups (SQLite `GROUP BY` folds NULLs together),
and extend its doc comment with one sentence saying so:

```go
	const dedupeQuery = `
		DELETE FROM event_reports
		WHERE reported_user_id IS NULL
		AND event_id IS NOT NULL
		AND user_id IS NOT NULL
		AND id NOT IN (
			SELECT MIN(id)
			FROM event_reports
			WHERE reported_user_id IS NULL
			AND event_id IS NOT NULL
			AND user_id IS NOT NULL
			GROUP BY event_id, user_id
		);
	`
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test -run 'TestEventReports|TestEventReportStartup' -count=1 .`
Expected: PASS. Then `go test ./... -count=1` — all PASS (existing report/deletion tests included).

- [ ] **Step 5: Commit**

```bash
git add server/repository_schema.go server/repository_report_retention.go server/event_report_retention_test.go
git commit -m "feat(server): rebuild event_reports so deletes null references (#184)"
```

---

### Task 2: Account and plan deletion keep reports

**Files:**
- Modify: `server/repository_accounts.go:285-293` (`DeleteUserAccount`)
- Modify: `server/repository_schema.go` (`backfillUserBlocksFromMemberReports` ~L1844)
- Test: `server/event_report_retention_test.go`

**Interfaces:**
- Consumes: Task 1 schema and test helpers (`newRetentionTestRepo`, `countRows`), plus existing
  helpers `seedNotificationActionUser`, `seedNotificationActionEvent` (title `Hike`),
  `seedNotificationActionConversation` (adds the owner as a member) from
  `notification_actions_test.go`.
- Produces: test fixture `reportFixture` / `seedMemberReportFixture(t) reportFixture`, used by
  Tasks 3–5.

- [ ] **Step 1: Write the failing tests** — append to `server/event_report_retention_test.go`:

```go
type reportFixture struct {
	repo                     *EventRepository
	host, offender, eventID  int64
	conversationID, reportID int64
}

// seedMemberReportFixture: "host" runs a Group plan, "offender" joins and sends
// two messages, and host files a member report against offender.
func seedMemberReportFixture(t *testing.T) reportFixture {
	t.Helper()
	repo := newRetentionTestRepo(t)
	ctx := context.Background()
	host := seedNotificationActionUser(t, repo, "host")
	offender := seedNotificationActionUser(t, repo, "offender")
	eventID := seedNotificationActionEvent(t, repo, host, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, host, offender)
	for _, body := range []string{"abusive message 1", "abusive message 2"} {
		if _, err := repo.CreateMessage(ctx, CreateMessageParams{
			ConversationID: conversationID, SenderID: offender, Body: body, DeliveryStatus: "sent", Kind: MessageKindUser,
		}); err != nil {
			t.Fatalf("message: %v", err)
		}
	}
	report, err := repo.CreateMemberReport(ctx, eventID, host, offender, "harassed me in chat")
	if err != nil {
		t.Fatalf("member report: %v", err)
	}
	return reportFixture{repo: repo, host: host, offender: offender, eventID: eventID, conversationID: conversationID, reportID: report.ID}
}

func TestDeletingReportedUserKeepsReport(t *testing.T) {
	f := seedMemberReportFixture(t)
	if _, err := f.repo.DeleteUserAccount(context.Background(), f.offender); err != nil {
		t.Fatalf("delete offender: %v", err)
	}
	var reportedUserID sql.NullInt64
	if err := f.repo.db.QueryRow(`SELECT reported_user_id FROM event_reports WHERE id = ?`, f.reportID).Scan(&reportedUserID); err != nil {
		t.Fatalf("report gone after the reported user deleted their account: %v", err)
	}
	if reportedUserID.Int64 != f.offender {
		t.Fatalf("reported_user_id = %v, want %d", reportedUserID, f.offender)
	}
}

func TestDeletingPlanKeepsReport(t *testing.T) {
	f := seedMemberReportFixture(t)
	if err := f.repo.Delete(context.Background(), f.eventID, f.host); err != nil {
		t.Fatalf("delete plan: %v", err)
	}
	var eventID sql.NullInt64
	if err := f.repo.db.QueryRow(`SELECT event_id FROM event_reports WHERE id = ?`, f.reportID).Scan(&eventID); err != nil {
		t.Fatalf("report gone after the plan was deleted: %v", err)
	}
	if eventID.Valid {
		t.Fatalf("event_id = %v, want NULL", eventID)
	}
}

func TestDeletingReporterKeepsReportWithNullReporter(t *testing.T) {
	f := seedMemberReportFixture(t)
	if _, err := f.repo.DeleteUserAccount(context.Background(), f.host); err != nil {
		t.Fatalf("delete reporter: %v", err)
	}
	var userID, reportedUserID sql.NullInt64
	if err := f.repo.db.QueryRow(`SELECT user_id, reported_user_id FROM event_reports WHERE id = ?`, f.reportID).Scan(&userID, &reportedUserID); err != nil {
		t.Fatalf("report gone after the reporter deleted their account: %v", err)
	}
	if userID.Valid || reportedUserID.Int64 != f.offender {
		t.Fatalf("user_id = %v reported_user_id = %v, want NULL/%d", userID, reportedUserID, f.offender)
	}
}

func TestDeletingReviewerKeepsReportWithNullReviewer(t *testing.T) {
	f := seedMemberReportFixture(t)
	admin := seedNotificationActionUser(t, f.repo, "admin")
	if _, err := f.repo.db.Exec(`UPDATE event_reports SET status = 'reviewed', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`, admin, f.reportID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.repo.DeleteUserAccount(context.Background(), admin); err != nil {
		t.Fatalf("delete admin: %v", err)
	}
	var reviewedBy sql.NullInt64
	var status string
	if err := f.repo.db.QueryRow(`SELECT reviewed_by, status FROM event_reports WHERE id = ?`, f.reportID).Scan(&reviewedBy, &status); err != nil {
		t.Fatalf("report gone after the reviewer deleted their account: %v", err)
	}
	if reviewedBy.Valid || status != "reviewed" {
		t.Fatalf("reviewed_by = %v status = %q, want NULL/reviewed", reviewedBy, status)
	}
}

func TestDeletingAccountStillDeletesBlocks(t *testing.T) {
	f := seedMemberReportFixture(t)
	if err := f.repo.CreateMutualBlock(context.Background(), f.host, f.offender); err != nil {
		t.Fatal(err)
	}
	if _, err := f.repo.DeleteUserAccount(context.Background(), f.offender); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM user_blocks WHERE blocker_user_id = ? OR blocked_user_id = ?`, f.offender, f.offender); n != 0 {
		t.Fatalf("blocks involving the deleted account = %d, want 0", n)
	}
}

func TestDeletedReportedUserDoesNotBreakInit(t *testing.T) {
	f := seedMemberReportFixture(t)
	if _, err := f.repo.DeleteUserAccount(context.Background(), f.offender); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := f.repo.Init(ctx); err != nil {
		t.Fatalf("restart after deletion failed: %v", err)
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM event_reports WHERE id = ?`, f.reportID); n != 1 {
		t.Fatalf("report rows after restart = %d, want 1", n)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test -run 'TestDeleting|TestDeletedReportedUser' -count=1 .`
Expected: FAIL — reported-user, reporter and reviewer cases fail with
`report gone after …: sql: no rows in result set`; `TestDeletedReportedUserDoesNotBreakInit` fails
with `report rows after restart = 0`. `TestDeletingPlanKeepsReport` and
`TestDeletingAccountStillDeletesBlocks` already pass after Task 1 (FK action / unchanged
behaviour) — that is expected.

- [ ] **Step 3: Implement**

In `DeleteUserAccount`, remove the `DELETE FROM event_reports …` statement and replace the comment
above the join-request delete:

```go
	// Join requests involving the account are removed. Safety reports are not
	// (#184): event_reports.user_id and reviewed_by null themselves through
	// their ON DELETE SET NULL foreign keys when the users row goes, and
	// reported_user_id keeps the id. The retention job purges reports instead.
	if _, err := tx.ExecContext(ctx, `DELETE FROM conversation_join_requests WHERE user_id = ? OR decided_by = ?;`, userID, userID); err != nil {
		return nil, fmt.Errorf("delete user join requests: %w", err)
	}
```

Also update the comment above `DELETE FROM events WHERE user_id = ?` in the same function: it says
reports cascade from events; they no longer do. Change "event-backed
conversations/join-requests/reports cascade from events" to "event-backed conversations and join
requests cascade from events, while reports keep their row with event_id set to NULL".

In `repository_schema.go`, make `backfillUserBlocksFromMemberReports` skip accounts that no longer
exist (a report about a deleted account would otherwise insert a block that violates the
`user_blocks` foreign keys and fail startup):

```go
	const backfillQuery = `
		INSERT OR IGNORE INTO user_blocks (blocker_user_id, blocked_user_id)
		SELECT r.user_id, r.reported_user_id
		FROM event_reports r
		WHERE r.reported_user_id IS NOT NULL
		AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id)
		AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.reported_user_id)
		UNION
		SELECT r.reported_user_id, r.user_id
		FROM event_reports r
		WHERE r.reported_user_id IS NOT NULL
		AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id)
		AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.reported_user_id);
	`
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test -run 'TestDeleting|TestDeletedReportedUser' -count=1 . && go test ./... -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repository_accounts.go server/repository_schema.go server/event_report_retention_test.go
git commit -m "fix(server): keep safety reports when an account or plan is deleted (#184)"
```

---

### Task 3: Snapshot plan title, subject and chat evidence when a report is filed

**Files:**
- Modify: `server/repository_report_retention.go` (add `insertReportWithSnapshot`)
- Modify: `server/repository_accounts.go` (`CreateEventReport` ~L560, `CreateMemberReport` ~L584)
- Modify: `server/repository_schema.go` (delete the now-unused `insertEventReport` and
  `insertMemberReport` constants ~L506-514)
- Test: `server/event_report_retention_test.go`

**Interfaces:**
- Consumes: `snapshotReportMessages`, `reportMessageSnapshotLimit` (Task 1);
  `seedMemberReportFixture`, `countRows` (Tasks 1–2); `ErrEventNotFound` (`repository.go`),
  `ErrReportAlreadyExists`.
- Produces:
  `func (r *EventRepository) insertReportWithSnapshot(ctx context.Context, eventID, reporterID int64, reportedUserID *int64, reason string) (int64, error)`
  — returns `ErrEventNotFound` for a missing plan and `ErrReportAlreadyExists` on the unique
  indexes. `CreateEventReport` / `CreateMemberReport` keep their signatures and return values.
  Task 4 adds an identity-copy statement inside this function.

- [ ] **Step 1: Write the failing tests** — append (add `"errors"` and `"fmt"` to the imports):

```go
func TestMemberReportSnapshotsTitleSubjectAndMessages(t *testing.T) {
	f := seedMemberReportFixture(t)
	if _, err := f.repo.DeleteUserAccount(context.Background(), f.offender); err != nil {
		t.Fatal(err)
	}
	var title, subjectName string
	var subjectID int64
	if err := f.repo.db.QueryRow(`SELECT event_title, subject_user_id, subject_name FROM event_reports WHERE id = ?`, f.reportID).
		Scan(&title, &subjectID, &subjectName); err != nil {
		t.Fatal(err)
	}
	if title != "Hike" || subjectID != f.offender || subjectName != "offender" {
		t.Fatalf("snapshot = %q/%d/%q, want Hike/%d/offender", title, subjectID, subjectName, f.offender)
	}
	rows, err := f.repo.db.Query(`SELECT body FROM event_report_messages WHERE report_id = ? ORDER BY sent_at, message_id`, f.reportID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var bodies []string
	for rows.Next() {
		var body string
		if err := rows.Scan(&body); err != nil {
			t.Fatal(err)
		}
		bodies = append(bodies, body)
	}
	if len(bodies) != 2 || bodies[0] != "abusive message 1" || bodies[1] != "abusive message 2" {
		t.Fatalf("snapshot bodies = %v, want both abusive messages", bodies)
	}
}

func TestReportSnapshotKeepsMostRecent50UserMessages(t *testing.T) {
	repo := newRetentionTestRepo(t)
	ctx := context.Background()
	host := seedNotificationActionUser(t, repo, "host")
	offender := seedNotificationActionUser(t, repo, "offender")
	eventID := seedNotificationActionEvent(t, repo, host, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, host, offender)
	for i := 0; i < 60; i++ {
		if _, err := repo.CreateMessage(ctx, CreateMessageParams{
			ConversationID: conversationID, SenderID: offender, Body: fmt.Sprintf("m%02d", i), DeliveryStatus: "sent", Kind: MessageKindUser,
		}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := repo.CreateMessage(ctx, CreateMessageParams{
		ConversationID: conversationID, SenderID: offender, Body: "offender joined the plan", DeliveryStatus: "sent", Kind: MessageKindSystem,
	}); err != nil {
		t.Fatal(err)
	}
	report, err := repo.CreateMemberReport(ctx, eventID, host, offender, "spam")
	if err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages WHERE report_id = ?`, report.ID); n != 50 {
		t.Fatalf("snapshot rows = %d, want 50", n)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages WHERE report_id = ? AND body IN ('m00', 'm09', 'offender joined the plan')`, report.ID); n != 0 {
		t.Fatalf("snapshot kept the oldest or system rows (%d)", n)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages WHERE report_id = ? AND body IN ('m10', 'm59')`, report.ID); n != 2 {
		t.Fatalf("snapshot is missing the newest rows (%d of 2)", n)
	}
}

func TestPlanReportSnapshotsOnlyReporterVisibleHostMessages(t *testing.T) {
	repo := newRetentionTestRepo(t)
	ctx := context.Background()
	host := seedNotificationActionUser(t, repo, "host")
	guestA := seedNotificationActionUser(t, repo, "guestA")
	guestB := seedNotificationActionUser(t, repo, "guestB")
	eventID := seedNotificationActionEvent(t, repo, host, "Single")
	conversationA := seedNotificationActionConversation(t, repo, eventID, host, guestA)
	conversationB := seedNotificationActionConversation(t, repo, eventID, host, guestB)
	for conversationID, body := range map[int64]string{conversationA: "to A", conversationB: "to B"} {
		if _, err := repo.CreateMessage(ctx, CreateMessageParams{
			ConversationID: conversationID, SenderID: host, Body: body, DeliveryStatus: "sent", Kind: MessageKindUser,
		}); err != nil {
			t.Fatal(err)
		}
	}
	report, err := repo.CreateEventReport(ctx, eventID, guestA, "creepy host")
	if err != nil {
		t.Fatal(err)
	}
	var subjectID int64
	var subjectName string
	if err := repo.db.QueryRow(`SELECT subject_user_id, subject_name FROM event_reports WHERE id = ?`, report.ID).Scan(&subjectID, &subjectName); err != nil {
		t.Fatal(err)
	}
	if subjectID != host || subjectName != "host" {
		t.Fatalf("plan report subject = %d/%q, want the host %d/host", subjectID, subjectName, host)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages WHERE report_id = ? AND body = 'to B'`, report.ID); n != 0 {
		t.Fatal("plan report copied the host's messages from another guest's private chat")
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_messages WHERE report_id = ? AND body = 'to A'`, report.ID); n != 1 {
		t.Fatal("plan report missed the host's messages to the reporter")
	}
}

func TestDuplicatePlanReportStillConflicts(t *testing.T) {
	f := seedMemberReportFixture(t)
	ctx := context.Background()
	if _, err := f.repo.CreateEventReport(ctx, f.eventID, f.offender, "first"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.repo.CreateEventReport(ctx, f.eventID, f.offender, "again"); !errors.Is(err, ErrReportAlreadyExists) {
		t.Fatalf("second plan report err = %v, want ErrReportAlreadyExists", err)
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM event_report_messages m LEFT JOIN event_reports r ON r.id = m.report_id WHERE r.id IS NULL`); n != 0 {
		t.Fatalf("the failed duplicate left %d orphan snapshot rows", n)
	}
}

func TestReportOnMissingPlanReturnsNotFound(t *testing.T) {
	repo := newRetentionTestRepo(t)
	if _, err := repo.CreateEventReport(context.Background(), 424242, 1, "gone"); !errors.Is(err, ErrEventNotFound) {
		t.Fatalf("err = %v, want ErrEventNotFound", err)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test -run 'Snapshot|TestDuplicatePlanReport|TestReportOnMissingPlan' -count=1 .`
Expected: FAIL — `converting NULL to string` on `event_title` (no snapshot yet), snapshot counts
of 0, and the missing-plan case returning a wrapped FK error instead of `ErrEventNotFound`.

- [ ] **Step 3: Implement**

Append to `server/repository_report_retention.go` (imports become `context`, `database/sql`,
`errors`, `fmt`, `strings`):

```go
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
```

In `server/repository_accounts.go`, make both creators delegate; the returned structs stay as
today:

```go
func (r *EventRepository) CreateEventReport(ctx context.Context, eventID, userID int64, reason string) (*EventReport, error) {
	id, err := r.insertReportWithSnapshot(ctx, eventID, userID, nil, reason)
	if err != nil {
		return nil, err
	}
	return &EventReport{
		ID:        id,
		EventID:   eventID,
		UserID:    userID,
		Reason:    reason,
		Status:    "pending",
		CreatedAt: time.Now(),
	}, nil
}

// CreateMemberReport creates a report for a specific member of an event.
// The reporter_id is the user submitting the report, reported_user_id is the target.
func (r *EventRepository) CreateMemberReport(ctx context.Context, eventID, reporterID, reportedUserID int64, reason string) (*EventReport, error) {
	id, err := r.insertReportWithSnapshot(ctx, eventID, reporterID, &reportedUserID, reason)
	if err != nil {
		return nil, err
	}
	return &EventReport{
		ID:             id,
		EventID:        eventID,
		UserID:         reporterID,
		ReportedUserID: &reportedUserID,
		Reason:         reason,
		Status:         "pending",
		CreatedAt:      time.Now(),
	}, nil
}
```

Delete `insertEventReport` and `insertMemberReport` from `repository_schema.go`. Remove any import
that becomes unused in `repository_accounts.go` (check `strings`). Both HTTP handlers
(`handler.go` ~L650, `chat_hub.go` ~L1833) already create the report before removing memberships,
so the snapshot is taken while the messages still exist — keep that order and do not touch the
handlers.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test -run 'Snapshot|TestDuplicatePlanReport|TestReportOnMissingPlan' -count=1 . && go test ./... -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repository_report_retention.go server/repository_accounts.go server/repository_schema.go server/event_report_retention_test.go
git commit -m "feat(server): snapshot plan, subject and chat evidence into reports (#184)"
```

---

### Task 4: Pseudonymous identity hashes

**Files:**
- Create: `server/identity_hash.go`
- Modify: `server/repository_schema.go` (DDL + `Init` wiring)
- Modify: `server/repository_report_retention.go` (identity copy in `insertReportWithSnapshot`,
  `RecordUserIdentityHash`, `BackfillIdentityHashes`)
- Modify: `server/auth_handler.go` (struct field, `NewAuthHandler`, `googleLogin`, `appleLogin`)
- Modify: `server/main.go`
- Test: `server/event_report_retention_test.go`

**Interfaces:**
- Consumes: `insertReportWithSnapshot` (Task 3); `subject_user_id` (Task 1); fixtures from Tasks 1–2;
  existing auth test helpers in `auth_handler_test.go`: `setupAuthTestEnv(t, googleVerifier,
  appleVerifier) *authTestEnv` (fields `repo`, `router`), `env.postJSON(t, path, body)`,
  `fakeGoogleVerifier{claims: map[string]any{...}}`,
  `fakeAppleVerifier{responses: map[string]fakeAppleResponse{token: {identity: &appleIdentity{Subject, Email, Name}}}}`;
  routes `/api/google-login`, `/api/apple-login`; env vars `GOOGLE_OAUTH_CLIENT_ID`,
  `APPLE_OAUTH_AUDIENCES`.
- Produces:
  - `const identityProviderApple = "apple"`, `identityProviderGoogle = "google"`,
    `identityProviderEmail = "email"`
  - `type IdentityHasher struct{ key []byte }`; `func newIdentityHasherFromEnv() *IdentityHasher`;
    `func (h *IdentityHasher) Hash(provider, value string) (string, bool)`
  - `func (r *EventRepository) RecordUserIdentityHash(ctx context.Context, userID int64, provider, identityHMAC string) error`
  - `func (r *EventRepository) BackfillIdentityHashes(ctx context.Context, hasher *IdentityHasher) (int, error)`
  - `AuthHandler.identityHasher *IdentityHasher`
  - tables `user_identity_hashes`, `event_report_identities`; index `event_reports_subject_idx`

- [ ] **Step 1: Write the failing tests** — append (add `"net/http"` and `"strings"` to the imports):

```go
func TestIdentityHasherIsKeyedStableAndProviderScoped(t *testing.T) {
	a := &IdentityHasher{key: []byte("key-a")}
	b := &IdentityHasher{key: []byte("key-b")}
	h1, ok := a.Hash(identityProviderGoogle, "sub-123")
	h2, _ := a.Hash(identityProviderGoogle, " sub-123 ")
	h3, _ := b.Hash(identityProviderGoogle, "sub-123")
	h4, _ := a.Hash(identityProviderApple, "sub-123")
	if !ok || h1 != h2 || h1 == h3 || h1 == h4 || len(h1) != 64 || strings.Contains(h1, "sub-123") {
		t.Fatalf("hash not keyed/stable/provider-scoped: %q %q %q %q", h1, h2, h3, h4)
	}
	e1, _ := a.Hash(identityProviderEmail, "Ava@Example.com")
	e2, _ := a.Hash(identityProviderEmail, "ava@example.com")
	if e1 != e2 {
		t.Fatal("email hashes must ignore case")
	}
	if _, ok := (*IdentityHasher)(nil).Hash(identityProviderGoogle, "sub"); ok {
		t.Fatal("a nil hasher must not produce a hash")
	}
	if _, ok := (&IdentityHasher{}).Hash(identityProviderGoogle, "sub"); ok {
		t.Fatal("an empty key must not produce a hash")
	}
	if _, ok := a.Hash(identityProviderGoogle, "  "); ok {
		t.Fatal("a blank value must not produce a hash")
	}
}

func TestReportCopiesSubjectIdentityHashesAndKeepsThemAfterDeletion(t *testing.T) {
	repo := newRetentionTestRepo(t)
	ctx := context.Background()
	host := seedNotificationActionUser(t, repo, "host")
	offender := seedNotificationActionUser(t, repo, "offender")
	eventID := seedNotificationActionEvent(t, repo, host, "Group")
	seedNotificationActionConversation(t, repo, eventID, host, offender)
	hasher := &IdentityHasher{key: []byte("k")}
	googleHash, _ := hasher.Hash(identityProviderGoogle, "offender-sub")
	emailHash, _ := hasher.Hash(identityProviderEmail, "offender@notification-actions.test")
	for provider, hash := range map[string]string{identityProviderGoogle: googleHash, identityProviderEmail: emailHash} {
		if err := repo.RecordUserIdentityHash(ctx, offender, provider, hash); err != nil {
			t.Fatal(err)
		}
	}
	report, err := repo.CreateMemberReport(ctx, eventID, host, offender, "threats")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.DeleteUserAccount(ctx, offender); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, repo, `SELECT count(*) FROM user_identity_hashes WHERE user_id = ?`, offender); n != 0 {
		t.Fatal("the live identity hashes must be deleted with the account")
	}
	if n := countRows(t, repo, `SELECT count(*) FROM event_report_identities WHERE report_id = ? AND ((provider = 'google' AND identity_hmac = ?) OR (provider = 'email' AND identity_hmac = ?))`, report.ID, googleHash, emailHash); n != 2 {
		t.Fatalf("report kept %d of the subject's 2 identity hashes", n)
	}
}

func TestRecordingHashLaterAttachesToEarlierReports(t *testing.T) {
	f := seedMemberReportFixture(t) // filed while the offender had no hashes
	ctx := context.Background()
	if n := countRows(t, f.repo, `SELECT count(*) FROM event_report_identities WHERE report_id = ?`, f.reportID); n != 0 {
		t.Fatalf("unexpected identity rows before any hash: %d", n)
	}
	hash, _ := (&IdentityHasher{key: []byte("k")}).Hash(identityProviderGoogle, "late-sub")
	for i := 0; i < 2; i++ { // recording twice must stay idempotent
		if err := f.repo.RecordUserIdentityHash(ctx, f.offender, identityProviderGoogle, hash); err != nil {
			t.Fatal(err)
		}
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM event_report_identities WHERE report_id = ? AND provider = 'google' AND identity_hmac = ?`, f.reportID, hash); n != 1 {
		t.Fatalf("hash attached to the earlier report %d times, want 1", n)
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM event_report_identities WHERE identity_hmac = ? AND report_id <> ?`, hash, f.reportID); n != 0 {
		t.Fatal("hash attached to a report about someone else")
	}
}

func TestBackfillIdentityHashesCoversEmailAndAppleAndIsIdempotent(t *testing.T) {
	repo := newRetentionTestRepo(t) // seeds "tester"
	ctx := context.Background()
	user := seedNotificationActionUser(t, repo, "apple-user")
	if err := repo.LinkAppleAccount(ctx, "apple-sub-9", user, "apple-user@notification-actions.test"); err != nil {
		t.Fatal(err)
	}
	hasher := &IdentityHasher{key: []byte("k")}
	first, err := repo.BackfillIdentityHashes(ctx, hasher)
	if err != nil {
		t.Fatal(err)
	}
	second, err := repo.BackfillIdentityHashes(ctx, hasher)
	if err != nil {
		t.Fatal(err)
	}
	if first != 3 || second != 0 {
		t.Fatalf("backfill counts = %d then %d, want 3 (two emails, one apple) then 0", first, second)
	}
	appleHash, _ := hasher.Hash(identityProviderApple, "apple-sub-9")
	emailHash, _ := hasher.Hash(identityProviderEmail, "apple-user@notification-actions.test")
	if n := countRows(t, repo, `SELECT count(*) FROM user_identity_hashes WHERE user_id = ? AND ((provider = 'apple' AND identity_hmac = ?) OR (provider = 'email' AND identity_hmac = ?))`, user, appleHash, emailHash); n != 2 {
		t.Fatalf("backfilled %d of the account's 2 hashes", n)
	}
	if n, err := repo.BackfillIdentityHashes(ctx, nil); err != nil || n != 0 {
		t.Fatalf("nil hasher backfill = %d, %v; want 0, nil", n, err)
	}
}

// NewAuthHandler reads REPORT_IDENTITY_HMAC_KEY, so it is set before the env is built.
func TestGoogleLoginRecordsIdentityHashes(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client")
	t.Setenv("REPORT_IDENTITY_HMAC_KEY", "test-key")
	env := setupAuthTestEnv(t, fakeGoogleVerifier{claims: map[string]any{
		"sub": "google-sub-1", "email": "hashme@example.test", "email_verified": true, "name": "Hash Me",
	}}, nil)
	rec := env.postJSON(t, "/api/google-login", map[string]any{"id_token": "google-token"})
	if rec.Code != http.StatusOK {
		t.Fatalf("login status %d: %s", rec.Code, rec.Body.String())
	}
	hasher := &IdentityHasher{key: []byte("test-key")}
	googleHash, _ := hasher.Hash(identityProviderGoogle, "google-sub-1")
	emailHash, _ := hasher.Hash(identityProviderEmail, "hashme@example.test")
	if n := countRows(t, env.repo, `SELECT count(*) FROM user_identity_hashes WHERE (provider = 'google' AND identity_hmac = ?) OR (provider = 'email' AND identity_hmac = ?)`, googleHash, emailHash); n != 2 {
		t.Fatalf("google login recorded %d of 2 identity hashes", n)
	}
	if n := countRows(t, env.repo, `SELECT count(*) FROM user_identity_hashes WHERE identity_hmac LIKE '%google-sub-1%' OR identity_hmac LIKE '%hashme%'`); n != 0 {
		t.Fatal("a raw identifier was stored")
	}
}

// The second sign-in takes appleLogin's existing-account early return.
func TestAppleLoginRecordsIdentityHashOnBothPaths(t *testing.T) {
	t.Setenv("APPLE_OAUTH_AUDIENCES", "com.whoelseisfree.app")
	t.Setenv("REPORT_IDENTITY_HMAC_KEY", "test-key")
	env := setupAuthTestEnv(t, nil, fakeAppleVerifier{responses: map[string]fakeAppleResponse{
		"first-token":  {identity: &appleIdentity{Subject: "apple-sub-1", Email: "apple-hash@example.test", Name: "Apple Hash"}},
		"second-token": {identity: &appleIdentity{Subject: "apple-sub-1"}},
	}})
	want, _ := (&IdentityHasher{key: []byte("test-key")}).Hash(identityProviderApple, "apple-sub-1")
	for _, token := range []string{"first-token", "second-token"} {
		if _, err := env.repo.db.Exec(`DELETE FROM user_identity_hashes`); err != nil {
			t.Fatal(err)
		}
		rec := env.postJSON(t, "/api/apple-login", map[string]any{"id_token": token})
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status %d: %s", token, rec.Code, rec.Body.String())
		}
		if n := countRows(t, env.repo, `SELECT count(*) FROM user_identity_hashes WHERE provider = 'apple' AND identity_hmac = ?`, want); n != 1 {
			t.Fatalf("%s did not record the apple identity hash", token)
		}
		if n := countRows(t, env.repo, `SELECT count(*) FROM user_identity_hashes WHERE provider = 'email'`); n != 1 {
			t.Fatalf("%s did not record the email identity hash", token)
		}
	}
}

func TestLoginWithoutIdentityKeyRecordsNothing(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client")
	t.Setenv("REPORT_IDENTITY_HMAC_KEY", "")
	env := setupAuthTestEnv(t, fakeGoogleVerifier{claims: map[string]any{
		"sub": "google-sub-2", "email": "nokey@example.test", "email_verified": true, "name": "No Key",
	}}, nil)
	rec := env.postJSON(t, "/api/google-login", map[string]any{"id_token": "google-token"})
	if rec.Code != http.StatusOK {
		t.Fatalf("login without a key must still succeed, got %d: %s", rec.Code, rec.Body.String())
	}
	if n := countRows(t, env.repo, `SELECT count(*) FROM user_identity_hashes`); n != 0 {
		t.Fatalf("recorded %d hashes without a key", n)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test -run 'IdentityHash|LoginRecords|LoginWithoutIdentityKey|BackfillIdentityHashes' -count=1 .`
Expected: FAIL to compile — `undefined: IdentityHasher`, `identityProviderGoogle`,
`RecordUserIdentityHash`, `BackfillIdentityHashes`.

- [ ] **Step 3: Implement**

`server/identity_hash.go`:

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

// Providers whose identifiers are pseudonymised for safety reports (#184).
const (
	identityProviderApple  = "apple"
	identityProviderGoogle = "google"
	identityProviderEmail  = "email"
)

// IdentityHasher pseudonymises account identifiers for safety reports: HMAC
// with a server-side key, not a plain hash, so a stored value cannot be
// checked against a known identifier by anyone without the key.
type IdentityHasher struct {
	key []byte
}

// newIdentityHasherFromEnv returns nil when REPORT_IDENTITY_HMAC_KEY is unset.
// A nil hasher hashes nothing, so reports are filed without identity rows.
func newIdentityHasherFromEnv() *IdentityHasher {
	key := strings.TrimSpace(os.Getenv("REPORT_IDENTITY_HMAC_KEY"))
	if key == "" {
		log.Println("REPORT_IDENTITY_HMAC_KEY not set; safety reports will not carry identity hashes")
		return nil
	}
	return &IdentityHasher{key: []byte(key)}
}

// Hash returns the hex HMAC-SHA256 of "provider:value", comparing emails
// case-insensitively. It returns false when hashing is not configured or the
// value is blank.
func (h *IdentityHasher) Hash(provider, value string) (string, bool) {
	value = strings.TrimSpace(value)
	if h == nil || len(h.key) == 0 || value == "" {
		return "", false
	}
	if provider == identityProviderEmail {
		value = strings.ToLower(value)
	}
	mac := hmac.New(sha256.New, h.key)
	mac.Write([]byte(provider + ":" + value))
	return hex.EncodeToString(mac.Sum(nil)), true
}
```

`server/repository_schema.go` — add the DDL:

```go
// user_identity_hashes holds HMACs of a live account's identifiers so a
// report can copy them; it is deleted with the account. Raw Google subjects
// are never stored.
const createTableUserIdentityHashes = `
CREATE TABLE IF NOT EXISTS user_identity_hashes (
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL CHECK(provider IN ('apple', 'google', 'email')),
    identity_hmac TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

// event_report_identities keeps the report subject's identity hashes for the
// report's lifetime, so a returning account can be recognised.
const createTableEventReportIdentities = `
CREATE TABLE IF NOT EXISTS event_report_identities (
    report_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    identity_hmac TEXT NOT NULL,
    PRIMARY KEY (report_id, provider),
    FOREIGN KEY (report_id) REFERENCES event_reports(id) ON DELETE CASCADE
);
`

const createEventReportsSubjectIndex = `
CREATE INDEX IF NOT EXISTS event_reports_subject_idx
ON event_reports (subject_user_id);
`
```

and in `Init`, directly after the `createEventReportMessagesReportIndex` call added in Task 1:

```go
	if _, err := r.db.ExecContext(ctx, createEventReportsSubjectIndex); err != nil {
		return fmt.Errorf("create event_reports subject index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableEventReportIdentities); err != nil {
		return fmt.Errorf("create event_report_identities table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableUserIdentityHashes); err != nil {
		return fmt.Errorf("create user_identity_hashes table: %w", err)
	}
```

`server/repository_report_retention.go` — in `insertReportWithSnapshot`, between
`snapshotReportMessages(...)` and `tx.Commit()`, copy the subject's hashes:

```go
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO event_report_identities (report_id, provider, identity_hmac)
		SELECT ?, provider, identity_hmac FROM user_identity_hashes WHERE user_id = ?;
	`, reportID, subjectID); err != nil {
		return 0, fmt.Errorf("snapshot report identities: %w", err)
	}
```

(also add "and identity hashes" to that function's doc comment), then append:

```go
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
```

`server/auth_handler.go` — add `identityHasher *IdentityHasher` to `AuthHandler`, set
`identityHasher: newIdentityHasherFromEnv(),` in `NewAuthHandler`, and add:

```go
// recordIdentityHashes is best-effort: sign-in never fails because a safety
// hash could not be written. Subjects, emails and hashes are never logged.
func (h *AuthHandler) recordIdentityHashes(parentCtx context.Context, user *User, provider, subject string) {
	ctx, cancel := context.WithTimeout(parentCtx, requestTimeout)
	defer cancel()
	for _, identity := range []struct{ provider, value string }{
		{provider, subject},
		{identityProviderEmail, user.Email},
	} {
		hash, ok := h.identityHasher.Hash(identity.provider, identity.value)
		if !ok {
			continue
		}
		if err := h.repo.RecordUserIdentityHash(ctx, user.ID, identity.provider, hash); err != nil {
			log.Printf("%s-login: failed to record %s identity hash for user %d: %v", provider, identity.provider, user.ID, err)
		}
	}
}
```

Call sites (each immediately before the `respondWithIssuedSession` it precedes):
- `googleLogin`: `subject, _ := claims["sub"].(string)` then
  `h.recordIdentityHashes(c.Request.Context(), user, identityProviderGoogle, subject)`.
- `appleLogin`, inside `case err == nil:` and again after `LinkAppleAccount` succeeds:
  `h.recordIdentityHashes(c.Request.Context(), user, identityProviderApple, subject)`.

`server/main.go` — after `authHandler := NewAuthHandler(repo, signer)`:

```go
	backfillCtx, cancelBackfill := context.WithTimeout(context.Background(), 30*time.Second)
	if hashed, err := repo.BackfillIdentityHashes(backfillCtx, authHandler.identityHasher); err != nil {
		log.Printf("failed to backfill identity hashes: %v", err)
	} else if hashed > 0 {
		log.Printf("backfilled %d identity hash(es)", hashed)
	}
	cancelBackfill()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test -run 'IdentityHash|LoginRecords|LoginWithoutIdentityKey|BackfillIdentityHashes' -count=1 . && go test ./... -count=1 && go vet ./...`
Expected: PASS, no vet findings.

- [ ] **Step 5: Commit**

```bash
git add server/identity_hash.go server/repository_schema.go server/repository_report_retention.go server/auth_handler.go server/main.go server/event_report_retention_test.go
git commit -m "feat(server): keep HMAC identity hashes with safety reports (#184)"
```

---

### Task 5: 18-month retention purge

**Files:**
- Modify: `server/repository_report_retention.go`
- Create: `server/report_retention_job.go`
- Modify: `server/main.go`
- Test: `server/event_report_retention_test.go`

**Interfaces:**
- Consumes: `seedMemberReportFixture`, `countRows` (Tasks 1–2); tables `event_report_messages`
  (Task 1) and `event_report_identities` (Task 4), both `ON DELETE CASCADE` from `event_reports`.
- Produces: `const eventReportRetentionMonths = 18`;
  `func (r *EventRepository) PurgeExpiredEventReports(ctx context.Context, now time.Time) (int64, error)`;
  `func startReportRetentionJob(ctx context.Context, repo *EventRepository, interval time.Duration)`.

- [ ] **Step 1: Write the failing test** — append:

```go
func TestPurgeExpiredEventReports(t *testing.T) {
	f := seedMemberReportFixture(t) // a fresh report, created now
	ctx := context.Background()
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC) // cutoff: 2025-04-11 12:00:00
	insert := func(createdAt string, hold int) int64 {
		res, err := f.repo.db.Exec(`
			INSERT INTO event_reports (event_id, user_id, reported_user_id, subject_user_id, reason, created_at, retention_hold)
			VALUES (NULL, NULL, 999, 999, 'old', ?, ?)`, createdAt, hold)
		if err != nil {
			t.Fatal(err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.repo.db.Exec(`INSERT INTO event_report_messages (report_id, message_id, conversation_id, body, sent_at) VALUES (?, 1, 1, 'evidence', ?)`, id, createdAt); err != nil {
			t.Fatal(err)
		}
		if _, err := f.repo.db.Exec(`INSERT INTO event_report_identities (report_id, provider, identity_hmac) VALUES (?, 'email', 'abc')`, id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	expired := insert("2025-04-11 11:59:59", 0)  // just over 18 months old
	held := insert("2024-01-01 00:00:00", 1)     // expired but under active review
	boundary := insert("2025-04-11 12:00:01", 0) // just under 18 months old

	deleted, err := f.repo.PurgeExpiredEventReports(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Fatalf("purged %d reports, want 1", deleted)
	}
	for id, want := range map[int64]int{expired: 0, held: 1, boundary: 1, f.reportID: 1} {
		if n := countRows(t, f.repo, `SELECT count(*) FROM event_reports WHERE id = ?`, id); n != want {
			t.Fatalf("report %d rows = %d, want %d", id, n, want)
		}
	}
	for _, table := range []string{"event_report_messages", "event_report_identities"} {
		if n := countRows(t, f.repo, `SELECT count(*) FROM `+table+` WHERE report_id = ?`, expired); n != 0 {
			t.Fatalf("%s rows for the expired report = %d, want 0", table, n)
		}
		if n := countRows(t, f.repo, `SELECT count(*) FROM `+table+` WHERE report_id = ?`, held); n != 1 {
			t.Fatalf("%s rows for the held report = %d, want 1", table, n)
		}
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test -run TestPurgeExpiredEventReports -count=1 .`
Expected: FAIL to compile — `f.repo.PurgeExpiredEventReports undefined`.

- [ ] **Step 3: Implement**

Append to `server/repository_report_retention.go` (add `"time"` to the imports):

```go
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
```

`server/report_retention_job.go`:

```go
package main

import (
	"context"
	"log"
	"time"
)

// startReportRetentionJob purges expired safety reports once at startup and
// then every interval until ctx ends. It logs counts only, never content.
func startReportRetentionJob(ctx context.Context, repo *EventRepository, interval time.Duration) {
	purge := func() {
		runCtx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		deleted, err := repo.PurgeExpiredEventReports(runCtx, time.Now())
		if err != nil {
			log.Printf("report retention: purge failed: %v", err)
			return
		}
		if deleted > 0 {
			log.Printf("report retention: purged %d expired report(s)", deleted)
		}
	}
	go func() {
		purge()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				purge()
			}
		}
	}()
}
```

`server/main.go`, directly before `go chatHub.Run()`:

```go
	startReportRetentionJob(context.Background(), repo, 24*time.Hour)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test -run TestPurgeExpiredEventReports -count=1 . && go test ./... -count=1 && go vet ./...`
Expected: PASS, no vet findings.

- [ ] **Step 5: Commit**

```bash
git add server/repository_report_retention.go server/report_retention_job.go server/main.go server/event_report_retention_test.go
git commit -m "feat(server): purge safety reports after 18 months unless held (#184)"
```

---

### Task 6: Documentation and migration rehearsal

**Files:**
- Create: `docs/safety-report-retention.md`
- Modify: `docs/delete-profile-functionality-plan.md` (report bullets), `AGENTS.md` (`## Backend
  Notes`), `CLAUDE.md` (`## Project`, after the `Admin support:` bullet)

**Interfaces:**
- Consumes: everything from Tasks 1–5 (names as listed in their Interfaces blocks).
- Produces: documentation only; no code changes.

- [ ] **Step 1: Write `docs/safety-report-retention.md`** with these sections, using the exact
  names and values from the code:
  1. **Purpose** — reports are the main safety record; issue #184.
  2. **What is kept** — `event_reports` (reason, status, dates, `event_title`, `subject_user_id`,
     `subject_name`, reporter/reviewer ids while those accounts exist, `retention_hold`);
     `event_report_messages` (up to 50 of the subject's most recent user messages in the plan,
     only from conversations the reporter belonged to, copied when the report is filed; legacy
     reports got a one-time copy at migration); `event_report_identities` (subject's HMAC hashes).
     "Subject" = reported member, or the host for a plan report.
  3. **Retention** — 18 months from `created_at`; `startReportRetentionJob` runs
     `PurgeExpiredEventReports` at startup and every 24h; snapshots and identities cascade. Holds:
     `UPDATE event_reports SET retention_hold = 1 WHERE id = ?;` (release with `0`); release holds
     when the review ends. The first purge after deploy removes any existing reports already older
     than 18 months.
  4. **What deletion does** — a table: reporter account deleted → `user_id` NULL; reported account
     deleted → report kept, `reported_user_id`/`subject_user_id` keep the old id (never reused);
     reviewing admin deleted → `reviewed_by` NULL; plan deleted → `event_id` NULL; blocks are still
     deleted with the account; the host's unblock action still withdraws the host's own member
     report (deliberately unchanged).
  5. **Identity hashes** — HMAC-SHA256 of `provider:value` with `REPORT_IDENTITY_HMAC_KEY`;
     providers `apple`, `google`, `email` (email lowercased). Generate with
     `openssl rand -hex 32`; set with
     `fly secrets set REPORT_IDENTITY_HMAC_KEY=<value> -a who-else-is-free-server`; without it
     reports carry no hashes and everything else works. Never rotate casually: hashes made with an
     old key no longer match. `user_identity_hashes` holds live accounts' hashes (deleted with the
     account); email and Apple hashes are backfilled at startup, Google hashes arrive at the next
     sign-in; a hash recorded later attaches to earlier reports about the same live account. Never
     log subjects, emails or hashes.
  6. **Recognising a returning account** (admin, manual) — this query:

```sql
SELECT r.id, r.created_at, r.status, r.reason
FROM user_identity_hashes h
JOIN event_report_identities i
  ON i.provider = h.provider AND i.identity_hmac = h.identity_hmac
JOIN event_reports r ON r.id = i.report_id
WHERE h.user_id = ?
  AND (r.subject_user_id IS NULL OR r.subject_user_id <> h.user_id);
```

  7. **Privacy policy** — not changed on this branch (the issue asks for it to change when this
     ships, not before). When the server change is deployed, update
     `src/content/privacyPolicyMarkdown.ts`: the retention paragraph currently says "No purpose in
     this notice will require us keeping your personal information for longer than the period of
     time in which users have an account with us.", which this change contradicts; add "Reports
     made about you, including relevant chat messages, are kept for up to 18 months to protect
     other users, even after you delete your account."
  8. **Operational rules** — same handling rules as `docs/support-data-retention.md` (no report
     content in logs, analytics, Slack or issue trackers; admin access only).
  9. **Follow-ups** — admin UI flag for new accounts matching a report; admin UI for
     `retention_hold`.

- [ ] **Step 2: Update `docs/delete-profile-functionality-plan.md`** — every bullet that says
  reports are deleted with the account or the event (search for "report") gets the current
  behaviour instead, with a pointer to `docs/safety-report-retention.md`. Keep the rest of the doc
  unchanged.

- [ ] **Step 3: Add the convention bullet** to `AGENTS.md` under `## Backend Notes` and to
  `CLAUDE.md` directly after the `Admin support:` bullet (same text in both):

```markdown
- Safety reports outlive accounts and plans (#184): `event_reports.event_id`/`user_id`/`reviewed_by`
  are `ON DELETE SET NULL`; `reported_user_id` and `subject_user_id` have no FK and keep deleted ids.
  Create reports only through `insertReportWithSnapshot`, which copies the plan title, the subject
  (reported member, or host for plan reports), the subject's last 50 messages the reporter could see
  (`event_report_messages`) and identity HMACs (`user_identity_hashes` → `event_report_identities`,
  keyed by `REPORT_IDENTITY_HMAC_KEY`). `PurgeExpiredEventReports` deletes reports after 18 months
  unless `retention_hold = 1`. Startup cleanups must never delete reports because a reference is
  NULL. See `docs/safety-report-retention.md`.
```

- [ ] **Step 4: Rehearse the migration on a copy of the local dev database.** Never touch the
  original. From the repo root:

```bash
REHEARSAL_DIR=$(mktemp -d)
cp server/event.sqlite "$REHEARSAL_DIR/event.sqlite"
```

  Then run `Init` twice against the copy with a temporary test file (not committed), for example
  `server/zz_rehearsal_test.go` that opens `openDB(os.Getenv("REHEARSAL_DB"))`, logs
  `SELECT count(*) FROM event_reports` before, runs `NewEventRepository(db).Init(ctx)` twice, and
  logs the report count after, the `pragma_foreign_key_list('event_reports')` actions,
  `PRAGMA foreign_keys`, and the count of `event_report_messages`. Run it with
  `REHEARSAL_DB="$REHEARSAL_DIR/event.sqlite" go test -run TestZZRehearsal -v -count=1 .` from
  `server/`, then delete the temporary test file and the copy. Record the before/after report
  counts (must match), the FK actions (`SET NULL`) and `foreign_keys = 1` in the report file. If
  `server/event.sqlite` does not exist, say so in the report and skip this step.

- [ ] **Step 5: Verify and commit**

Run (from `server/`): `go test ./... -count=1 && go vet ./...` — PASS. Run Prettier on the new
Markdown file if `node_modules/.bin/prettier` exists at the repo root
(`node_modules/.bin/prettier --write docs/safety-report-retention.md`); otherwise skip it and say so.

```bash
git add docs/safety-report-retention.md docs/delete-profile-functionality-plan.md AGENTS.md CLAUDE.md
git commit -m "docs: safety report retention policy and operations (#184)"
```
