package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sync"
	"testing"
	"time"
)

type recordingEmailSender struct {
	mu    sync.Mutex
	sent  []sentLoginCode
	fails error
}

type sentLoginCode struct {
	to   string
	code string
}

func (s *recordingEmailSender) SendLoginCode(_ context.Context, to, code string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fails != nil {
		return s.fails
	}
	s.sent = append(s.sent, sentLoginCode{to: to, code: code})
	return nil
}

func (s *recordingEmailSender) last(t *testing.T) sentLoginCode {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.sent) == 0 {
		t.Fatalf("no code was sent")
	}
	return s.sent[len(s.sent)-1]
}

type emailLoginTestEnv struct {
	*authTestEnv
	sender *recordingEmailSender
	now    time.Time
}

func setupEmailLoginEnv(t *testing.T) *emailLoginTestEnv {
	t.Helper()
	base := setupAuthTestEnv(t, nil, nil)
	env := &emailLoginTestEnv{authTestEnv: base, sender: &recordingEmailSender{}, now: refreshTestNow}
	base.handler.emailSender = env.sender
	base.handler.now = func() time.Time { return env.now }
	return env
}

func (env *emailLoginTestEnv) start(t *testing.T, email string) (int, string) {
	t.Helper()
	rec := env.postJSON(t, "/api/email-login/start", map[string]any{"email": email})
	return rec.Code, rec.Body.String()
}

func (env *emailLoginTestEnv) verify(t *testing.T, email, code string) (int, map[string]any) {
	t.Helper()
	rec := env.postJSON(t, "/api/email-login/verify", map[string]any{"email": email, "code": code})
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

func wrongCode(code string) string {
	if code == "000000" {
		return "111111"
	}
	return "000000"
}

func TestEmailLoginStartSendsCode(t *testing.T) {
	env := setupEmailLoginEnv(t)
	status, body := env.start(t, " Asha@Example.com ")
	if status != http.StatusOK || body != `{"status":"sent"}` {
		t.Fatalf("expected 200 {\"status\":\"sent\"}, got %d %s", status, body)
	}
	sent := env.sender.last(t)
	if sent.to != "asha@example.com" {
		t.Fatalf("expected normalised address, got %q", sent.to)
	}
	if !regexp.MustCompile(`^\d{6}$`).MatchString(sent.code) {
		t.Fatalf("expected a 6-digit code, got %q", sent.code)
	}
}

func TestEmailLoginStartSameResponseForKnownAndUnknownEmail(t *testing.T) {
	env := setupEmailLoginEnv(t)
	if _, err := env.repo.CreateUserWithPassword(context.Background(), "Known", "known@example.com", "x"); err != nil {
		t.Fatalf("create user: %v", err)
	}
	_, known := env.start(t, "known@example.com")
	_, unknown := env.start(t, "unknown@example.com")
	if known != unknown {
		t.Fatalf("responses differ: %q vs %q", known, unknown)
	}
}

func TestEmailLoginStartRejectsInvalidEmail(t *testing.T) {
	env := setupEmailLoginEnv(t)
	for _, email := range []string{"", "not-an-email", "Asha <asha@example.com>", "asha@localhost"} {
		status, body := env.start(t, email)
		if status != http.StatusBadRequest || body != `{"error":"Enter a valid email address."}` {
			t.Fatalf("%q: expected 400 invalid email, got %d %s", email, status, body)
		}
	}
}

func TestEmailLoginVerifyCreatesUserAndSession(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.start(t, "new@example.com")
	status, body := env.verify(t, "new@example.com", env.sender.last(t).code)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d %v", status, body)
	}
	if body["is_new_user"] != true || body["refresh_token"] == "" || body["token"] == "" {
		t.Fatalf("unexpected session body: %v", body)
	}
	user, _ := body["user"].(map[string]any)
	if user["profile_complete"] != false || user["email"] != "new@example.com" {
		t.Fatalf("unexpected user: %v", user)
	}
}

func TestEmailLoginVerifyMatchesExistingGoogleAccount(t *testing.T) {
	env := setupEmailLoginEnv(t)
	existing, err := env.repo.CreateUserWithPassword(context.Background(), "Asha", "asha@gmail.com", "x")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	env.start(t, " Asha@Gmail.com ")
	status, body := env.verify(t, " Asha@Gmail.com ", env.sender.last(t).code)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d %v", status, body)
	}
	user, _ := body["user"].(map[string]any)
	if int64(user["id"].(float64)) != existing.ID || body["is_new_user"] != false {
		t.Fatalf("expected existing user %d, got %v", existing.ID, body)
	}
}

func TestEmailLoginVerifyWrongCodeThenExpiresAfterFiveAttempts(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.start(t, "asha@example.com")
	code := env.sender.last(t).code
	for i := 1; i <= 4; i++ {
		status, body := env.verify(t, "asha@example.com", wrongCode(code))
		if status != http.StatusUnauthorized || body["code"] != "code_invalid" ||
			body["error"] != "That code isn't right. Check it and try again." {
			t.Fatalf("attempt %d: expected code_invalid, got %d %v", i, status, body)
		}
	}
	status, body := env.verify(t, "asha@example.com", wrongCode(code))
	if status != http.StatusUnauthorized || body["code"] != "code_expired" ||
		body["error"] != "This code has expired. Request a new one." {
		t.Fatalf("fifth attempt: expected code_expired, got %d %v", status, body)
	}
	status, body = env.verify(t, "asha@example.com", code)
	if status != http.StatusUnauthorized || body["code"] != "code_expired" {
		t.Fatalf("correct code after lockout: expected code_expired, got %d %v", status, body)
	}
}

func TestEmailLoginCodeIsSingleUse(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.start(t, "asha@example.com")
	code := env.sender.last(t).code
	if status, body := env.verify(t, "asha@example.com", code); status != http.StatusOK {
		t.Fatalf("first verify: expected 200, got %d %v", status, body)
	}
	status, body := env.verify(t, "asha@example.com", code)
	if status != http.StatusUnauthorized || body["code"] != "code_expired" {
		t.Fatalf("second verify: expected code_expired, got %d %v", status, body)
	}
}

func TestEmailLoginCodeExpiresAfterTenMinutes(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.start(t, "asha@example.com")
	code := env.sender.last(t).code
	env.now = env.now.Add(emailCodeTTL + time.Second)
	status, body := env.verify(t, "asha@example.com", code)
	if status != http.StatusUnauthorized || body["code"] != "code_expired" {
		t.Fatalf("expected code_expired, got %d %v", status, body)
	}
}

func TestEmailLoginNewCodeInvalidatesOld(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.start(t, "asha@example.com")
	first := env.sender.last(t).code
	env.now = env.now.Add(61 * time.Second)
	env.start(t, "asha@example.com")
	second := env.sender.last(t).code
	if first != second {
		if status, body := env.verify(t, "asha@example.com", first); status != http.StatusUnauthorized {
			t.Fatalf("old code must not work, got %d %v", status, body)
		}
	}
	if status, body := env.verify(t, "asha@example.com", second); status != http.StatusOK {
		t.Fatalf("new code: expected 200, got %d %v", status, body)
	}
}

func TestEmailLoginStartRateLimitsPerAddress(t *testing.T) {
	env := setupEmailLoginEnv(t)
	if status, _ := env.start(t, "asha@example.com"); status != http.StatusOK {
		t.Fatalf("first start: expected 200, got %d", status)
	}
	status, body := env.start(t, "asha@example.com")
	if status != http.StatusTooManyRequests ||
		body != `{"error":"Too many codes requested. Wait a minute and try again."}` {
		t.Fatalf("expected 429, got %d %s", status, body)
	}
}

func TestEmailLoginStartReturns503WithoutSender(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.handler.emailSender = nil
	status, body := env.start(t, "asha@example.com")
	if status != http.StatusServiceUnavailable || body != `{"error":"Email sign-in isn't available right now."}` {
		t.Fatalf("expected 503, got %d %s", status, body)
	}
}

func TestEmailLoginStartDeletesCodeWhenSendFails(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.sender.fails = errors.New("provider down")
	status, body := env.start(t, "asha@example.com")
	if status != http.StatusBadGateway || body != `{"error":"We couldn't send the code. Please try again."}` {
		t.Fatalf("expected 502, got %d %s", status, body)
	}
	var open int
	if err := env.repo.db.QueryRow(`SELECT COUNT(*) FROM email_login_codes WHERE email = ?`, "asha@example.com").Scan(&open); err != nil {
		t.Fatalf("count codes: %v", err)
	}
	if open != 0 {
		t.Fatalf("expected the unsent code to be deleted, found %d", open)
	}
}

func TestEmailLoginVerifyRejectsMalformedCode(t *testing.T) {
	env := setupEmailLoginEnv(t)
	rec := env.postJSON(t, "/api/email-login/verify", map[string]any{"email": "asha@example.com", "code": "12ab"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPurgeExpiredEmailLoginCodes(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.start(t, "asha@example.com")
	deleted, err := env.repo.PurgeExpiredEmailLoginCodes(context.Background(), env.now.Add(emailCodeTTL+25*time.Hour))
	if err != nil || deleted != 1 {
		t.Fatalf("expected 1 purged code, got %d (%v)", deleted, err)
	}
}

// seedEmailCodes stores codes as if they were sent at `at`, outside the
// in-memory limiters (as after a deploy restarts the server).
func (env *emailLoginTestEnv) seedEmailCodes(t *testing.T, email string, count int, at time.Time) {
	t.Helper()
	for i := 0; i < count; i++ {
		if _, err := env.repo.CreateEmailLoginCode(context.Background(), email, fmt.Sprintf("seed-%d", i), at.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("seed code: %v", err)
		}
	}
}

func TestEmailLoginStartCapsCodesPerAddressPerDayAcrossRestarts(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.seedEmailCodes(t, "asha@example.com", emailCodesPerAddressPerDay, env.now.Add(-23*time.Hour))

	status, _ := env.start(t, "asha@example.com")
	if status != http.StatusTooManyRequests {
		t.Fatalf("expected 429 once the daily per-address cap is reached, got %d", status)
	}
	if status, _ := env.start(t, "ravi@example.com"); status != http.StatusOK {
		t.Fatalf("another address must be unaffected, got %d", status)
	}
}

func TestEmailLoginStartDailyCapIgnoresCodesOlderThanADay(t *testing.T) {
	env := setupEmailLoginEnv(t)
	env.seedEmailCodes(t, "asha@example.com", emailCodesPerAddressPerDay, env.now.Add(-25*time.Hour))

	if status, _ := env.start(t, "asha@example.com"); status != http.StatusOK {
		t.Fatalf("codes from over a day ago must not count, got %d", status)
	}
}
