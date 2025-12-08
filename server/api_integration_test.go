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

	t.Run("reject past date and time", func(t *testing.T) {
		token := env.issueTokenForEmail(t, "ava@example.com")
		yesterday := time.Now().Add(-24 * time.Hour).Format("2006-01-02")
		body := CreateEventParams{
			Title:     "Past Event",
			Location:  "Nowhere",
			Time:      "12:00",
			EventDate: yesterday,
			Gender:    "Any",
			MinAge:    18,
			MaxAge:    30,
			GroupType: "Single",
			CoverKey:  defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 for past date, got %d", resp.StatusCode)
		}
	})

	t.Run("reject past time today", func(t *testing.T) {
		token := env.issueTokenForEmail(t, "ava@example.com")
		now := time.Now()
		today := now.Format("2006-01-02")
		pastTime := now.Add(-1 * time.Hour).Format("15:04")
		body := CreateEventParams{
			Title:     "Past Time",
			Location:  "Somewhere",
			Time:      pastTime,
			EventDate: today,
			Gender:    "Any",
			MinAge:    18,
			MaxAge:    40,
			GroupType: "Group",
			CoverKey:  defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 for past time today, got %d", resp.StatusCode)
		}
	})

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
