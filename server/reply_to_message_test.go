package main

import (
	"context"
	"testing"
)

func TestReplyToMessageStaysInConversation(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()
	alice, err := env.repo.CreateUserWithPassword(
		ctx,
		"Reply Alice",
		"reply-alice@example.com",
		"test-password",
	)
	if err != nil {
		t.Fatalf("create Alice: %v", err)
	}
	bob, err := env.repo.CreateUserWithPassword(
		ctx,
		"Reply Bob",
		"reply-bob@example.com",
		"test-password",
	)
	if err != nil {
		t.Fatalf("create Bob: %v", err)
	}

	firstConversation, err := env.repo.CreateConversation(ctx, nil, alice.ID, []int64{alice.ID, bob.ID}, nil)
	if err != nil {
		t.Fatalf("create first conversation: %v", err)
	}
	secondConversation, err := env.repo.CreateConversation(ctx, nil, alice.ID, []int64{alice.ID, bob.ID}, nil)
	if err != nil {
		t.Fatalf("create second conversation: %v", err)
	}

	firstMessage, err := env.repo.CreateMessage(ctx, CreateMessageParams{
		ConversationID: firstConversation.ID,
		SenderID:       bob.ID,
		Body:           "Message in the first conversation",
		DeliveryStatus: "sent",
		Kind:           MessageKindUser,
	})
	if err != nil {
		t.Fatalf("create first message: %v", err)
	}
	secondMessage, err := env.repo.CreateMessage(ctx, CreateMessageParams{
		ConversationID: secondConversation.ID,
		SenderID:       bob.ID,
		Body:           "Private message in the second conversation",
		DeliveryStatus: "sent",
		Kind:           MessageKindUser,
	})
	if err != nil {
		t.Fatalf("create second message: %v", err)
	}

	validTarget := firstMessage.ID
	validInbound := inboundEnvelope{
		ConversationID:   firstConversation.ID,
		ReplyToMessageID: &validTarget,
	}
	if got := validatedReplyToID(ctx, validInbound, env.repo); got == nil || *got != firstMessage.ID {
		t.Fatalf("expected same-conversation reply target %d, got %v", firstMessage.ID, got)
	}
	missingTarget := int64(999999)
	missingInbound := inboundEnvelope{
		ConversationID:   firstConversation.ID,
		ReplyToMessageID: &missingTarget,
	}
	if got := validatedReplyToID(ctx, missingInbound, env.repo); got != nil {
		t.Fatalf("expected missing reply target to be rejected, got %d", *got)
	}

	crossConversationTarget := secondMessage.ID
	crossConversationInbound := inboundEnvelope{
		ConversationID:   firstConversation.ID,
		ReplyToMessageID: &crossConversationTarget,
	}
	if got := validatedReplyToID(ctx, crossConversationInbound, env.repo); got != nil {
		t.Fatalf("expected cross-conversation reply target to be rejected, got %d", *got)
	}

	reply, err := env.repo.CreateMessage(ctx, CreateMessageParams{
		ConversationID:   firstConversation.ID,
		SenderID:         alice.ID,
		Body:             "A reply in the first conversation",
		DeliveryStatus:   "sent",
		Kind:             MessageKindUser,
		ReplyToMessageID: validatedReplyToID(ctx, validInbound, env.repo),
	})
	if err != nil {
		t.Fatalf("create reply: %v", err)
	}
	if reply.ReplyToMessageID == nil || *reply.ReplyToMessageID != firstMessage.ID {
		t.Fatalf("reply target was not persisted: %+v", reply.ReplyToMessageID)
	}

	latest, err := env.repo.fetchLatestMessage(ctx, firstConversation.ID)
	if err != nil {
		t.Fatalf("fetch latest message: %v", err)
	}
	if latest == nil || latest.ReplyTo == nil || latest.ReplyTo.ID != firstMessage.ID {
		t.Fatalf("expected latest summary to retain reply target, got %+v", latest)
	}
}
