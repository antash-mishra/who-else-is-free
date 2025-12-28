package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type apiTestEnv struct {
	server   *httptest.Server
	repo     *EventRepository
	signer   *tokenSigner
	db       *sql.DB
	wsScheme string
}

func setupAPITestEnv(t *testing.T) *apiTestEnv {
	t.Helper()

	tmpFile, err := os.CreateTemp("", "who-else-is-free-*.sqlite")
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

	_ = os.Setenv("CHAT_SESSION_SECRET", "test-session-secret")
	_ = os.Setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client")

	signer, err := newTokenSignerFromEnv()
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}

	eventHandler := NewEventHandler(repo)
	authHandler := NewAuthHandler(repo, signer)
	hub := NewChatHub(repo, signer)
	go hub.Run()

	router := setupRouter(eventHandler, authHandler, hub, signer)
	ts := httptest.NewServer(router)

	t.Cleanup(func() {
		ts.Close()
		db.Close()
		os.Remove(tmpFile.Name())
	})

	parsedURL, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("parse test server url: %v", err)
	}

	wsScheme := "ws"
	if parsedURL.Scheme == "https" {
		wsScheme = "wss"
	}

	return &apiTestEnv{
		server:   ts,
		repo:     repo,
		signer:   signer,
		db:       db,
		wsScheme: wsScheme,
	}
}

func (env *apiTestEnv) issueTokenForEmail(t *testing.T, email string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	user, err := env.repo.GetUserByEmail(ctx, email)
	if err != nil {
		t.Fatalf("get user %s: %v", email, err)
	}

	token, _, err := env.signer.issue(user.ID, user.Email)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return token
}

func (env *apiTestEnv) doRequest(t *testing.T, method, path, token string, body any) *http.Response {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(payload)
	} else {
		reader = bytes.NewReader(nil)
	}

	req, err := http.NewRequest(method, env.server.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("perform request: %v", err)
	}
	return resp
}

func decodeJSON[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	defer resp.Body.Close()
	var out T
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode json: %v", err)
	}
	return out
}

type eventsResponse struct {
	Data []Event `json:"data"`
}

type createEventResponse struct {
	ID int64 `json:"id"`
}

type conversationsResponse struct {
	Conversations []struct {
		ID int64 `json:"id"`
	} `json:"conversations"`
}

type messagesResponse struct {
	Messages []struct {
		ID        int64  `json:"id"`
		Body      string `json:"body"`
		CreatedAt string `json:"createdAt"`
	} `json:"messages"`
}

type wsEnvelope struct {
	Type    string `json:"type"`
	TempID  string `json:"tempId"`
	Message struct {
		ID             int64  `json:"id"`
		ConversationID int64  `json:"conversationId"`
		SenderID       int64  `json:"senderId"`
		Body           string `json:"body"`
	} `json:"message"`
}

func TestAPIIntegration(t *testing.T) {
	env := setupAPITestEnv(t)

	t.Run("list events", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/events", "", nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[eventsResponse](t, resp)
		if len(payload.Data) == 0 {
			t.Fatal("expected seeded events, got none")
		}
	})

	token := env.issueTokenForEmail(t, "ava@example.com")

	t.Run("create event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Test Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(24 * time.Hour).Format("2006-01-02"),
			Description: "Integration event",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			DateLabel:   "Tmrw",
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
			UserID:      1,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", token, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		if payload.ID == 0 {
			t.Fatal("expected created event id")
		}
	})

	// Server no longer enforces "future-only" event schedule constraints;
	// the mobile client performs this validation using the user's local timezone.

	t.Run("list conversations", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", token, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		if len(payload.Conversations) == 0 {
			t.Fatal("expected at least one conversation")
		}

		conversationID := payload.Conversations[0].ID
		respMessages := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", conversationID), token, nil)
		if respMessages.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", respMessages.StatusCode)
		}
		messages := decodeJSON[messagesResponse](t, respMessages)
		if len(messages.Messages) == 0 {
			t.Fatal("expected seeded messages")
		}
	})

	t.Run("websocket messaging", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", token, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		if len(payload.Conversations) == 0 {
			t.Fatal("no conversations to test websocket")
		}
		conversationID := payload.Conversations[0].ID

		dialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(token)

		conn, _, err := websocket.DefaultDialer.Dial(dialURL, nil)
		if err != nil {
			t.Fatalf("websocket dial: %v", err)
		}
		defer conn.Close()

		tempID := fmt.Sprintf("temp-%d", time.Now().UnixNano())
		msgBody := "integration websocket message"
		sendPayload := map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           msgBody,
			"tempId":         tempID,
		}
		if err := conn.WriteJSON(sendPayload); err != nil {
			t.Fatalf("ws send: %v", err)
		}

		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var envelope wsEnvelope
		if err := conn.ReadJSON(&envelope); err != nil {
			t.Fatalf("ws read: %v", err)
		}
		if envelope.Type != "message:new" {
			t.Fatalf("expected message:new, got %s", envelope.Type)
		}
		if envelope.Message.Body != msgBody {
			t.Fatalf("expected body %q, got %q", msgBody, envelope.Message.Body)
		}

		respMessages := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", conversationID), token, nil)
		if respMessages.StatusCode != http.StatusOK {
			t.Fatalf("messages fetch expected 200, got %d", respMessages.StatusCode)
		}
		messages := decodeJSON[messagesResponse](t, respMessages)
		found := false
		for _, m := range messages.Messages {
			if m.Body == msgBody {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("persisted messages did not include %q", msgBody)
		}
	})
}

type testJoinRequestResponse struct {
	Request struct {
		ID      int64  `json:"id"`
		EventID int64  `json:"event_id"`
		UserID  int64  `json:"user_id"`
		Status  string `json:"status"`
		Message string `json:"message"`
	} `json:"request"`
}

type testErrorResponse struct {
	Error string `json:"error"`
}

type testMessageResponse struct {
	Message string `json:"message"`
}

type testReportResponse struct {
	Report struct {
		ID      int64  `json:"id"`
		EventID int64  `json:"event_id"`
		UserID  int64  `json:"user_id"`
		Reason  string `json:"reason"`
		Status  string `json:"status"`
	} `json:"report"`
}

func TestCancelJoinRequest(t *testing.T) {
	env := setupAPITestEnv(t)

	// Get tokens for users
	// User 1 (ava) owns event 1
	// User 2 (liam) owns event 2
	// User 3 (sophia) owns event 3
	// User 4 (noah) doesn't own any events in seed data

	// We need to create a fresh event and have a user that's not already a member request to join
	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user id 1
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user id 4

	// First, create a new event as ava so we have a clean slate
	var newEventID int64
	t.Run("setup - create event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Cancel Test Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(24 * time.Hour).Format("2006-01-02"),
			Description: "For cancel request test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			DateLabel:   "Tmrw",
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		newEventID = payload.ID
	})

	// Noah sends a join request for the new event
	t.Run("create join request", func(t *testing.T) {
		body := map[string]string{"message": "I'd like to join!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", newEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[testJoinRequestResponse](t, resp)
		if payload.Request.Status != "pending" {
			t.Fatalf("expected pending status, got %s", payload.Request.Status)
		}
	})

	// Verify the request exists
	t.Run("verify request exists", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/chat/requests/me", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var payload struct {
			Requests []struct {
				EventID int64 `json:"event_id"`
			} `json:"requests"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("decode: %v", err)
		}
		resp.Body.Close()
		found := false
		for _, r := range payload.Requests {
			if r.EventID == newEventID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected to find pending request for event %d", newEventID)
		}
	})

	// Cancel the request
	t.Run("cancel join request", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/requests/me", newEventID), noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[testMessageResponse](t, resp)
		if payload.Message != "request cancelled" {
			t.Fatalf("expected 'request cancelled', got %s", payload.Message)
		}
	})

	// Verify the request no longer exists
	t.Run("verify request cancelled", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/chat/requests/me", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var payload struct {
			Requests []struct {
				EventID int64 `json:"event_id"`
			} `json:"requests"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("decode: %v", err)
		}
		resp.Body.Close()
		for _, r := range payload.Requests {
			if r.EventID == newEventID {
				t.Fatal("request should have been cancelled")
			}
		}
	})

	// Try to cancel a non-existent request
	t.Run("cancel non-existent request returns 404", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/requests/me", newEventID), noahToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	// Cannot cancel without auth
	t.Run("cancel without auth returns 401", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/requests/me", newEventID), "", nil)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	// Invalid event ID
	t.Run("cancel with invalid event id returns 400", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, "/api/events/invalid/chat/requests/me", noahToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})
}

func TestReportEvent(t *testing.T) {
	env := setupAPITestEnv(t)

	noahToken := env.issueTokenForEmail(t, "noah@example.com")     // user id 4
	sophiaToken := env.issueTokenForEmail(t, "sophia@example.com") // user id 3

	// Report an event successfully
	t.Run("report event successfully", func(t *testing.T) {
		body := map[string]string{"reason": "This event contains inappropriate content"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/1/report", noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[testReportResponse](t, resp)
		if payload.Report.EventID != 1 {
			t.Fatalf("expected event_id 1, got %d", payload.Report.EventID)
		}
		if payload.Report.Status != "pending" {
			t.Fatalf("expected pending status, got %s", payload.Report.Status)
		}
		if payload.Report.Reason != "This event contains inappropriate content" {
			t.Fatalf("unexpected reason: %s", payload.Report.Reason)
		}
	})

	// Try to report the same event again (should get 409)
	t.Run("duplicate report returns 409", func(t *testing.T) {
		body := map[string]string{"reason": "Reporting again"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/1/report", noahToken, body)
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("expected 409, got %d", resp.StatusCode)
		}
		payload := decodeJSON[testErrorResponse](t, resp)
		if payload.Error != "you have already reported this event" {
			t.Fatalf("unexpected error: %s", payload.Error)
		}
	})

	// Different user can report the same event
	t.Run("different user can report same event", func(t *testing.T) {
		body := map[string]string{"reason": "Also reporting this event"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/1/report", sophiaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	// Report without reason returns 400
	t.Run("report without reason returns 400", func(t *testing.T) {
		body := map[string]string{"reason": ""}
		resp := env.doRequest(t, http.MethodPost, "/api/events/2/report", noahToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	// Report without auth returns 401
	t.Run("report without auth returns 401", func(t *testing.T) {
		body := map[string]string{"reason": "Test reason"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/1/report", "", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	// Report non-existent event returns 404
	t.Run("report non-existent event returns 404", func(t *testing.T) {
		body := map[string]string{"reason": "Test reason"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/99999/report", noahToken, body)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	// Invalid event ID returns 400
	t.Run("report with invalid event id returns 400", func(t *testing.T) {
		body := map[string]string{"reason": "Test reason"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/invalid/report", noahToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})
}

func TestReportEventCancelsPendingRequest(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user id 1
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user id 4

	// Create a new event as ava
	var newEventID int64
	t.Run("setup - create event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Report Cancel Test Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(24 * time.Hour).Format("2006-01-02"),
			Description: "For report cancels request test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			DateLabel:   "Tmrw",
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		newEventID = payload.ID
	})

	// Noah sends a join request
	t.Run("create join request", func(t *testing.T) {
		body := map[string]string{"message": "I'd like to join this event!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", newEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	// Verify the request exists
	t.Run("verify request exists before report", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/chat/requests/me", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var payload struct {
			Requests []struct {
				EventID int64 `json:"event_id"`
			} `json:"requests"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("decode: %v", err)
		}
		resp.Body.Close()
		found := false
		for _, r := range payload.Requests {
			if r.EventID == newEventID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected to find pending request for event %d", newEventID)
		}
	})

	// Noah reports the event
	t.Run("report event", func(t *testing.T) {
		body := map[string]string{"reason": "This event seems suspicious"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/report", newEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	// Verify the pending request was cancelled
	t.Run("verify request cancelled after report", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/chat/requests/me", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var payload struct {
			Requests []struct {
				EventID int64 `json:"event_id"`
			} `json:"requests"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("decode: %v", err)
		}
		resp.Body.Close()
		for _, r := range payload.Requests {
			if r.EventID == newEventID {
				t.Fatal("pending request should have been cancelled after reporting")
			}
		}
	})
}

func TestCancelAndReportWorkflow(t *testing.T) {
	env := setupAPITestEnv(t)

	noahToken := env.issueTokenForEmail(t, "noah@example.com")

	// Simulate the full workflow: create request, cancel it, then report
	t.Run("full cancel and report workflow", func(t *testing.T) {
		// Create join request
		body := map[string]string{"message": "Want to join event 2"}
		resp := env.doRequest(t, http.MethodPost, "/api/events/2/chat/requests", noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create request: expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Cancel join request
		resp = env.doRequest(t, http.MethodDelete, "/api/events/2/chat/requests/me", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("cancel request: expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Report the event
		reportBody := map[string]string{"reason": "Suspicious activity"}
		resp = env.doRequest(t, http.MethodPost, "/api/events/2/report", noahToken, reportBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("report event: expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Can create a new join request after cancelling
		body = map[string]string{"message": "Changed my mind, want to join again"}
		resp = env.doRequest(t, http.MethodPost, "/api/events/2/chat/requests", noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create new request after cancel: expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})
}
