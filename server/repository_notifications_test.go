package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func newNotificationsTestRepo(t *testing.T) *EventRepository {
	t.Helper()
	db, err := openDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	repo := NewEventRepository(db)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := repo.Init(ctx); err != nil {
		t.Fatalf("init repo: %v", err)
	}
	// Seed a user to own notifications (FK on user_id).
	if _, err := repo.CreateUserWithPassword(ctx, "tester", "tester@example.test", "pw"); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return repo
}

func TestCreateNotification_PersistsRow(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	uid := int64(1)
	eid := int64(42)
	cid := int64(7)

	n, err := repo.CreateNotification(ctx, Notification{
		UserID:         uid,
		Type:           "chat.message",
		EventID:        &eid,
		ConversationID: &cid,
		Title:          "Alice",
		Body:           "Alice: hello there",
		Payload:        `{"foo":"bar"}`,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if n.ID == 0 {
		t.Fatal("expected non-zero id")
	}
	if n.CreatedAt.IsZero() {
		t.Fatal("expected set created_at")
	}
	if n.Read {
		t.Fatal("new notification should be unread")
	}
	if n.ActionState != NotificationActionActive {
		t.Fatalf("action state = %q, want active", n.ActionState)
	}
	if n.EventID == nil || *n.EventID != eid {
		t.Fatalf("event id = %v, want %d", n.EventID, eid)
	}
	if n.ConversationID == nil || *n.ConversationID != cid {
		t.Fatalf("conversation id = %v, want %d", n.ConversationID, cid)
	}
	if n.Payload != `{"foo":"bar"}` {
		t.Fatalf("payload = %q", n.Payload)
	}
}

func TestCreateNotification_PersistsActionContract(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	joinRequestID := int64(91)
	reason := NotificationReasonRequestApproved
	resolvedAt := time.Now().UTC().Truncate(time.Second)

	n, err := repo.CreateNotification(ctx, Notification{
		UserID:           1,
		Type:             NotificationTypeJoinRequestCreated,
		JoinRequestID:    &joinRequestID,
		Title:            "Hike",
		Body:             "Alice wants to join your event",
		ActionState:      NotificationActionResolved,
		ActionReason:     &reason,
		ActionResolvedAt: &resolvedAt,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if n.ActionState != NotificationActionResolved {
		t.Fatalf("action state = %q, want resolved", n.ActionState)
	}
	if !n.Read {
		t.Fatal("inactive task notification must be read")
	}
	if n.ActionReason == nil || *n.ActionReason != reason {
		t.Fatalf("action reason = %v, want %q", n.ActionReason, reason)
	}
	if n.ActionResolvedAt == nil || !n.ActionResolvedAt.Equal(resolvedAt) {
		t.Fatalf("resolved at = %v, want %v", n.ActionResolvedAt, resolvedAt)
	}
	if n.JoinRequestID == nil || *n.JoinRequestID != joinRequestID {
		t.Fatalf("join request id = %v, want %d", n.JoinRequestID, joinRequestID)
	}

	rows, err := repo.ListNotifications(ctx, 1, 20, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 || rows[0].ActionState != NotificationActionResolved {
		t.Fatalf("listed rows = %+v", rows)
	}
}

func TestCreateNotification_RejectsInvalidActionState(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	_, err := repo.CreateNotification(context.Background(), Notification{
		UserID:      1,
		Type:        NotificationTypeChatMessage,
		Title:       "Hike",
		Body:        "hello",
		ActionState: NotificationActionState("stale"),
	})
	if err == nil {
		t.Fatal("expected invalid action state error")
	}
}

func TestInitMigratesAndBackfillsLegacyNotificationActions(t *testing.T) {
	db, err := openDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	ctx := context.Background()

	if _, err := db.ExecContext(ctx, createTableUsers); err != nil {
		t.Fatalf("create legacy users: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users (name, email, password) VALUES ('Host', 'host@example.test', 'pw');`); err != nil {
		t.Fatalf("insert legacy user: %v", err)
	}
	const legacyNotifications = `
		CREATE TABLE notifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			type TEXT NOT NULL,
			event_id INTEGER,
			conversation_id INTEGER,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			payload TEXT,
			read INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`
	if _, err := db.ExecContext(ctx, legacyNotifications); err != nil {
		t.Fatalf("create legacy notifications: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO notifications (user_id, type, event_id, title, body)
		VALUES (1, 'join_request.created', 999, 'Gone event', 'Alice wants to join');
	`); err != nil {
		t.Fatalf("insert legacy notification: %v", err)
	}

	repo := NewEventRepository(db)
	if err := repo.Init(ctx); err != nil {
		t.Fatalf("first init: %v", err)
	}
	rows, err := repo.ListNotifications(ctx, 1, 20, 0)
	if err != nil {
		t.Fatalf("list migrated notifications: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("row count = %d, want 1", len(rows))
	}
	migrated := rows[0]
	if migrated.ActionState != NotificationActionUnavailable || !migrated.Read {
		t.Fatalf("migrated notification = %+v, want unavailable and read", migrated)
	}
	if migrated.ActionReason == nil || *migrated.ActionReason != NotificationReasonEventDeleted {
		t.Fatalf("action reason = %v, want event_deleted", migrated.ActionReason)
	}
	if migrated.ActionResolvedAt == nil {
		t.Fatal("expected action_resolved_at backfill")
	}
	firstResolvedAt := *migrated.ActionResolvedAt

	if err := repo.Init(ctx); err != nil {
		t.Fatalf("second init: %v", err)
	}
	rows, err = repo.ListNotifications(ctx, 1, 20, 0)
	if err != nil {
		t.Fatalf("list after second init: %v", err)
	}
	if len(rows) != 1 || rows[0].ActionResolvedAt == nil || !rows[0].ActionResolvedAt.Equal(firstResolvedAt) {
		t.Fatalf("rerun changed migrated row: before=%v after=%+v", firstResolvedAt, rows)
	}
}

func TestBackfillNotificationActionState_ResolvesLegacyRequestWithoutPendingWork(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	result, err := repo.db.ExecContext(ctx, `
		INSERT INTO events (
			user_id, title, location, time, event_date, gender, min_age, max_age,
			date_label, group_type, cover_key
		) VALUES (1, 'Hike', 'Trail', '10:00', '2099-01-01', 'Everyone', 18, 99, 'Today', 'Group', 'sports-badminton-1');
	`)
	if err != nil {
		t.Fatalf("insert event: %v", err)
	}
	eventID, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("event id: %v", err)
	}
	if _, err := repo.CreateNotification(ctx, Notification{
		UserID:  1,
		Type:    NotificationTypeJoinRequestCreated,
		EventID: &eventID,
		Title:   "Hike",
		Body:    "Alice wants to join your event",
	}); err != nil {
		t.Fatalf("create notification: %v", err)
	}

	if err := repo.backfillNotificationActionState(ctx); err != nil {
		t.Fatalf("backfill: %v", err)
	}
	rows, err := repo.ListNotifications(ctx, 1, 20, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 || rows[0].ActionState != NotificationActionResolved || !rows[0].Read {
		t.Fatalf("backfilled rows = %+v", rows)
	}
	if rows[0].ActionReason != nil {
		t.Fatalf("ambiguous legacy resolution reason = %v, want nil", rows[0].ActionReason)
	}
}

func TestListNotifications_OrderingAndPagination(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	uid := int64(1)

	// Insert 25 rows; created_at from CURRENT_TIMESTAMP may tie across inserts
	// within the same second, so the id DESC tie-break must keep order stable.
	for i := 0; i < 25; i++ {
		if _, err := repo.CreateNotification(ctx, Notification{
			UserID: uid,
			Type:   "event.deleted",
			Title:  "E",
			Body:   "B",
		}); err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}

	page1, err := repo.ListNotifications(ctx, uid, 20, 0)
	if err != nil {
		t.Fatalf("list page1: %v", err)
	}
	if len(page1) != 20 {
		t.Fatalf("page1 len = %d, want 20", len(page1))
	}
	// Newest first => highest id first.
	for i := 1; i < len(page1); i++ {
		if page1[i-1].ID < page1[i].ID {
			t.Fatalf("page1 not desc by id: row %d id=%d before row %d id=%d", i-1, page1[i-1].ID, i, page1[i].ID)
		}
		if page1[i-1].CreatedAt.Before(page1[i].CreatedAt) {
			t.Fatalf("page1 not desc by created_at")
		}
	}

	page2, err := repo.ListNotifications(ctx, uid, 20, 20)
	if err != nil {
		t.Fatalf("list page2: %v", err)
	}
	if len(page2) != 5 {
		t.Fatalf("page2 len = %d, want 5", len(page2))
	}

	// No overlap between pages.
	seen := map[int64]bool{}
	for _, n := range page1 {
		seen[n.ID] = true
	}
	for _, n := range page2 {
		if seen[n.ID] {
			t.Fatalf("dup id %d across pages", n.ID)
		}
	}
}

func TestCountUnreadNotifications(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	uid := int64(1)

	if count, err := repo.CountUnreadNotifications(ctx, uid); err != nil || count != 0 {
		t.Fatalf("initial count = %d, err %v, want 0", count, err)
	}
	for i := 0; i < 3; i++ {
		if _, err := repo.CreateNotification(ctx, Notification{UserID: uid, Type: "chat.message", Title: "T", Body: "B"}); err != nil {
			t.Fatalf("create: %v", err)
		}
	}
	if _, err := repo.CreateNotification(ctx, Notification{
		UserID:      uid,
		Type:        NotificationTypeChatMessage,
		Title:       "Handled",
		Body:        "B",
		ActionState: NotificationActionResolved,
	}); err != nil {
		t.Fatalf("create inactive: %v", err)
	}
	if count, err := repo.CountUnreadNotifications(ctx, uid); err != nil || count != 3 {
		t.Fatalf("count = %d, err %v, want 3 active rows", count, err)
	}
}

func TestMarkNotificationRead_ScopedToOwner(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()

	// Two users.
	if _, err := repo.CreateUserWithPassword(ctx, "other", "other@example.test", "pw"); err != nil {
		t.Fatalf("seed user2: %v", err)
	}
	owner := int64(1)
	other := int64(2)

	n, err := repo.CreateNotification(ctx, Notification{UserID: owner, Type: "chat.message", Title: "T", Body: "B"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Other user cannot mark owner's notification.
	if err := repo.MarkNotificationRead(ctx, other, n.ID); !errors.Is(err, ErrNotificationNotFound) {
		t.Fatalf("cross-user mark err = %v, want ErrNotificationNotFound", err)
	}
	// Still unread for owner.
	if count, err := repo.CountUnreadNotifications(ctx, owner); err != nil || count != 1 {
		t.Fatalf("owner unread = %d, want 1 (other user's mark must not apply)", count)
	}
	// Owner marks their own.
	if err := repo.MarkNotificationRead(ctx, owner, n.ID); err != nil {
		t.Fatalf("owner mark: %v", err)
	}
	if count, err := repo.CountUnreadNotifications(ctx, owner); err != nil || count != 0 {
		t.Fatalf("owner unread = %d, want 0", count)
	}
	// Marking an already-read / non-existent row returns not found.
	if err := repo.MarkNotificationRead(ctx, owner, n.ID); !errors.Is(err, ErrNotificationNotFound) {
		t.Fatalf("re-mark err = %v, want ErrNotificationNotFound", err)
	}
	if err := repo.MarkNotificationRead(ctx, owner, 999999); !errors.Is(err, ErrNotificationNotFound) {
		t.Fatalf("missing-id mark err = %v, want ErrNotificationNotFound", err)
	}
}

func TestMarkAllNotificationsRead(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	owner := int64(1)
	other := int64(2)
	if _, err := repo.CreateUserWithPassword(ctx, "other", "other@example.test", "pw"); err != nil {
		t.Fatalf("seed user2: %v", err)
	}

	for i := 0; i < 3; i++ {
		if _, err := repo.CreateNotification(ctx, Notification{UserID: owner, Type: "chat.message", Title: "T", Body: "B"}); err != nil {
			t.Fatalf("create owner: %v", err)
		}
	}
	if _, err := repo.CreateNotification(ctx, Notification{UserID: other, Type: "chat.message", Title: "T", Body: "B"}); err != nil {
		t.Fatalf("create other: %v", err)
	}

	if err := repo.MarkAllNotificationsRead(ctx, owner); err != nil {
		t.Fatalf("mark all: %v", err)
	}
	if count, err := repo.CountUnreadNotifications(ctx, owner); err != nil || count != 0 {
		t.Fatalf("owner unread = %d, want 0", count)
	}
	// Other user's rows are untouched.
	if count, err := repo.CountUnreadNotifications(ctx, other); err != nil || count != 1 {
		t.Fatalf("other unread = %d, want 1 (mark-all must be user-scoped)", count)
	}
	// Visible rows are now read.
	list, err := repo.ListNotifications(ctx, owner, 20, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, n := range list {
		if !n.Read {
			t.Fatalf("row %d still unread after mark-all", n.ID)
		}
	}
}
