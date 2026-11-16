package main

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

func newRefreshTestRepo(t *testing.T) (*EventRepository, int64) {
	t.Helper()
	tmpFile, err := os.CreateTemp("", "who-else-is-free-refresh-*.sqlite")
	if err != nil {
		t.Fatalf("create temp db: %v", err)
	}
	tmpFile.Close()
	db, err := openDB(tmpFile.Name())
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
		_ = os.Remove(tmpFile.Name())
	})
	repo := NewEventRepository(db)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := repo.Init(ctx); err != nil {
		t.Fatalf("init repo: %v", err)
	}
	user, err := repo.CreateUserWithPassword(ctx, "Riya", "riya@example.com", "placeholder")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return repo, user.ID
}

var refreshTestNow = time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)

func mustIssueRefresh(t *testing.T, repo *EventRepository, userID int64) string {
	t.Helper()
	raw, _, err := repo.IssueRefreshToken(context.Background(), userID, refreshTestNow)
	if err != nil {
		t.Fatalf("issue refresh token: %v", err)
	}
	return raw
}

func mustRotate(t *testing.T, repo *EventRepository, raw string, now time.Time) string {
	t.Helper()
	_, next, _, err := repo.RotateRefreshToken(context.Background(), raw, now)
	if err != nil {
		t.Fatalf("rotate refresh token: %v", err)
	}
	return next
}

func TestRotateRefreshTokenReturnsNewKeyForSameUser(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	raw := mustIssueRefresh(t, repo, userID)

	now := refreshTestNow.Add(time.Hour)
	gotUser, next, expiresAt, err := repo.RotateRefreshToken(context.Background(), raw, now)
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if gotUser != userID {
		t.Fatalf("expected user %d, got %d", userID, gotUser)
	}
	if next == "" || next == raw {
		t.Fatalf("expected a new key, got %q", next)
	}
	if !expiresAt.Equal(now.Add(refreshTokenTTL)) {
		t.Fatalf("expected expiry %v, got %v", now.Add(refreshTokenTTL), expiresAt)
	}
}

func TestRotateRefreshTokenAllowsReplayUntilSuccessorUsed(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)

	_ = mustRotate(t, repo, key, refreshTestNow.Add(time.Minute))          // response lost
	second := mustRotate(t, repo, key, refreshTestNow.Add(10*time.Minute)) // phone retries with old key
	_ = mustRotate(t, repo, second, refreshTestNow.Add(time.Hour))
}

func TestRotateRefreshTokenDetectsReuseAfterSuccessorUsed(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)
	successor := mustRotate(t, repo, key, refreshTestNow.Add(time.Minute))
	latest := mustRotate(t, repo, successor, refreshTestNow.Add(time.Hour))

	_, _, _, err := repo.RotateRefreshToken(context.Background(), key, refreshTestNow.Add(2*time.Hour))
	if !errors.Is(err, ErrRefreshTokenReused) {
		t.Fatalf("expected ErrRefreshTokenReused, got %v", err)
	}
	_, _, _, err = repo.RotateRefreshToken(context.Background(), latest, refreshTestNow.Add(3*time.Hour))
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("expected family revoked (ErrRefreshTokenInvalid), got %v", err)
	}
}

func TestUsingOneSiblingRetiresTheOther(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)
	_ = mustRotate(t, repo, key, refreshTestNow.Add(time.Minute))
	second := mustRotate(t, repo, key, refreshTestNow.Add(2*time.Minute))

	third := mustRotate(t, repo, second, refreshTestNow.Add(time.Hour))
	// The device moved on through `second`; its newest key keeps working.
	_ = mustRotate(t, repo, third, refreshTestNow.Add(2*time.Hour))
}

func TestRetiredSiblingReuseRevokesFamily(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)
	first := mustRotate(t, repo, key, refreshTestNow.Add(time.Minute))
	second := mustRotate(t, repo, key, refreshTestNow.Add(2*time.Minute))
	third := mustRotate(t, repo, second, refreshTestNow.Add(time.Hour))

	_, _, _, err := repo.RotateRefreshToken(context.Background(), first, refreshTestNow.Add(2*time.Hour))
	if !errors.Is(err, ErrRefreshTokenReused) {
		t.Fatalf("a retired sibling presented later must count as reuse, got %v", err)
	}
	_, _, _, err = repo.RotateRefreshToken(context.Background(), third, refreshTestNow.Add(3*time.Hour))
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("reuse must revoke the device's current key too, got %v", err)
	}
}

func TestSignedOutKeyIsInvalidNotReuse(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)
	if err := repo.RevokeRefreshTokenFamily(context.Background(), key, refreshTestNow); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	_, _, _, err := repo.RotateRefreshToken(context.Background(), key, refreshTestNow.Add(time.Minute))
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("expected ErrRefreshTokenInvalid after sign-out, got %v", err)
	}
}

func TestRotateRefreshTokenRejectsExpired(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)

	_, _, _, err := repo.RotateRefreshToken(context.Background(), key, refreshTestNow.Add(refreshTokenTTL+time.Second))
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("expected ErrRefreshTokenInvalid, got %v", err)
	}
}

func TestRotateRefreshTokenRejectsUnknownKey(t *testing.T) {
	repo, _ := newRefreshTestRepo(t)
	_, _, _, err := repo.RotateRefreshToken(context.Background(), "not-a-key", refreshTestNow)
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("expected ErrRefreshTokenInvalid, got %v", err)
	}
}

func TestRefreshTokensDeletedWithUser(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)
	if _, err := repo.DeleteUserAccount(context.Background(), userID); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	_, _, _, err := repo.RotateRefreshToken(context.Background(), key, refreshTestNow.Add(time.Minute))
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("expected ErrRefreshTokenInvalid, got %v", err)
	}
}

func TestRevokeRefreshTokenFamily(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	key := mustIssueRefresh(t, repo, userID)
	successor := mustRotate(t, repo, key, refreshTestNow.Add(time.Minute))

	if err := repo.RevokeRefreshTokenFamily(context.Background(), key, refreshTestNow.Add(2*time.Minute)); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	_, _, _, err := repo.RotateRefreshToken(context.Background(), successor, refreshTestNow.Add(3*time.Minute))
	if !errors.Is(err, ErrRefreshTokenInvalid) {
		t.Fatalf("expected ErrRefreshTokenInvalid, got %v", err)
	}
	if err := repo.RevokeRefreshTokenFamily(context.Background(), "unknown", refreshTestNow); err != nil {
		t.Fatalf("revoking an unknown key should be a no-op, got %v", err)
	}
}

func TestPurgeExpiredRefreshTokens(t *testing.T) {
	repo, userID := newRefreshTestRepo(t)
	ctx := context.Background()
	expired := mustIssueRefresh(t, repo, userID)
	revoked, _, err := repo.IssueRefreshToken(ctx, userID, refreshTestNow.Add(refreshTokenTTL))
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if err := repo.RevokeRefreshTokenFamily(ctx, revoked, refreshTestNow.Add(refreshTokenTTL)); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	purgeAt := refreshTestNow.Add(refreshTokenTTL + 8*24*time.Hour)
	live, _, err := repo.IssueRefreshToken(ctx, userID, purgeAt)
	if err != nil {
		t.Fatalf("issue live: %v", err)
	}

	deleted, err := repo.PurgeExpiredRefreshTokens(ctx, purgeAt)
	if err != nil {
		t.Fatalf("purge: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("expected 2 purged rows, got %d", deleted)
	}
	_ = expired
	_ = mustRotate(t, repo, live, purgeAt.Add(time.Minute))
}
