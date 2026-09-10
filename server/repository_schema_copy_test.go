package main

import (
	"context"
	"testing"
)

func readMessageBody(t *testing.T, repo *EventRepository, id int64) string {
	t.Helper()
	var body string
	if err := repo.db.QueryRowContext(context.Background(), `SELECT body FROM messages WHERE id = ?;`, id).Scan(&body); err != nil {
		t.Fatalf("read message %d: %v", id, err)
	}
	return body
}

func TestBackfillSystemMessageCopy_RewritesLegacySystemBodiesIdempotently(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID)

	create := func(body string, kind MessageKind) int64 {
		t.Helper()
		message, err := repo.CreateMessage(ctx, CreateMessageParams{
			ConversationID: conversationID,
			SenderID:       hostID,
			Body:           body,
			DeliveryStatus: "sent",
			Kind:           kind,
		})
		if err != nil {
			t.Fatalf("create %q: %v", body, err)
		}
		return message.ID
	}
	legacyJoin := create("Tester joined the chat", MessageKindSystem)
	legacyUpdate := create("Updated Event Detail", MessageKindSystem)
	currentJoin := create("Member2 joined the plan", MessageKindSystem)
	userAuthored := create("we all joined the chat", MessageKindUser)

	for run := 1; run <= 2; run++ {
		if err := repo.backfillSystemMessageCopy(ctx); err != nil {
			t.Fatalf("backfill run %d: %v", run, err)
		}
		if got := readMessageBody(t, repo, legacyJoin); got != "Tester joined the plan" {
			t.Fatalf("run %d legacy join body = %q", run, got)
		}
		if got := readMessageBody(t, repo, legacyUpdate); got != "Plan details updated" {
			t.Fatalf("run %d legacy update body = %q", run, got)
		}
		if got := readMessageBody(t, repo, currentJoin); got != "Member2 joined the plan" {
			t.Fatalf("run %d current join body = %q", run, got)
		}
		if got := readMessageBody(t, repo, userAuthored); got != "we all joined the chat" {
			t.Fatalf("run %d user-authored body was rewritten to %q", run, got)
		}
	}
}
