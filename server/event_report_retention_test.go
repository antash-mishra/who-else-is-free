package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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

func TestUnblockSurvivesRestartAfterPlanDeletion(t *testing.T) {
	f := seedMemberReportFixture(t)
	ctx := context.Background()
	if err := f.repo.CreateMutualBlock(ctx, f.host, f.offender); err != nil {
		t.Fatal(err)
	}
	if err := f.repo.Delete(ctx, f.eventID, f.host); err != nil {
		t.Fatalf("delete plan: %v", err)
	}
	if _, err := f.repo.DeleteMutualBlock(ctx, f.host, f.offender); err != nil {
		t.Fatalf("unblock: %v", err)
	}
	initCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := f.repo.Init(initCtx); err != nil {
		t.Fatalf("restart: %v", err)
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM user_blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?)`, f.host, f.offender, f.offender, f.host); n != 0 {
		t.Fatalf("restart re-created %d block rows the host removed", n)
	}
	if n := countRows(t, f.repo, `SELECT count(*) FROM event_reports WHERE id = ?`, f.reportID); n != 1 {
		t.Fatal("the retained report must survive")
	}
}

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
