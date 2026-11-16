package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestCloudflareSender(baseURL string) *cloudflareEmailSender {
	return &cloudflareEmailSender{
		accountID:   "acct-123",
		apiToken:    "send-token",
		fromAddress: "login@mail.weifapp.com",
		fromName:    "weif",
		baseURL:     baseURL,
		client:      http.DefaultClient,
	}
}

func TestCloudflareSenderPostsExpectedRequest(t *testing.T) {
	var gotPath, gotAuth string
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{"success":true,"errors":[],"messages":[],"result":{"delivered":["asha@example.com"],"permanent_bounces":[],"queued":[]}}`))
	}))
	defer server.Close()

	if err := newTestCloudflareSender(server.URL).SendLoginCode(context.Background(), "asha@example.com", "123456"); err != nil {
		t.Fatalf("send: %v", err)
	}

	if gotPath != "/accounts/acct-123/email/sending/send" {
		t.Fatalf("unexpected path %q", gotPath)
	}
	if gotAuth != "Bearer send-token" {
		t.Fatalf("unexpected auth header %q", gotAuth)
	}
	if body["to"] != "asha@example.com" {
		t.Fatalf("unexpected to: %v", body["to"])
	}
	from, _ := body["from"].(map[string]any)
	if from["address"] != "login@mail.weifapp.com" || from["name"] != "weif" {
		t.Fatalf("unexpected from: %v", body["from"])
	}
	if body["subject"] != "Your weif code: 123456" {
		t.Fatalf("unexpected subject: %v", body["subject"])
	}
	text, _ := body["text"].(string)
	if !strings.Contains(text, "Your weif sign-in code is 123456.") || !strings.Contains(text, "It expires in 10 minutes.") {
		t.Fatalf("unexpected text body: %q", text)
	}
	html, _ := body["html"].(string)
	if !strings.Contains(html, "123456") {
		t.Fatalf("html body must contain the code: %q", html)
	}
}

func TestCloudflareSenderFailsOnPermanentBounce(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"errors":[],"messages":[],"result":{"delivered":[],"permanent_bounces":["asha@example.com"],"queued":[]}}`))
	}))
	defer server.Close()

	err := newTestCloudflareSender(server.URL).SendLoginCode(context.Background(), "asha@example.com", "123456")
	if err == nil {
		t.Fatalf("expected an error for a bounced recipient")
	}
	if strings.Contains(err.Error(), "asha@example.com") {
		t.Fatalf("error must not contain the address: %v", err)
	}
}

func TestCloudflareSenderFailsOnHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":10000,"message":"internal"}]}`))
	}))
	defer server.Close()

	if err := newTestCloudflareSender(server.URL).SendLoginCode(context.Background(), "asha@example.com", "123456"); err == nil {
		t.Fatalf("expected an error for HTTP 500")
	}
}

func TestNewEmailSenderFromEnvReturnsNilWhenUnconfigured(t *testing.T) {
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "")
	t.Setenv("CLOUDFLARE_EMAIL_API_TOKEN", "")
	t.Setenv("EMAIL_LOGIN_FROM", "")
	t.Setenv("EMAIL_LOGIN_DEV_LOG_CODES", "")
	if sender := newEmailSenderFromEnv(); sender != nil {
		t.Fatalf("expected no sender, got %T", sender)
	}
}

func TestNewEmailSenderFromEnvUsesCloudflareWhenConfigured(t *testing.T) {
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "acct")
	t.Setenv("CLOUDFLARE_EMAIL_API_TOKEN", "token")
	t.Setenv("EMAIL_LOGIN_FROM", "login@mail.weifapp.com")
	if _, ok := newEmailSenderFromEnv().(*cloudflareEmailSender); !ok {
		t.Fatalf("expected a Cloudflare sender")
	}
}
