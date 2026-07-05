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
		Token     string `json:"token"`
		IsNewUser bool   `json:"is_new_user"`
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
	if payload.IsNewUser {
		t.Fatal("expected seeded user login to return is_new_user=false")
	}
}

func TestGoogleLoginReturnsIsNewUserForFirstSignup(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client")

	google := fakeGoogleVerifier{
		claims: map[string]any{
			"email":          "brand-new@example.com",
			"email_verified": true,
			"name":           "Brand New",
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
		IsNewUser bool `json:"is_new_user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.User.Email != "brand-new@example.com" {
		t.Fatalf("expected user email brand-new@example.com, got %s", payload.User.Email)
	}
	if !payload.IsNewUser {
		t.Fatal("expected first-time Google auth to return is_new_user=true")
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
	var firstPayload struct {
		IsNewUser bool `json:"is_new_user"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("decode first response: %v", err)
	}
	if firstPayload.IsNewUser {
		t.Fatal("expected Apple link to existing seeded email to return is_new_user=false")
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
	var secondPayload struct {
		IsNewUser bool `json:"is_new_user"`
	}
	if err := json.Unmarshal(second.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("decode second response: %v", err)
	}
	if secondPayload.IsNewUser {
		t.Fatal("expected Apple subject login to return is_new_user=false")
	}
}

func TestAppleLoginReturnsIsNewUserForFirstSignup(t *testing.T) {
	t.Setenv("APPLE_OAUTH_AUDIENCES", "com.whoelseisfree.app")

	apple := fakeAppleVerifier{
		responses: map[string]fakeAppleResponse{
			"new-token": {
				identity: &appleIdentity{
					Subject: "apple-sub-new",
					Email:   "new-apple@example.com",
					Name:    "New Apple",
				},
			},
		},
	}

	env := setupAuthTestEnv(t, fakeGoogleVerifier{}, apple)

	rec := env.postJSON(t, "/api/apple-login", map[string]any{"id_token": "new-token"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	var payload struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
		IsNewUser bool `json:"is_new_user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.User.Email != "new-apple@example.com" {
		t.Fatalf("expected user email new-apple@example.com, got %s", payload.User.Email)
	}
	if !payload.IsNewUser {
		t.Fatal("expected first-time Apple auth to return is_new_user=true")
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

// setupAuthTestEnvWithDevLogin mirrors setupAuthTestEnv but registers the
// dev-login route. DEV_LOGIN_ENABLED must be set BEFORE NewAuthHandler runs,
// so we cannot reuse the shared helper; we rebuild the env here.
func setupAuthTestEnvWithDevLogin(t *testing.T, googleVerifier googleTokenVerifier, appleVerifier appleTokenVerifier) *authTestEnv {
	t.Helper()

	gin.SetMode(gin.TestMode)
	t.Setenv("CHAT_SESSION_SECRET", "test-session-secret")
	t.Setenv("DEV_LOGIN_ENABLED", "1")

	tmpFile, err := os.CreateTemp("", "who-else-is-free-auth-dev-*.sqlite")
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

func TestDevLoginDisabledByDefault(t *testing.T) {
	// DEV_LOGIN_ENABLED is not set in setupAuthTestEnv, so the route is
	// unregistered and Gin returns 404.
	env := setupAuthTestEnv(t, fakeGoogleVerifier{}, nil)
	rec := env.postJSON(t, "/api/dev-login", map[string]any{
		"email": "tester@who-else-is-free.test",
		"name":  "Tester",
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when dev-login is disabled, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestDevLoginIssuesSession(t *testing.T) {
	env := setupAuthTestEnvWithDevLogin(t, fakeGoogleVerifier{}, nil)
	rec := env.postJSON(t, "/api/dev-login", map[string]any{
		"email":            "tester@who-else-is-free.test",
		"name":             "Tester",
		"profile_complete": true,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	var payload struct {
		User struct {
			ID              int64  `json:"id"`
			Email           string `json:"email"`
			Name            string `json:"name"`
			ProfileComplete bool   `json:"profile_complete"`
		} `json:"user"`
		Token     string `json:"token"`
		IsNewUser bool   `json:"is_new_user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.User.Email != "tester@who-else-is-free.test" {
		t.Fatalf("expected email tester@who-else-is-free.test, got %s", payload.User.Email)
	}
	if payload.User.Name != "Tester" {
		t.Fatalf("expected name Tester, got %s", payload.User.Name)
	}
	if payload.Token == "" {
		t.Fatal("expected session token in response")
	}
	if payload.IsNewUser {
		t.Fatal("dev-login must always report is_new_user=false (it never surfaces user creation semantics)")
	}
	if !payload.User.ProfileComplete {
		t.Fatal("dev-login should mark profile_complete=true when profile_complete:true was requested")
	}
}

func TestDevLoginIsIdempotentAcrossCalls(t *testing.T) {
	env := setupAuthTestEnvWithDevLogin(t, fakeGoogleVerifier{}, nil)

	rec1 := env.postJSON(t, "/api/dev-login", map[string]any{
		"email":            "tester@who-else-is-free.test",
		"name":             "Tester",
		"profile_complete": true,
	})
	if rec1.Code != http.StatusOK {
		t.Fatalf("first call expected 200, got %d (%s)", rec1.Code, rec1.Body.String())
	}
	var p1 struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec1.Body.Bytes(), &p1)

	rec2 := env.postJSON(t, "/api/dev-login", map[string]any{
		"email":            "tester@who-else-is-free.test",
		"name":             "Tester",
		"profile_complete": true,
	})
	if rec2.Code != http.StatusOK {
		t.Fatalf("second call expected 200, got %d (%s)", rec2.Code, rec2.Body.String())
	}
	var p2 struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec2.Body.Bytes(), &p2)

	if p1.User.ID != p2.User.ID {
		t.Fatalf("dev-login must reuse the existing user: got %d then %d", p1.User.ID, p2.User.ID)
	}
}
