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
