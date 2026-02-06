package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeGoogleVerifier struct {
	claims map[string]any
	err    error
}

func (f fakeGoogleVerifier) Validate(_ context.Context, _ string, _ string) (map[string]any, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.claims, nil
}

type fakeAppleVerifier struct {
	responses map[string]fakeAppleResponse
}

type fakeAppleResponse struct {
	identity *appleIdentity
	err      error
}

func (f fakeAppleVerifier) Verify(_ context.Context, idToken string, _ []string) (*appleIdentity, error) {
	response, ok := f.responses[idToken]
	if !ok {
		return nil, errors.New("unknown token")
	}
	if response.err != nil {
		return nil, response.err
	}
	return response.identity, nil
}

type authTestEnv struct {
	repo   *EventRepository
	router *gin.Engine
}

func setupAuthTestEnv(t *testing.T, googleVerifier googleTokenVerifier, appleVerifier appleTokenVerifier) *authTestEnv {
	t.Helper()

	gin.SetMode(gin.TestMode)
	t.Setenv("CHAT_SESSION_SECRET", "test-session-secret")

	tmpFile, err := os.CreateTemp("", "who-else-is-free-auth-*.sqlite")
	if err != nil {
		t.Fatalf("create temp db: %v", err)
	}
	tmpFile.Close()

	db, err := openDB(tmpFile.Name())
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}

	repo := NewEventRepository(db)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := repo.Init(ctx); err != nil {
		t.Fatalf("init repo: %v", err)
	}
	if err := repo.EnsureSeedData(ctx); err != nil {
		t.Fatalf("seed repo: %v", err)
	}

	signer, err := newTokenSignerFromEnv()
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}

	handler := NewAuthHandler(repo, signer)
	if googleVerifier != nil {
		handler.googleVerifier = googleVerifier
	}
	if appleVerifier != nil {
		handler.appleVerifier = appleVerifier
	}

	router := gin.New()
	api := router.Group("/api")
	handler.RegisterRoutes(api)

	t.Cleanup(func() {
		_ = db.Close()
		_ = os.Remove(tmpFile.Name())
	})

	return &authTestEnv{repo: repo, router: router}
}

func (env *authTestEnv) postJSON(t *testing.T, path string, body any) *httptest.ResponseRecorder {
	t.Helper()

	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request body: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	env.router.ServeHTTP(rec, req)
	return rec
}

func TestGoogleLoginSuccess(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client")

	google := fakeGoogleVerifier{
		claims: map[string]any{
			"email":          "ava@example.com",
			"email_verified": true,
			"name":           "Ava Test",
		},
	}

	env := setupAuthTestEnv(t, google, nil)
	rec := env.postJSON(t, "/api/google-login", map[string]any{"id_token": "google-token"})

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	var payload struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.User.Email != "ava@example.com" {
		t.Fatalf("expected user email ava@example.com, got %s", payload.User.Email)
	}
	if payload.Token == "" {
		t.Fatal("expected session token in response")
	}
}

func TestAppleLoginLinksByEmailAndAllowsSubsequentTokenWithoutEmail(t *testing.T) {
	t.Setenv("APPLE_OAUTH_AUDIENCES", "com.whoelseisfree.app")

	apple := fakeAppleVerifier{
		responses: map[string]fakeAppleResponse{
			"first-token": {
				identity: &appleIdentity{
					Subject: "apple-sub-123",
					Email:   "ava@example.com",
					Name:    "Ava Apple",
				},
			},
			"second-token": {
				identity: &appleIdentity{
					Subject: "apple-sub-123",
					Email:   "",
				},
			},
		},
	}

	env := setupAuthTestEnv(t, fakeGoogleVerifier{}, apple)

	first := env.postJSON(t, "/api/apple-login", map[string]any{"id_token": "first-token"})
	if first.Code != http.StatusOK {
		t.Fatalf("first login expected 200, got %d (%s)", first.Code, first.Body.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	linkedUser, err := env.repo.GetUserByAppleSubject(ctx, "apple-sub-123")
	if err != nil {
		t.Fatalf("lookup linked user: %v", err)
	}
	if linkedUser.Email != "ava@example.com" {
		t.Fatalf("expected linked user email ava@example.com, got %s", linkedUser.Email)
	}

	second := env.postJSON(t, "/api/apple-login", map[string]any{"id_token": "second-token"})
	if second.Code != http.StatusOK {
		t.Fatalf("second login expected 200, got %d (%s)", second.Code, second.Body.String())
	}
}

func TestAppleLoginFailsWhenEmailMissingAndNoSubjectLinkExists(t *testing.T) {
	t.Setenv("APPLE_OAUTH_AUDIENCES", "com.whoelseisfree.app")

	apple := fakeAppleVerifier{
		responses: map[string]fakeAppleResponse{
			"no-email-token": {
				identity: &appleIdentity{
					Subject: "apple-sub-no-email",
				},
			},
		},
	}

	env := setupAuthTestEnv(t, fakeGoogleVerifier{}, apple)
	rec := env.postJSON(t, "/api/apple-login", map[string]any{"id_token": "no-email-token"})

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestAppleLoginFailsWhenAudiencesNotConfigured(t *testing.T) {
	t.Setenv("APPLE_OAUTH_AUDIENCES", "")

	apple := fakeAppleVerifier{
		responses: map[string]fakeAppleResponse{
			"any-token": {
				identity: &appleIdentity{
					Subject: "apple-sub-1",
					Email:   "ava@example.com",
				},
			},
		},
	}

	env := setupAuthTestEnv(t, fakeGoogleVerifier{}, apple)
	rec := env.postJSON(t, "/api/apple-login", map[string]any{"id_token": "any-token"})

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d (%s)", rec.Code, rec.Body.String())
	}
}
