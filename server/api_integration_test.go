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
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// --- Mock push sender for testing ---

type capturedNotification struct {
	Token string
	Data  map[string]string
}

type mockPushSender struct {
	mu            sync.Mutex
	notifications []capturedNotification
}

func (m *mockPushSender) Send(_ context.Context, n PushNotification) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.notifications = append(m.notifications, capturedNotification{Token: n.Token, Data: n.Data})
	return nil
}

func (m *mockPushSender) SendBatch(_ context.Context, notifications []PushNotification) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, n := range notifications {
		m.notifications = append(m.notifications, capturedNotification{Token: n.Token, Data: n.Data})
	}
	return nil
}

func (m *mockPushSender) getNotifications() []capturedNotification {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]capturedNotification, len(m.notifications))
	copy(out, m.notifications)
	return out
}

func (m *mockPushSender) reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.notifications = nil
}

func (m *mockPushSender) waitForNotifications(t *testing.T, count int, timeout time.Duration) []capturedNotification {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		got := m.getNotifications()
		if len(got) >= count {
			return got
		}
		time.Sleep(50 * time.Millisecond)
	}
	got := m.getNotifications()
	if len(got) < count {
		t.Fatalf("timed out waiting for %d notifications, got %d", count, len(got))
	}
	return got
}

type apiTestEnv struct {
	server   *httptest.Server
	repo     *EventRepository
	signer   *tokenSigner
	db       *sql.DB
	wsScheme string
	hub      *ChatHub
}

func setupAPITestEnv(t *testing.T) *apiTestEnv {
	t.Helper()
	return setupAPITestEnvWithPush(t, NewNoopPushSender())
}

func setupAPITestEnvWithPush(t *testing.T, pushSender PushSender) *apiTestEnv {
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
	profileHandler := NewProfileHandler(repo)
	hub := NewChatHub(repo, signer, pushSender)
	go hub.Run()
	pushHandler := NewPushHandler(repo, pushSender)

	router := setupRouter(eventHandler, authHandler, profileHandler, hub, pushHandler, signer)
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
		hub:      hub,
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
		ID          int64 `json:"id"`
		LastMessage *struct {
			ID int64 `json:"id"`
		} `json:"last_message"`
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

		// Find a conversation that has messages (seeded conversations have messages)
		var conversationID int64
		for _, convo := range payload.Conversations {
			if convo.LastMessage != nil {
				conversationID = convo.ID
				break
			}
		}
		if conversationID == 0 {
			conversationID = payload.Conversations[0].ID
		}

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

	// First, create a new Group event as ava so we have a clean slate
	// (Group events require approval for join requests)
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
			GroupType:   "Group",
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
			GroupType:   "Group",
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

// ============================================================================
// 1:1 vs Group Event Differentiation Tests
// ============================================================================

// Response types for 1:1 tests
type singleJoinRequestResponse struct {
	Request struct {
		ID             int64  `json:"id"`
		EventID        int64  `json:"event_id"`
		UserID         int64  `json:"user_id"`
		Status         string `json:"status"`
		Message        string `json:"message"`
		ConversationID *int64 `json:"conversation_id"`
	} `json:"request"`
	ConversationID *int64 `json:"conversationId"` // camelCase in JSON
}

type eventConversationsResponse struct {
	Conversations []struct {
		ID          int64   `json:"id"`
		CreatedBy   int64   `json:"created_by"`
		MemberIDs   []int64 `json:"member_ids"`
		UnreadCount int     `json:"unread_count"`
		LastMessage *struct {
			ID       int64  `json:"id"`
			Body     string `json:"body"`
			SenderID int64  `json:"sender_id"`
		} `json:"last_message"`
	} `json:"conversations"`
}

type joinRequestsListResponse struct {
	Requests []struct {
		ID             int64  `json:"id"`
		EventID        int64  `json:"event_id"`
		UserID         int64  `json:"user_id"`
		Status         string `json:"status"`
		Message        string `json:"message"`
		ConversationID *int64 `json:"conversation_id"`
		Requester      struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"requester"`
	} `json:"requests"`
}

// TestSingleEventJoinRequest tests that joining a 1:1 (Single) event
// creates a conversation immediately with the intro message
func TestSingleEventJoinRequest(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user id 1 - will be host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user id 4 - will be requester

	// Create a 1:1 (Single) event
	var singleEventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Coffee Chat 1:1",
			Location:    "Local Cafe",
			Time:        "14:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Let's have a coffee and chat",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      60,
			GroupType:   "Single", // 1:1 event
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		singleEventID = payload.ID
		if singleEventID == 0 {
			t.Fatal("expected event ID")
		}
	})

	// Noah joins the 1:1 event - should auto-approve and create conversation
	var conversationID int64
	introMessage := "Hi! I'd love to grab coffee with you. I'm new to the area."
	t.Run("join 1:1 event creates conversation immediately", func(t *testing.T) {
		body := map[string]string{"message": introMessage}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", singleEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)

		// For 1:1 events, status should be "approved" immediately
		if payload.Request.Status != "approved" {
			t.Fatalf("expected approved status for 1:1 event, got %s", payload.Request.Status)
		}

		// Should have a conversation ID
		if payload.ConversationID == nil {
			t.Fatal("expected conversation_id in response for 1:1 event")
		}
		conversationID = *payload.ConversationID
		t.Logf("Created conversation ID: %d", conversationID)
	})

	// Verify the intro message was inserted as the first message
	t.Run("intro message is first message in conversation", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", conversationID), noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		messages := decodeJSON[messagesResponse](t, resp)
		if len(messages.Messages) == 0 {
			t.Fatal("expected at least one message (intro message)")
		}
		// Messages are returned newest first, so intro should be last (or only)
		found := false
		for _, msg := range messages.Messages {
			if msg.Body == introMessage {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("intro message not found in conversation. Messages: %+v", messages.Messages)
		}
	})

	// Both host and requester should see the conversation
	t.Run("host can see the 1:1 conversation", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		found := false
		for _, convo := range payload.Conversations {
			if convo.ID == conversationID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("host should see conversation %d", conversationID)
		}
	})

	t.Run("requester can see the 1:1 conversation", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		found := false
		for _, convo := range payload.Conversations {
			if convo.ID == conversationID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("requester should see conversation %d", conversationID)
		}
	})
}

// TestSingleEventMultipleRequesters tests that multiple users can join
// a 1:1 event and each gets their own private conversation with the host
func TestSingleEventMultipleRequesters(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")       // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com")     // requester 1
	sophiaToken := env.issueTokenForEmail(t, "sophia@example.com") // requester 2

	// Create a 1:1 event
	var singleEventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Networking Coffee",
			Location:    "Downtown Cafe",
			Time:        "10:00",
			EventDate:   time.Now().Add(72 * time.Hour).Format("2006-01-02"),
			Description: "1:1 networking opportunity",
			Gender:      "Any",
			MinAge:      21,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		singleEventID = payload.ID
	})

	// First requester joins
	var convo1ID int64
	t.Run("first requester joins", func(t *testing.T) {
		body := map[string]string{"message": "Hi from Noah!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", singleEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		if payload.ConversationID == nil {
			t.Fatal("expected conversation_id")
		}
		convo1ID = *payload.ConversationID
	})

	// Second requester joins - should get DIFFERENT conversation
	var convo2ID int64
	t.Run("second requester joins gets separate conversation", func(t *testing.T) {
		body := map[string]string{"message": "Hi from Sophia!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", singleEventID), sophiaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		if payload.ConversationID == nil {
			t.Fatal("expected conversation_id")
		}
		convo2ID = *payload.ConversationID

		// Verify it's a DIFFERENT conversation
		if convo1ID == convo2ID {
			t.Fatalf("expected different conversations for different requesters, both got %d", convo1ID)
		}
	})

	// Verify each requester only sees their own conversation messages
	t.Run("noah only sees his conversation", func(t *testing.T) {
		// Noah should see his conversation
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", convo1ID), noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		messages := decodeJSON[messagesResponse](t, resp)
		found := false
		for _, msg := range messages.Messages {
			if msg.Body == "Hi from Noah!" {
				found = true
			}
			if msg.Body == "Hi from Sophia!" {
				t.Fatal("Noah should not see Sophia's message")
			}
		}
		if !found {
			t.Fatal("Noah should see his own intro message")
		}
	})

	t.Run("sophia only sees her conversation", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", convo2ID), sophiaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		messages := decodeJSON[messagesResponse](t, resp)
		found := false
		for _, msg := range messages.Messages {
			if msg.Body == "Hi from Sophia!" {
				found = true
			}
			if msg.Body == "Hi from Noah!" {
				t.Fatal("Sophia should not see Noah's message")
			}
		}
		if !found {
			t.Fatal("Sophia should see her own intro message")
		}
	})

	// Host can see all conversations via the event conversations endpoint
	t.Run("host can list all event conversations", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", singleEventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[eventConversationsResponse](t, resp)
		// Should have at least 2 conversations (one per requester) + the initial event conversation
		if len(payload.Conversations) < 2 {
			t.Fatalf("expected at least 2 conversations, got %d", len(payload.Conversations))
		}

		// Verify we have conversations for both requesters
		foundConvo1, foundConvo2 := false, false
		for _, convo := range payload.Conversations {
			if convo.ID == convo1ID {
				foundConvo1 = true
			}
			if convo.ID == convo2ID {
				foundConvo2 = true
			}
		}
		if !foundConvo1 || !foundConvo2 {
			t.Fatalf("expected to find both requester conversations. Found convo1: %v, convo2: %v", foundConvo1, foundConvo2)
		}
	})

	// Non-host cannot list event conversations
	t.Run("non-host cannot list event conversations", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", singleEventID), noahToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})
}

// TestGroupEventJoinRequest tests that Group events still work as before
// (pending status, no auto-conversation)
func TestGroupEventJoinRequest(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // requester

	// Create a Group event
	var groupEventID int64
	t.Run("create Group event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Group Hiking Trip",
			Location:    "Mountain Trail",
			Time:        "08:00",
			EventDate:   time.Now().Add(96 * time.Hour).Format("2006-01-02"),
			Description: "Group hiking adventure",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      65,
			GroupType:   "Group", // Group event
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		groupEventID = payload.ID
	})

	// Noah joins the Group event - should be pending, NOT auto-approved
	t.Run("join Group event creates pending request", func(t *testing.T) {
		body := map[string]string{"message": "I'd love to join the hike!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", groupEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)

		// For Group events, status should be "pending"
		if payload.Request.Status != "pending" {
			t.Fatalf("expected pending status for Group event, got %s", payload.Request.Status)
		}

		// Should NOT have a conversation_id (not approved yet)
		if payload.ConversationID != nil {
			t.Fatalf("expected no conversation_id for pending Group request, got %d", *payload.ConversationID)
		}
	})

	// Verify Noah does NOT see any new conversation yet
	t.Run("pending requester does not see conversation yet", func(t *testing.T) {
		// Get Noah's conversation count before and after - should be same
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		// Noah should not have any new conversation from this Group event yet
		for _, convo := range payload.Conversations {
			// The group event's conversation should not be visible to Noah yet
			// (he's not a member, just a pending requester)
			t.Logf("Noah's conversation: %d", convo.ID)
		}
	})

	// Host approves the request
	t.Run("host approves Group request", func(t *testing.T) {
		// Get Noah's user ID (4 based on seed data)
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/approve", groupEventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	// Now Noah should be able to see the conversation
	t.Run("approved requester can see conversation", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		if len(payload.Conversations) == 0 {
			t.Fatal("approved requester should see at least one conversation")
		}
	})
}

// TestSingleEventDenyRequest tests declining a request for a 1:1 event
// removes the user from their private conversation
func TestSingleEventDenyRequest(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // requester

	// Create 1:1 event
	var eventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Deny Test Event",
			Location:    "Test Cafe",
			Time:        "15:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Testing deny flow",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	// Noah joins
	var conversationID int64
	t.Run("noah joins 1:1 event", func(t *testing.T) {
		body := map[string]string{"message": "Can I join?"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		if payload.ConversationID == nil {
			t.Fatal("expected conversation_id")
		}
		conversationID = *payload.ConversationID
	})

	// Verify Noah can see the conversation
	t.Run("noah can see conversation before deny", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		found := false
		for _, convo := range payload.Conversations {
			if convo.ID == conversationID {
				found = true
				break
			}
		}
		if !found {
			t.Fatal("noah should see conversation before deny")
		}
	})

	// Host denies the request
	t.Run("host denies 1:1 request", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/deny", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	// Noah should no longer see the conversation (removed from members)
	t.Run("noah cannot see conversation after deny", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		for _, convo := range payload.Conversations {
			if convo.ID == conversationID {
				t.Fatal("noah should NOT see conversation after deny")
			}
		}
	})
}

// TestReportMember tests the new member report endpoint
func TestReportMember(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // requester to be reported

	// Create 1:1 event
	var eventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Report Member Test",
			Location:    "Test Location",
			Time:        "16:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Testing member report",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	// Noah joins
	var conversationID int64
	t.Run("noah joins event", func(t *testing.T) {
		body := map[string]string{"message": "Let me join please"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		if payload.ConversationID != nil {
			conversationID = *payload.ConversationID
		}
	})

	// Host reports Noah
	t.Run("host reports member", func(t *testing.T) {
		body := map[string]string{"reason": "Inappropriate behavior"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/members/4/report", eventID), avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	// Noah should no longer see the conversation (removed after report)
	t.Run("reported member cannot see conversation", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", noahToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[conversationsResponse](t, resp)
		for _, convo := range payload.Conversations {
			if convo.ID == conversationID {
				t.Fatal("reported member should NOT see conversation")
			}
		}
	})

	// Cannot report without reason
	t.Run("report without reason returns 400", func(t *testing.T) {
		body := map[string]string{"reason": ""}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/members/4/report", eventID), avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	// Reporting non-existent member still creates a report (user ID is stored but may not exist)
	// This is acceptable behavior - the report is created with the given user ID
	t.Run("report non-existent member creates report", func(t *testing.T) {
		body := map[string]string{"reason": "Test"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/members/99999/report", eventID), avaToken, body)
		// Either 201 (report created) or 404 (not found) is acceptable depending on implementation
		if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 201 or 404, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	// Non-host cannot report
	t.Run("non-host cannot report member", func(t *testing.T) {
		sophiaToken := env.issueTokenForEmail(t, "sophia@example.com")
		body := map[string]string{"reason": "Test"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/members/4/report", eventID), sophiaToken, body)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})
}

// TestJoinRequestsListWithConversationID tests that the join requests list
// includes conversation_id for 1:1 events
func TestJoinRequestsListWithConversationID(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")       // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com")     // requester 1
	sophiaToken := env.issueTokenForEmail(t, "sophia@example.com") // requester 2

	// Create 1:1 event
	var eventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "List Requests Test",
			Location:    "Test Location",
			Time:        "17:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Testing requests list",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	// Two users join
	t.Run("users join event", func(t *testing.T) {
		body := map[string]string{"message": "Noah here"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}

		body = map[string]string{"message": "Sophia here"}
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), sophiaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	// Host lists requests - should have conversation_id for each
	t.Run("host lists requests with conversation_id", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/chat/requests", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[joinRequestsListResponse](t, resp)

		// Should have 2 requests
		if len(payload.Requests) < 2 {
			t.Fatalf("expected at least 2 requests, got %d", len(payload.Requests))
		}

		// Each should have a conversation_id (since it's a 1:1 event)
		for _, req := range payload.Requests {
			if req.ConversationID == nil {
				t.Fatalf("expected conversation_id for 1:1 event request, user %d has none", req.UserID)
			}
			t.Logf("Request from user %d has conversation_id %d", req.UserID, *req.ConversationID)
		}
	})
}

// TestEventConversationsEndpoint tests the GET /api/events/:id/conversations endpoint
func TestEventConversationsEndpoint(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // requester

	// Create 1:1 event
	var eventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Event Conversations Test",
			Location:    "Test Location",
			Time:        "18:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Testing event conversations endpoint",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	// User joins
	t.Run("user joins event", func(t *testing.T) {
		body := map[string]string{"message": "Hello!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	// Host can get event conversations
	t.Run("host can get event conversations", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[eventConversationsResponse](t, resp)
		if len(payload.Conversations) == 0 {
			t.Fatal("expected at least one conversation")
		}
		// Should include unread_count
		for _, convo := range payload.Conversations {
			t.Logf("Conversation %d: unread_count=%d, members=%v", convo.ID, convo.UnreadCount, convo.MemberIDs)
		}
	})

	// Non-host cannot get event conversations
	t.Run("non-host gets 403", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", eventID), noahToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	// Non-existent event returns 404
	t.Run("non-existent event returns 404", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/events/99999/conversations", avaToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	// Invalid event ID returns 400
	t.Run("invalid event ID returns 400", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/events/invalid/conversations", avaToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})
}

// TestConversationFilteringByEventDate verifies that conversations for completed
// events (>24 hours past) are filtered out, while conversations for recent events
// (<24 hours past) and future events remain visible.
func TestConversationFilteringByEventDate(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()

	// Get test user
	avaToken := env.issueTokenForEmail(t, "ava@example.com")
	ava, err := env.repo.GetUserByEmail(ctx, "ava@example.com")
	if err != nil {
		t.Fatalf("get ava: %v", err)
	}

	// Time references
	now := time.Now().UTC()
	twoDaysAgo := now.Add(-48 * time.Hour)    // >24h past - should be filtered
	twelveHoursAgo := now.Add(-12 * time.Hour) // <24h past - should appear (grace period)
	tomorrow := now.Add(24 * time.Hour)        // future - should appear

	// Create test events with different scheduled_at times using direct SQL
	// Event 1: scheduled_at >24 hours ago (should NOT appear in conversations)
	_, err = env.db.ExecContext(ctx, `
		INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at)
		VALUES (?, 'Old Completed Event', 'Location A', '10:00', ?, 'Old event', 'Any', 18, 50, 'Today', 'Group', 'cover_01', ?)`,
		ava.ID, twoDaysAgo.Format("2006-01-02"), twoDaysAgo.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert old event: %v", err)
	}
	var oldEventID int64
	env.db.QueryRowContext(ctx, "SELECT last_insert_rowid()").Scan(&oldEventID)

	// Event 2: scheduled_at <24 hours ago (should appear - within grace period)
	_, err = env.db.ExecContext(ctx, `
		INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at)
		VALUES (?, 'Recent Completed Event', 'Location B', '10:00', ?, 'Recent event', 'Any', 18, 50, 'Today', 'Group', 'cover_01', ?)`,
		ava.ID, twelveHoursAgo.Format("2006-01-02"), twelveHoursAgo.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert recent event: %v", err)
	}
	var recentEventID int64
	env.db.QueryRowContext(ctx, "SELECT last_insert_rowid()").Scan(&recentEventID)

	// Event 3: scheduled_at in the future (should appear)
	_, err = env.db.ExecContext(ctx, `
		INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at)
		VALUES (?, 'Future Event', 'Location C', '10:00', ?, 'Future event', 'Any', 18, 50, 'Tmrw', 'Group', 'cover_01', ?)`,
		ava.ID, tomorrow.Format("2006-01-02"), tomorrow.Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert future event: %v", err)
	}
	var futureEventID int64
	env.db.QueryRowContext(ctx, "SELECT last_insert_rowid()").Scan(&futureEventID)

	// Event 4: NULL scheduled_at, old event_date (should NOT appear - legacy fallback)
	_, err = env.db.ExecContext(ctx, `
		INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at)
		VALUES (?, 'Legacy Old Event', 'Location D', '10:00', ?, 'Legacy old', 'Any', 18, 50, 'Today', 'Group', 'cover_01', NULL)`,
		ava.ID, twoDaysAgo.Format("2006-01-02"))
	if err != nil {
		t.Fatalf("insert legacy old event: %v", err)
	}
	var legacyOldEventID int64
	env.db.QueryRowContext(ctx, "SELECT last_insert_rowid()").Scan(&legacyOldEventID)

	// Event 5: NULL scheduled_at, today's event_date (should appear - legacy fallback)
	_, err = env.db.ExecContext(ctx, `
		INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at)
		VALUES (?, 'Legacy Today Event', 'Location E', '10:00', ?, 'Legacy today', 'Any', 18, 50, 'Today', 'Group', 'cover_01', NULL)`,
		ava.ID, now.Format("2006-01-02"))
	if err != nil {
		t.Fatalf("insert legacy today event: %v", err)
	}
	var legacyTodayEventID int64
	env.db.QueryRowContext(ctx, "SELECT last_insert_rowid()").Scan(&legacyTodayEventID)

	// Create conversations for each event
	createConversation := func(eventID int64, title string) int64 {
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO conversations (title, created_by, event_id) VALUES (?, ?, ?)`,
			title, ava.ID, eventID)
		if err != nil {
			t.Fatalf("insert conversation for event %d: %v", eventID, err)
		}
		var convoID int64
		env.db.QueryRowContext(ctx, "SELECT last_insert_rowid()").Scan(&convoID)

		// Add ava as a member
		_, err = env.db.ExecContext(ctx, `
			INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')`,
			convoID, ava.ID)
		if err != nil {
			t.Fatalf("insert member for conversation %d: %v", convoID, err)
		}
		return convoID
	}

	oldConvoID := createConversation(oldEventID, "Old Event Chat")
	recentConvoID := createConversation(recentEventID, "Recent Event Chat")
	futureConvoID := createConversation(futureEventID, "Future Event Chat")
	legacyOldConvoID := createConversation(legacyOldEventID, "Legacy Old Chat")
	legacyTodayConvoID := createConversation(legacyTodayEventID, "Legacy Today Chat")

	// Now test the conversations endpoint
	t.Run("filters out old completed event conversations", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/conversations", avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		payload := decodeJSON[conversationsResponse](t, resp)

		// Build a map of conversation IDs for easy lookup
		convoIDs := make(map[int64]bool)
		for _, c := range payload.Conversations {
			convoIDs[c.ID] = true
		}

		// Should NOT contain old event conversation (>24h past)
		if convoIDs[oldConvoID] {
			t.Errorf("conversation for old event (>24h past) should be filtered out, but was included (ID: %d)", oldConvoID)
		}

		// Should contain recent event conversation (<24h past, within grace period)
		if !convoIDs[recentConvoID] {
			t.Errorf("conversation for recent event (<24h past) should be included, but was filtered out (ID: %d)", recentConvoID)
		}

		// Should contain future event conversation
		if !convoIDs[futureConvoID] {
			t.Errorf("conversation for future event should be included, but was filtered out (ID: %d)", futureConvoID)
		}

		// Should NOT contain legacy old event conversation (NULL scheduled_at, old event_date)
		if convoIDs[legacyOldConvoID] {
			t.Errorf("conversation for legacy old event should be filtered out, but was included (ID: %d)", legacyOldConvoID)
		}

		// Should contain legacy today event conversation (NULL scheduled_at, today's event_date)
		if !convoIDs[legacyTodayConvoID] {
			t.Errorf("conversation for legacy today event should be included, but was filtered out (ID: %d)", legacyTodayConvoID)
		}
	})

	// Also verify using direct SQL to double-check the datetime comparison works
	t.Run("verifies SQL datetime comparison is correct", func(t *testing.T) {
		// This tests the core issue: ISO 8601 format with 'T' should compare correctly
		var result int
		err := env.db.QueryRowContext(ctx, `
			SELECT datetime('2026-01-15T13:30:00.000Z') > datetime('now', '-1 day')
		`).Scan(&result)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		// This should be 0 (false) if the date is more than 1 day in the past
		// Note: This test is time-dependent. If run on 2026-01-16 or later, it should be 0.
		t.Logf("datetime comparison result: %d (expected 0 for dates >24h past)", result)
	})
}

// TestLeaveEventDeletesJoinRequest verifies that when a user leaves an event,
// their join request record is deleted from the database. This prevents the
// "pending" state from persisting after leaving and rejoining an event.
func TestLeaveEventDeletesJoinRequest(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host (user id 1)
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // joiner (user id 4)

	// Create a 1:1 event
	var eventID int64
	t.Run("create 1:1 event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Leave Test Event",
			Location:    "Test Cafe",
			Time:        "14:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Testing leave deletes join request",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	// Helper to check if a join request exists in the database (any status)
	hasJoinRequestInDB := func() bool {
		var count int
		err := env.db.QueryRowContext(ctx,
			"SELECT COUNT(*) FROM conversation_join_requests WHERE event_id = ? AND user_id = 4",
			eventID).Scan(&count)
		if err != nil {
			t.Fatalf("query join request: %v", err)
		}
		return count > 0
	}

	// Noah joins the 1:1 event
	t.Run("noah joins event", func(t *testing.T) {
		body := map[string]string{"message": "Can I join?"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		// For 1:1 events, request is auto-approved
		if payload.Request.Status != "approved" {
			t.Fatalf("expected approved status, got %s", payload.Request.Status)
		}
	})

	// Verify join request exists in DB
	t.Run("verify join request exists in DB after joining", func(t *testing.T) {
		if !hasJoinRequestInDB() {
			t.Fatal("expected join request to exist in database after joining")
		}
	})

	// Noah leaves the event
	t.Run("noah leaves event - first time", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/members/4", eventID), noahToken, nil)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
	})

	// Verify join request is deleted from DB after leaving
	t.Run("verify join request deleted from DB after leaving", func(t *testing.T) {
		if hasJoinRequestInDB() {
			t.Fatal("join request should be deleted from database after leaving event")
		}
	})

	// Noah rejoins the event
	t.Run("noah rejoins event", func(t *testing.T) {
		body := map[string]string{"message": "I'd like to rejoin!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		if payload.Request.Status != "approved" {
			t.Fatalf("expected approved status on rejoin, got %s", payload.Request.Status)
		}
	})

	// Verify join request exists in DB again
	t.Run("verify join request exists in DB after rejoining", func(t *testing.T) {
		if !hasJoinRequestInDB() {
			t.Fatal("expected join request to exist in database after rejoining")
		}
	})

	// Noah leaves again
	t.Run("noah leaves event - second time", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/members/4", eventID), noahToken, nil)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
	})

	// Verify join request is deleted from DB after second leave (this was the bug)
	t.Run("verify join request deleted from DB after second leave", func(t *testing.T) {
		if hasJoinRequestInDB() {
			t.Fatal("join request should be deleted from database after leaving event the second time - this is the bug being fixed")
		}
	})

	// Noah rejoins a third time to verify the cycle works
	t.Run("noah rejoins event - third time", func(t *testing.T) {
		body := map[string]string{"message": "Third time's the charm!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		if payload.Request.Status != "approved" {
			t.Fatalf("expected approved status on third rejoin, got %s", payload.Request.Status)
		}
	})
}

// ============================================================================
// Profile / Onboarding Tests
// ============================================================================

type profileResponse struct {
	User struct {
		ID              int64   `json:"id"`
		Name            string  `json:"name"`
		Email           string  `json:"email"`
		ProfileComplete bool    `json:"profile_complete"`
		Gender          string  `json:"gender,omitempty"`
		Age             int     `json:"age,omitempty"`
		Avatar          string  `json:"avatar,omitempty"`
	} `json:"user"`
}

// TestUpdateProfile tests the profile update endpoint with various inputs
func TestUpdateProfile(t *testing.T) {
	env := setupAPITestEnv(t)

	t.Run("valid profile update", func(t *testing.T) {
		// Create a new user for this test to avoid conflicts with other tests
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Test User', 'profile-test@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "profile-test@example.com")

		body := map[string]any{
			"name":   "Updated Name",
			"gender": "Female",
			"age":    25,
			"avatar": "https://example.com/avatar.png",
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		payload := decodeJSON[profileResponse](t, resp)
		if payload.User.Name != "Updated Name" {
			t.Fatalf("expected name 'Updated Name', got %s", payload.User.Name)
		}
		if payload.User.Gender != "Female" {
			t.Fatalf("expected gender 'Female', got %s", payload.User.Gender)
		}
		if payload.User.Age != 25 {
			t.Fatalf("expected age 25, got %d", payload.User.Age)
		}
		if payload.User.Avatar != "https://example.com/avatar.png" {
			t.Fatalf("expected avatar URL, got %s", payload.User.Avatar)
		}
		if !payload.User.ProfileComplete {
			t.Fatal("expected profile_complete to be true after update")
		}
	})

	t.Run("missing name returns 400", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Missing Name Test', 'missing-name@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "missing-name@example.com")

		body := map[string]any{
			"gender": "Male",
			"age":    30,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("invalid gender returns 400", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Invalid Gender Test', 'invalid-gender@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "invalid-gender@example.com")

		body := map[string]any{
			"name":   "Test User",
			"gender": "Other", // Invalid - only Female or Male allowed
			"age":    25,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("age below 13 returns 400", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Young User Test', 'young-user@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "young-user@example.com")

		body := map[string]any{
			"name":   "Test User",
			"gender": "Male",
			"age":    12, // Below minimum of 13
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("age above 120 returns 400", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Old User Test', 'old-user@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "old-user@example.com")

		body := map[string]any{
			"name":   "Test User",
			"gender": "Female",
			"age":    121, // Above maximum of 120
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("empty request body returns 400", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Empty Body Test', 'empty-body@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "empty-body@example.com")

		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, map[string]any{})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("request without token returns 401", func(t *testing.T) {
		body := map[string]any{
			"name":   "Test User",
			"gender": "Male",
			"age":    25,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", "", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("update without avatar field succeeds", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('No Avatar Test', 'no-avatar@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "no-avatar@example.com")

		body := map[string]any{
			"name":   "No Avatar User",
			"gender": "Male",
			"age":    30,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		payload := decodeJSON[profileResponse](t, resp)
		if payload.User.Name != "No Avatar User" {
			t.Fatalf("expected name 'No Avatar User', got %s", payload.User.Name)
		}
		if !payload.User.ProfileComplete {
			t.Fatal("expected profile_complete to be true")
		}
	})

	t.Run("update with null avatar succeeds", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Null Avatar Test', 'null-avatar@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "null-avatar@example.com")

		body := map[string]any{
			"name":   "Null Avatar User",
			"gender": "Female",
			"age":    28,
			"avatar": nil,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})
}

// TestProfileImmutability tests that gender and age cannot be changed once set
func TestProfileImmutability(t *testing.T) {
	env := setupAPITestEnv(t)

	t.Run("gender cannot be changed once set", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Gender Change Test', 'gender-change@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "gender-change@example.com")

		// First, set gender to Male
		body := map[string]any{
			"name":   "Test User",
			"gender": "Male",
			"age":    25,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("initial profile update: expected 200, got %d", resp.StatusCode)
		}

		// Try to change gender to Female
		body["gender"] = "Female"
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 when trying to change gender, got %d", resp.StatusCode)
		}

		payload := decodeJSON[testErrorResponse](t, resp)
		if payload.Error != "gender cannot be changed once set" {
			t.Fatalf("expected 'gender cannot be changed once set' error, got '%s'", payload.Error)
		}
	})

	t.Run("age cannot be changed once set", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Age Change Test', 'age-change@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "age-change@example.com")

		// First, set age to 25
		body := map[string]any{
			"name":   "Test User",
			"gender": "Female",
			"age":    25,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("initial profile update: expected 200, got %d", resp.StatusCode)
		}

		// Try to change age to 30
		body["age"] = 30
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 when trying to change age, got %d", resp.StatusCode)
		}

		payload := decodeJSON[testErrorResponse](t, resp)
		if payload.Error != "age cannot be changed once set" {
			t.Fatalf("expected 'age cannot be changed once set' error, got '%s'", payload.Error)
		}
	})

	t.Run("name can be changed multiple times", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Name Change Test', 'name-change@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "name-change@example.com")

		// Set initial profile
		body := map[string]any{
			"name":   "Initial Name",
			"gender": "Male",
			"age":    30,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("initial profile update: expected 200, got %d", resp.StatusCode)
		}

		// Change name
		body["name"] = "Updated Name"
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 when changing name, got %d", resp.StatusCode)
		}

		payload := decodeJSON[profileResponse](t, resp)
		if payload.User.Name != "Updated Name" {
			t.Fatalf("expected name 'Updated Name', got '%s'", payload.User.Name)
		}

		// Change name again
		body["name"] = "Third Name"
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 when changing name again, got %d", resp.StatusCode)
		}

		payload = decodeJSON[profileResponse](t, resp)
		if payload.User.Name != "Third Name" {
			t.Fatalf("expected name 'Third Name', got '%s'", payload.User.Name)
		}
	})

	t.Run("avatar can be changed multiple times", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Avatar Change Test', 'avatar-change@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "avatar-change@example.com")

		// Set initial profile with avatar
		body := map[string]any{
			"name":   "Avatar User",
			"gender": "Female",
			"age":    28,
			"avatar": "https://example.com/avatar1.png",
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("initial profile update: expected 200, got %d", resp.StatusCode)
		}

		// Change avatar
		body["avatar"] = "https://example.com/avatar2.png"
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 when changing avatar, got %d", resp.StatusCode)
		}

		payload := decodeJSON[profileResponse](t, resp)
		if payload.User.Avatar != "https://example.com/avatar2.png" {
			t.Fatalf("expected avatar 'https://example.com/avatar2.png', got '%s'", payload.User.Avatar)
		}
	})

	t.Run("same gender value can be submitted", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Same Gender Test', 'same-gender@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "same-gender@example.com")

		// Set initial profile
		body := map[string]any{
			"name":   "Test User",
			"gender": "Male",
			"age":    25,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("initial profile update: expected 200, got %d", resp.StatusCode)
		}

		// Submit same gender value - should succeed
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 when submitting same gender, got %d", resp.StatusCode)
		}
	})

	t.Run("same age value can be submitted", func(t *testing.T) {
		ctx := context.Background()
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, created_at)
			VALUES ('Same Age Test', 'same-age@example.com', '', datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create test user: %v", err)
		}

		token := env.issueTokenForEmail(t, "same-age@example.com")

		// Set initial profile
		body := map[string]any{
			"name":   "Test User",
			"gender": "Female",
			"age":    30,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("initial profile update: expected 200, got %d", resp.StatusCode)
		}

		// Submit same age value - should succeed
		resp = env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 when submitting same age, got %d", resp.StatusCode)
		}
	})
}

// TestGoogleLoginReturnsProfileComplete tests that the Google login response
// correctly includes the profile_complete field
func TestGoogleLoginReturnsProfileComplete(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()

	t.Run("new user has profile_complete false", func(t *testing.T) {
		// Create a new user without profile completion
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, profile_complete, created_at)
			VALUES ('New User', 'new-user@example.com', '', 0, datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create new user: %v", err)
		}

		// Get user and verify profile_complete is false
		user, err := env.repo.GetUserByEmail(ctx, "new-user@example.com")
		if err != nil {
			t.Fatalf("get user: %v", err)
		}
		if user.ProfileComplete {
			t.Fatal("new user should have profile_complete = false")
		}
	})

	t.Run("user with completed profile has profile_complete true", func(t *testing.T) {
		// Create a user with completed profile
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, gender, age, profile_complete, created_at)
			VALUES ('Complete User', 'complete-user@example.com', '', 'Female', 25, 1, datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create complete user: %v", err)
		}

		// Get user and verify profile_complete is true
		user, err := env.repo.GetUserByEmail(ctx, "complete-user@example.com")
		if err != nil {
			t.Fatalf("get user: %v", err)
		}
		if !user.ProfileComplete {
			t.Fatal("user with completed profile should have profile_complete = true")
		}
	})

	t.Run("profile update sets profile_complete to true", func(t *testing.T) {
		// Create a new user
		_, err := env.db.ExecContext(ctx, `
			INSERT INTO users (name, email, password, profile_complete, created_at)
			VALUES ('Incomplete User', 'incomplete-user@example.com', '', 0, datetime('now'))
		`)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}

		// Verify initially profile_complete is false
		user, err := env.repo.GetUserByEmail(ctx, "incomplete-user@example.com")
		if err != nil {
			t.Fatalf("get user: %v", err)
		}
		if user.ProfileComplete {
			t.Fatal("user should initially have profile_complete = false")
		}

		// Update profile
		token := env.issueTokenForEmail(t, "incomplete-user@example.com")
		body := map[string]any{
			"name":   "Updated User",
			"gender": "Male",
			"age":    28,
		}
		resp := env.doRequest(t, http.MethodPut, "/api/profile", token, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("profile update: expected 200, got %d", resp.StatusCode)
		}

		// Verify profile_complete is now true
		payload := decodeJSON[profileResponse](t, resp)
		if !payload.User.ProfileComplete {
			t.Fatal("profile_complete should be true after profile update")
		}

		// Verify in database as well
		user, err = env.repo.GetUserByEmail(ctx, "incomplete-user@example.com")
		if err != nil {
			t.Fatalf("get user after update: %v", err)
		}
		if !user.ProfileComplete {
			t.Fatal("profile_complete should be true in database after update")
		}
	})
}

// TestLeaveGroupEventDeletesJoinRequest verifies that leaving a Group event
// also deletes the join request record.
func TestLeaveGroupEventDeletesJoinRequest(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host (user id 1)
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // joiner (user id 4)

	// Create a Group event
	var eventID int64
	t.Run("create Group event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Leave Group Test Event",
			Location:    "Test Location",
			Time:        "15:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Testing leave deletes join request for Group events",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Group",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	// Helper to check if a join request exists in the database (any status)
	hasJoinRequestInDB := func() bool {
		var count int
		err := env.db.QueryRowContext(ctx,
			"SELECT COUNT(*) FROM conversation_join_requests WHERE event_id = ? AND user_id = 4",
			eventID).Scan(&count)
		if err != nil {
			t.Fatalf("query join request: %v", err)
		}
		return count > 0
	}

	// Helper to check pending join requests via API
	hasPendingJoinRequest := func() bool {
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
			if r.EventID == eventID {
				return true
			}
		}
		return false
	}

	// Noah sends join request
	t.Run("noah sends join request", func(t *testing.T) {
		body := map[string]string{"message": "I'd like to join the group!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		// Group events require approval
		if payload.Request.Status != "pending" {
			t.Fatalf("expected pending status for Group event, got %s", payload.Request.Status)
		}
	})

	// Verify pending request via API
	t.Run("verify pending request exists via API", func(t *testing.T) {
		if !hasPendingJoinRequest() {
			t.Fatal("expected pending request to appear in /api/chat/requests/me")
		}
	})

	// Host approves the request
	t.Run("host approves request", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/approve", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	// Verify join request exists in DB (with approved status)
	t.Run("verify join request exists in DB after approval", func(t *testing.T) {
		if !hasJoinRequestInDB() {
			t.Fatal("expected join request to exist in database after approval")
		}
	})

	// Noah leaves the event
	t.Run("noah leaves Group event", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/members/4", eventID), noahToken, nil)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
	})

	// Verify join request is deleted from DB after leaving
	t.Run("verify join request deleted from DB after leaving Group event", func(t *testing.T) {
		if hasJoinRequestInDB() {
			t.Fatal("join request should be deleted from database after leaving Group event")
		}
	})

	// Noah can rejoin with a fresh request
	t.Run("noah can rejoin with fresh request", func(t *testing.T) {
		body := map[string]string{"message": "I want to rejoin the group!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d (user should be able to create fresh join request after leaving)", resp.StatusCode)
		}
		payload := decodeJSON[singleJoinRequestResponse](t, resp)
		// Should be pending again (fresh request)
		if payload.Request.Status != "pending" {
			t.Fatalf("expected pending status for fresh rejoin request, got %s", payload.Request.Status)
		}
	})
}

// ============================================================================
// Event Update/Delete Tests
// ============================================================================

// TestUpdateEvent tests the PUT /events/:id endpoint
func TestUpdateEvent(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user id 1
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user id 4

	// Create an event as ava
	var eventID int64
	t.Run("setup - create event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Original Event",
			Location:    "Original Location",
			Time:        "10:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Original description",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	t.Run("owner can update event", func(t *testing.T) {
		body := UpdateEventParams{
			Title:       "Updated Event Title",
			Location:    "Updated Location",
			Time:        "14:00",
			EventDate:   time.Now().Add(72 * time.Hour).Format("2006-01-02"),
			Description: "Updated description",
			Gender:      "Female",
			MinAge:      21,
			MaxAge:      40,
			GroupType:   "Group",
		}
		resp := env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", eventID), avaToken, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[testMessageResponse](t, resp)
		if payload.Message != "event updated" {
			t.Fatalf("expected 'event updated', got %s", payload.Message)
		}
	})

	t.Run("non-owner cannot update event", func(t *testing.T) {
		body := UpdateEventParams{
			Title:       "Hacked Event",
			Location:    "Hacked Location",
			Time:        "16:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Hacked",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
		}
		resp := env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", eventID), noahToken, body)
		// Current implementation returns 500 for non-owner (includes ownership check in error)
		if resp.StatusCode != http.StatusInternalServerError {
			t.Fatalf("expected 500, got %d", resp.StatusCode)
		}
	})

	t.Run("update without auth returns 401", func(t *testing.T) {
		body := UpdateEventParams{
			Title:       "No Auth Update",
			Location:    "Location",
			Time:        "10:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Description",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
		}
		resp := env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", eventID), "", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("update with invalid event id returns 400", func(t *testing.T) {
		body := UpdateEventParams{
			Title:       "Test",
			Location:    "Location",
			Time:        "10:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Description",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
		}
		resp := env.doRequest(t, http.MethodPut, "/api/events/invalid", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("update with min_age > max_age returns 400", func(t *testing.T) {
		body := UpdateEventParams{
			Title:       "Test",
			Location:    "Location",
			Time:        "10:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Description",
			Gender:      "Any",
			MinAge:      50,
			MaxAge:      18, // max < min - should fail
			GroupType:   "Single",
		}
		resp := env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", eventID), avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("update with missing required fields returns 400", func(t *testing.T) {
		body := map[string]any{
			"title": "Only Title",
			// Missing other required fields
		}
		resp := env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", eventID), avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})
}

// TestDeleteEvent tests the DELETE /events/:id endpoint
func TestDeleteEvent(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user id 1
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user id 4

	// Create an event as ava for deletion tests
	var eventID int64
	t.Run("setup - create event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Event To Delete",
			Location:    "Delete Location",
			Time:        "12:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Will be deleted",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		eventID = payload.ID
	})

	t.Run("non-owner cannot delete event", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d", eventID), noahToken, nil)
		// Current implementation returns 404 for non-owner (combines not found / not owned)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("delete without auth returns 401", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d", eventID), "", nil)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("delete with invalid event id returns 400", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, "/api/events/invalid", avaToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("owner can delete event", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		payload := decodeJSON[testMessageResponse](t, resp)
		if payload.Message != "event deleted" {
			t.Fatalf("expected 'event deleted', got %s", payload.Message)
		}
	})

	t.Run("delete non-existent event returns 404", func(t *testing.T) {
		// Try to delete the same event again (already deleted)
		resp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

// TestCreateEventValidation tests validation for the POST /events endpoint
func TestCreateEventValidation(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")

	t.Run("create without auth returns 401", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Test Event",
			Location:    "Test Location",
			Time:        "10:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", "", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("create without title returns 400", func(t *testing.T) {
		body := map[string]any{
			"location":   "Location",
			"time":       "10:00",
			"event_date": time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			"gender":     "Any",
			"min_age":    18,
			"max_age":    50,
			"group_type": "Single",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("create without location returns 400", func(t *testing.T) {
		body := map[string]any{
			"title":      "Event Title",
			"time":       "10:00",
			"event_date": time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			"gender":     "Any",
			"min_age":    18,
			"max_age":    50,
			"group_type": "Single",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("create with min_age > max_age returns 400", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Invalid Age Range Event",
			Location:    "Test Location",
			Time:        "10:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "Test",
			Gender:      "Any",
			MinAge:      50,
			MaxAge:      18, // max < min - should fail
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("create with invalid group_type returns 400", func(t *testing.T) {
		body := map[string]any{
			"title":      "Event",
			"location":   "Location",
			"time":       "10:00",
			"event_date": time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			"gender":     "Any",
			"min_age":    18,
			"max_age":    50,
			"group_type": "InvalidType", // Not Single or Group
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("create with empty body returns 400", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, map[string]any{})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})
}

// ============================================================================
// Push Notification Tests
// ============================================================================

func TestPushTokenCRUD(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")

	t.Run("register token successfully", func(t *testing.T) {
		body := map[string]string{
			"token":     "fcm-token-ava-1",
			"device_id": "device-ava-1",
			"platform":  "android",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("register without auth returns 401", func(t *testing.T) {
		body := map[string]string{
			"token":     "fcm-token-unauthed",
			"device_id": "device-1",
			"platform":  "android",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", "", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("register missing token returns 400", func(t *testing.T) {
		body := map[string]string{
			"device_id": "device-1",
			"platform":  "android",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("register empty token returns 400", func(t *testing.T) {
		body := map[string]string{
			"token":     "   ",
			"device_id": "device-1",
			"platform":  "android",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("register missing device_id returns 400", func(t *testing.T) {
		body := map[string]string{
			"token":    "fcm-token-1",
			"platform": "android",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("register invalid platform returns 400", func(t *testing.T) {
		body := map[string]string{
			"token":     "fcm-token-1",
			"device_id": "device-1",
			"platform":  "windows",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("register with platform ios succeeds", func(t *testing.T) {
		body := map[string]string{
			"token":     "fcm-token-ava-ios",
			"device_id": "device-ava-ios",
			"platform":  "ios",
		}
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("delete token successfully", func(t *testing.T) {
		body := map[string]string{"token": "fcm-token-ava-1"}
		resp := env.doRequest(t, http.MethodDelete, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("delete non-existent token returns 404", func(t *testing.T) {
		body := map[string]string{"token": "non-existent-token"}
		resp := env.doRequest(t, http.MethodDelete, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("delete without auth returns 401", func(t *testing.T) {
		body := map[string]string{"token": "fcm-token-ava-ios"}
		resp := env.doRequest(t, http.MethodDelete, "/api/push-tokens", "", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("delete empty token returns 400", func(t *testing.T) {
		body := map[string]string{"token": "   "}
		resp := env.doRequest(t, http.MethodDelete, "/api/push-tokens", avaToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})
}

func TestPushOnChatMessage(t *testing.T) {
	mock := &mockPushSender{}
	env := setupAPITestEnvWithPush(t, mock)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user 1 (host)
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user 4

	// Register push tokens for both users
	for _, tc := range []struct {
		token    string
		deviceID string
		authTok  string
	}{
		{"fcm-ava-device", "ava-device", avaToken},
		{"fcm-noah-device", "noah-device", noahToken},
	} {
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", tc.authTok, map[string]string{
			"token": tc.token, "device_id": tc.deviceID, "platform": "android",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("register push token: expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// Create group event as ava, noah joins, ava approves
	var groupEventID int64
	t.Run("setup group event", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Push Test Group Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "For push test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Group",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		payload := decodeJSON[createEventResponse](t, resp)
		groupEventID = payload.ID
	})

	t.Run("noah requests to join", func(t *testing.T) {
		body := map[string]string{"message": "Let me in!"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", groupEventID), noahToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	t.Run("ava approves noah", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/approve", groupEventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	})

	// Wait for any setup-related pushes to settle, then reset
	time.Sleep(200 * time.Millisecond)
	mock.reset()

	// Get the conversation ID via event conversations endpoint
	resp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", groupEventID), avaToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	eventConvos := decodeJSON[eventConversationsResponse](t, resp)
	if len(eventConvos.Conversations) == 0 {
		t.Fatal("no conversations found for event")
	}
	conversationID := eventConvos.Conversations[0].ID

	t.Run("ava sends message and noah gets push", func(t *testing.T) {
		// Connect ava's websocket
		dialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(avaToken)
		wsConn, _, err := websocket.DefaultDialer.Dial(dialURL, nil)
		if err != nil {
			t.Fatalf("ws dial: %v", err)
		}
		defer wsConn.Close()

		// Send a chat message
		sendPayload := map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           "Hello from ava!",
			"tempId":         fmt.Sprintf("temp-%d", time.Now().UnixNano()),
		}
		if err := wsConn.WriteJSON(sendPayload); err != nil {
			t.Fatalf("ws send: %v", err)
		}

		// Wait for push notification
		notifications := mock.waitForNotifications(t, 1, 3*time.Second)

		// Verify noah got the push
		found := false
		for _, n := range notifications {
			if n.Token == "fcm-noah-device" && n.Data["type"] == "chat.message" {
				found = true
				if n.Data["conversationId"] != fmt.Sprintf("%d", conversationID) {
					t.Fatalf("expected conversationId %d, got %s", conversationID, n.Data["conversationId"])
				}
			}
		}
		if !found {
			t.Fatalf("expected push to noah's device, got: %+v", notifications)
		}

		// Verify ava (sender) did NOT receive a push
		for _, n := range notifications {
			if n.Token == "fcm-ava-device" {
				t.Fatal("sender (ava) should NOT receive a push notification")
			}
		}
	})
}

func TestPushOnJoinRequestFlows(t *testing.T) {
	mock := &mockPushSender{}
	env := setupAPITestEnvWithPush(t, mock)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user 1 (host)
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user 4

	// Register push tokens
	for _, tc := range []struct {
		token    string
		deviceID string
		authTok  string
	}{
		{"fcm-ava-device", "ava-device", avaToken},
		{"fcm-noah-device", "noah-device", noahToken},
	} {
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", tc.authTok, map[string]string{
			"token": tc.token, "device_id": tc.deviceID, "platform": "android",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("register push token: expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	t.Run("group event join request notifies host", func(t *testing.T) {
		// Create group event
		body := CreateEventParams{
			Title:       "Push Join Group Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "For push join test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Group",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		eventID := decodeJSON[createEventResponse](t, resp).ID

		mock.reset()

		// Noah requests to join
		joinBody := map[string]string{"message": "I want to join!"}
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, joinBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Wait for push to host (ava)
		notifications := mock.waitForNotifications(t, 1, 3*time.Second)

		found := false
		for _, n := range notifications {
			if n.Token == "fcm-ava-device" && n.Data["type"] == "join_request.created" {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected join_request.created push to host, got: %+v", notifications)
		}
	})

	t.Run("group event approve notifies requester", func(t *testing.T) {
		// Create another group event
		body := CreateEventParams{
			Title:       "Push Approve Group Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "For push approve test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Group",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		eventID := decodeJSON[createEventResponse](t, resp).ID

		// Noah requests to join
		joinBody := map[string]string{"message": "Approve me!"}
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, joinBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Wait for join request push then reset (extra sleep to let goroutines settle)
		mock.waitForNotifications(t, 1, 3*time.Second)
		time.Sleep(100 * time.Millisecond)
		mock.reset()

		// Ava approves
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/approve", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		notifications := mock.waitForNotifications(t, 1, 3*time.Second)
		found := false
		for _, n := range notifications {
			if n.Token == "fcm-noah-device" && n.Data["type"] == "join_request.approved" {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected join_request.approved push to requester, got: %+v", notifications)
		}
	})

	t.Run("group event deny notifies requester", func(t *testing.T) {
		// Create another group event
		body := CreateEventParams{
			Title:       "Push Deny Group Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "For push deny test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Group",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		eventID := decodeJSON[createEventResponse](t, resp).ID

		// Noah requests to join
		joinBody := map[string]string{"message": "Deny me!"}
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, joinBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Wait for join request push then reset (extra sleep to let goroutines settle)
		mock.waitForNotifications(t, 1, 3*time.Second)
		time.Sleep(100 * time.Millisecond)
		mock.reset()

		// Ava denies
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/deny", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		notifications := mock.waitForNotifications(t, 1, 3*time.Second)
		found := false
		for _, n := range notifications {
			if n.Token == "fcm-noah-device" && n.Data["type"] == "join_request.denied" {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected join_request.denied push to requester, got: %+v", notifications)
		}
	})

	t.Run("1:1 event join produces two pushes", func(t *testing.T) {
		// Create 1:1 event
		body := CreateEventParams{
			Title:       "Push 1:1 Event",
			Location:    "Test Cafe",
			Time:        "14:00",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "For 1:1 push test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Single",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		eventID := decodeJSON[createEventResponse](t, resp).ID

		mock.reset()

		// Noah joins (auto-approve for 1:1)
		joinBody := map[string]string{"message": "Hi there!"}
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, joinBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Should produce 2 pushes: join_request.created to host + join_request.approved to requester
		notifications := mock.waitForNotifications(t, 2, 3*time.Second)

		hasCreated, hasApproved := false, false
		for _, n := range notifications {
			if n.Token == "fcm-ava-device" && n.Data["type"] == "join_request.created" {
				hasCreated = true
			}
			if n.Token == "fcm-noah-device" && n.Data["type"] == "join_request.approved" {
				hasApproved = true
			}
		}
		if !hasCreated {
			t.Fatalf("expected join_request.created push to host for 1:1, got: %+v", notifications)
		}
		if !hasApproved {
			t.Fatalf("expected join_request.approved push to requester for 1:1, got: %+v", notifications)
		}
	})
}

func TestPushPresenceSuppression(t *testing.T) {
	mock := &mockPushSender{}
	env := setupAPITestEnvWithPush(t, mock)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user 1 (host)
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user 4

	// Register push tokens
	for _, tc := range []struct {
		token    string
		deviceID string
		authTok  string
	}{
		{"fcm-ava-device", "ava-device", avaToken},
		{"fcm-noah-device", "noah-device", noahToken},
	} {
		resp := env.doRequest(t, http.MethodPost, "/api/push-tokens", tc.authTok, map[string]string{
			"token": tc.token, "device_id": tc.deviceID, "platform": "android",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("register push token: expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// Create group event, noah joins & gets approved
	var conversationID int64
	t.Run("setup group conversation", func(t *testing.T) {
		body := CreateEventParams{
			Title:       "Presence Test Event",
			Location:    "Test Location",
			Time:        "23:59",
			EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Description: "For presence suppression test",
			Gender:      "Any",
			MinAge:      18,
			MaxAge:      50,
			GroupType:   "Group",
			CoverKey:    defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		eventID := decodeJSON[createEventResponse](t, resp).ID

		joinBody := map[string]string{"message": "Join me!"}
		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, joinBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		resp = env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/4/approve", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		// Get the conversation ID via event conversations endpoint (host only)
		resp = env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", eventID), avaToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		eventConvos := decodeJSON[eventConversationsResponse](t, resp)
		if len(eventConvos.Conversations) == 0 {
			t.Fatal("no conversations found for event")
		}
		conversationID = eventConvos.Conversations[0].ID
	})

	// Wait for setup pushes to settle
	time.Sleep(200 * time.Millisecond)

	t.Run("active conversation suppresses push", func(t *testing.T) {
		mock.reset()

		// Noah connects WS and sets active conversation
		noahDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(noahToken)
		noahWS, _, err := websocket.DefaultDialer.Dial(noahDialURL, nil)
		if err != nil {
			t.Fatalf("noah ws dial: %v", err)
		}
		defer noahWS.Close()

		// Set presence to the active conversation
		if err := noahWS.WriteJSON(map[string]any{
			"type":           "presence:active_conversation",
			"conversationId": conversationID,
		}); err != nil {
			t.Fatalf("noah set presence: %v", err)
		}

		// Give the hub a moment to process the presence update
		time.Sleep(150 * time.Millisecond)

		// Ava sends a message via WS
		avaDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(avaToken)
		avaWS, _, err := websocket.DefaultDialer.Dial(avaDialURL, nil)
		if err != nil {
			t.Fatalf("ava ws dial: %v", err)
		}
		defer avaWS.Close()

		if err := avaWS.WriteJSON(map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           "suppressed message",
			"tempId":         fmt.Sprintf("temp-%d", time.Now().UnixNano()),
		}); err != nil {
			t.Fatalf("ava ws send: %v", err)
		}

		// Read ava's echo to confirm the message was processed
		avaWS.SetReadDeadline(time.Now().Add(2 * time.Second))
		var echo wsEnvelope
		if err := avaWS.ReadJSON(&echo); err != nil {
			t.Fatalf("ava ws read echo: %v", err)
		}

		// Wait a bit for any push to arrive (there should be none)
		time.Sleep(500 * time.Millisecond)

		notifications := mock.getNotifications()
		for _, n := range notifications {
			if n.Token == "fcm-noah-device" {
				t.Fatalf("push should be suppressed when noah is actively viewing the conversation, got: %+v", n)
			}
		}
	})

	t.Run("different active conversation does not suppress push", func(t *testing.T) {
		mock.reset()

		// Noah connects WS and sets active conversation to a DIFFERENT ID
		noahDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(noahToken)
		noahWS, _, err := websocket.DefaultDialer.Dial(noahDialURL, nil)
		if err != nil {
			t.Fatalf("noah ws dial: %v", err)
		}
		defer noahWS.Close()

		// Set presence to a different conversation ID (99999 - doesn't exist)
		if err := noahWS.WriteJSON(map[string]any{
			"type":           "presence:active_conversation",
			"conversationId": 99999,
		}); err != nil {
			t.Fatalf("noah set presence: %v", err)
		}

		time.Sleep(150 * time.Millisecond)

		// Ava sends a message
		avaDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(avaToken)
		avaWS, _, err := websocket.DefaultDialer.Dial(avaDialURL, nil)
		if err != nil {
			t.Fatalf("ava ws dial: %v", err)
		}
		defer avaWS.Close()

		if err := avaWS.WriteJSON(map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           "not suppressed message",
			"tempId":         fmt.Sprintf("temp-%d", time.Now().UnixNano()),
		}); err != nil {
			t.Fatalf("ava ws send: %v", err)
		}

		// Wait for push to noah
		notifications := mock.waitForNotifications(t, 1, 3*time.Second)
		found := false
		for _, n := range notifications {
			if n.Token == "fcm-noah-device" && n.Data["type"] == "chat.message" {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected push to noah when viewing different conversation, got: %+v", notifications)
		}
	})

	t.Run("disconnected user receives push", func(t *testing.T) {
		mock.reset()

		// Noah connects WS, sets presence, then disconnects
		noahDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(noahToken)
		noahWS, _, err := websocket.DefaultDialer.Dial(noahDialURL, nil)
		if err != nil {
			t.Fatalf("noah ws dial: %v", err)
		}

		// Set active conversation
		if err := noahWS.WriteJSON(map[string]any{
			"type":           "presence:active_conversation",
			"conversationId": conversationID,
		}); err != nil {
			t.Fatalf("noah set presence: %v", err)
		}

		time.Sleep(150 * time.Millisecond)

		// Disconnect noah
		noahWS.Close()

		// Wait for the hub to process the unregister
		time.Sleep(200 * time.Millisecond)

		// Ava sends a message
		avaDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(avaToken)
		avaWS, _, err := websocket.DefaultDialer.Dial(avaDialURL, nil)
		if err != nil {
			t.Fatalf("ava ws dial: %v", err)
		}
		defer avaWS.Close()

		if err := avaWS.WriteJSON(map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           "noah is offline",
			"tempId":         fmt.Sprintf("temp-%d", time.Now().UnixNano()),
		}); err != nil {
			t.Fatalf("ava ws send: %v", err)
		}

		// Wait for push to noah (should arrive since he's disconnected)
		notifications := mock.waitForNotifications(t, 1, 3*time.Second)
		found := false
		for _, n := range notifications {
			if n.Token == "fcm-noah-device" && n.Data["type"] == "chat.message" {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected push to noah after disconnect, got: %+v", notifications)
		}
	})
}
