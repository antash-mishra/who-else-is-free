package main

import (
	"context"
	"errors"
	"testing"
)

func TestForgetIfUnregisteredDeletesOnlyUnregisteredTokens(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	for _, token := range []string{"dead-token", "live-token"} {
		if err := repo.UpsertPushToken(ctx, 1, token, "device-"+token, "android"); err != nil {
			t.Fatalf("upsert %s: %v", token, err)
		}
	}

	errUnregistered := errors.New("NotRegistered")
	original := isUnregisteredToken
	isUnregisteredToken = func(err error) bool { return errors.Is(err, errUnregistered) }
	t.Cleanup(func() { isUnregisteredToken = original })

	sender := &fcmPushSender{tokens: repo}
	sender.forgetIfUnregistered(ctx, "dead-token", errUnregistered)
	// Any other failure, such as a bad APNs credential, keeps the token.
	sender.forgetIfUnregistered(ctx, "live-token", errors.New("Invalid APNs credential."))

	tokens, err := repo.ListPushTokensByUser(ctx, 1)
	if err != nil {
		t.Fatalf("list tokens: %v", err)
	}
	if len(tokens) != 1 || tokens[0].Token != "live-token" {
		t.Fatalf("tokens after pruning = %+v, want only live-token", tokens)
	}

	// Forgetting a token that is already gone is not an error.
	if err := repo.DeleteUnregisteredPushToken(ctx, "dead-token"); err != nil {
		t.Fatalf("delete missing token: %v", err)
	}
}
