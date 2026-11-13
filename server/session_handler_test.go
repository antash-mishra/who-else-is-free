package main

import (
	"encoding/json"
	"net/http"
	"testing"
)

type issuedSessionBody struct {
	User struct {
		ID int64 `json:"id"`
	} `json:"user"`
	Token            string `json:"token"`
	ExpiresAt        string `json:"expires_at"`
	RefreshToken     string `json:"refresh_token"`
	RefreshExpiresAt string `json:"refresh_expires_at"`
	IsNewUser        bool   `json:"is_new_user"`
}

func devLoginSession(t *testing.T) (*authTestEnv, issuedSessionBody) {
	t.Helper()
	t.Setenv("DEV_LOGIN_ENABLED", "1")
	env := setupAuthTestEnv(t, nil, nil)
	rec := env.postJSON(t, "/api/dev-login", map[string]any{"email": "tester@example.com", "name": "Tester"})
	if rec.Code != http.StatusOK {
		t.Fatalf("dev-login: expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var body issuedSessionBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode dev-login: %v", err)
	}
	return env, body
}

func TestSignInReturnsRefreshToken(t *testing.T) {
	_, body := devLoginSession(t)
	if body.RefreshToken == "" || body.RefreshExpiresAt == "" {
		t.Fatalf("expected refresh_token and refresh_expires_at, got %+v", body)
	}
}

func TestSessionRefreshIssuesNewTokens(t *testing.T) {
	env, signedIn := devLoginSession(t)

	rec := env.postJSON(t, "/api/session/refresh", map[string]any{"refresh_token": signedIn.RefreshToken})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var refreshed issuedSessionBody
	if err := json.Unmarshal(rec.Body.Bytes(), &refreshed); err != nil {
		t.Fatalf("decode refresh: %v", err)
	}
	if refreshed.RefreshToken == "" || refreshed.RefreshToken == signedIn.RefreshToken {
		t.Fatalf("expected a rotated refresh token, got %q", refreshed.RefreshToken)
	}
	if refreshed.IsNewUser {
		t.Fatalf("refresh must not report a new user")
	}
	signer, err := newTokenSignerFromEnv()
	if err != nil {
		t.Fatalf("signer: %v", err)
	}
	claims, err := signer.verify(refreshed.Token)
	if err != nil {
		t.Fatalf("refreshed token does not verify: %v", err)
	}
	if claims.UserID != signedIn.User.ID || refreshed.User.ID != signedIn.User.ID {
		t.Fatalf("expected user %d, got claims %d body %d", signedIn.User.ID, claims.UserID, refreshed.User.ID)
	}
}

func TestSessionRefreshRejectsUnknownKey(t *testing.T) {
	env, _ := devLoginSession(t)
	rec := env.postJSON(t, "/api/session/refresh", map[string]any{"refresh_token": "nope"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["error"] != "session expired, please sign in again" {
		t.Fatalf("unexpected error body: %v", body)
	}
}

func TestSessionLogoutRevokesKey(t *testing.T) {
	env, signedIn := devLoginSession(t)
	rec := env.postJSON(t, "/api/session/logout", map[string]any{"refresh_token": signedIn.RefreshToken})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	rec = env.postJSON(t, "/api/session/refresh", map[string]any{"refresh_token": signedIn.RefreshToken})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after logout, got %d", rec.Code)
	}
}
