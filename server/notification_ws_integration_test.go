package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// wsNotificationFrame decodes the `notification:new` envelope emitted by the hub.
type wsNotificationFrame struct {
	Type         string           `json:"type"`
	Notification NotificationView `json:"notification"`
}

// readWSFrameOfType reads frames from conn until one with the wanted `type`
// arrives (skipping unrelated frames such as `message:new` or `pong`) or the
// timeout elapses. Returns the raw JSON of the matching frame.
func readWSFrameOfType(t *testing.T, conn *websocket.Conn, wantType string, timeout time.Duration) []byte {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		if err := conn.SetReadDeadline(deadline); err != nil {
			t.Fatalf("set read deadline: %v", err)
		}
		_, raw, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for %q frame: %v", wantType, err)
		}
		var probe struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &probe); err != nil {
			t.Fatalf("decode frame %s: %v", raw, err)
		}
		if probe.Type == wantType {
			return raw
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %q frame", wantType)
		}
	}
}

func dialWS(t *testing.T, env *apiTestEnv, token string) *websocket.Conn {
	t.Helper()
	dialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(token)
	conn, _, err := websocket.DefaultDialer.Dial(dialURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

// TestNotificationNewFrameOverWebSocket asserts that every persisted inbox row
// is also delivered live as a `notification:new` frame to the owner's sockets,
// carrying the same view the REST inbox returns.
func TestNotificationNewFrameOverWebSocket(t *testing.T) {
	push := &mockPushSender{}
	env := setupAPITestEnvWithPush(t, push)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // requester

	noahUser, err := env.repo.GetUserByEmail(t.Context(), "noah@example.com")
	if err != nil {
		t.Fatalf("load noah: %v", err)
	}
	noahID := noahUser.ID

	createGroupEvent := func(t *testing.T, title string) int64 {
		t.Helper()
		body := CreateEventParams{
			Title:     title,
			Location:  "Test Location",
			Time:      "23:59",
			EventDate: time.Now().Add(48 * time.Hour).Format("2006-01-02"),
			Gender:    "Any", MinAge: 18, MaxAge: 50, GroupType: "Group",
			CoverKey: defaultCoverKey,
		}
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create event: %d", resp.StatusCode)
		}
		return decodeJSON[createEventResponse](t, resp).ID
	}

	t.Run("join_request.created reaches the host socket", func(t *testing.T) {
		eventID := createGroupEvent(t, "WS Frame Created")
		avaWS := dialWS(t, env, avaToken)
		time.Sleep(100 * time.Millisecond) // let the hub register the socket

		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "hi"})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", resp.StatusCode)
		}
		resp.Body.Close()

		raw := readWSFrameOfType(t, avaWS, "notification:new", 3*time.Second)
		var frame wsNotificationFrame
		if err := json.Unmarshal(raw, &frame); err != nil {
			t.Fatalf("decode notification:new: %v", err)
		}
		n := frame.Notification
		if n.Type != NotificationTypeJoinRequestCreated {
			t.Fatalf("frame type = %q, want join_request.created", n.Type)
		}
		if n.ID <= 0 || n.Read || n.ActionState != NotificationActionActive || n.CreatedAt == "" {
			t.Fatalf("frame view incomplete: %+v", n)
		}
		if n.EventID == nil || *n.EventID != eventID {
			t.Fatalf("frame event_id = %v, want %d", n.EventID, eventID)
		}
		if n.JoinRequestID == nil || *n.JoinRequestID <= 0 {
			t.Fatalf("frame join_request_id = %v", n.JoinRequestID)
		}

		// Same identity and copy as the REST inbox row.
		row := waitForInboxRow(t, env, avaToken, NotificationTypeJoinRequestCreated, 2*time.Second)
		if row.ID != n.ID || row.Body != n.Body || row.Payload != n.Payload {
			t.Fatalf("frame/inbox mismatch:\nframe=%+v\ninbox=%+v", n, row)
		}

		// Wire field names must match the REST view exactly.
		var generic map[string]any
		if err := json.Unmarshal(raw, &generic); err != nil {
			t.Fatalf("decode generic: %v", err)
		}
		view, _ := generic["notification"].(map[string]any)
		for _, key := range []string{"id", "type", "event_id", "conversation_id", "join_request_id", "title", "body", "payload", "read", "action_state", "created_at"} {
			if _, ok := view[key]; !ok {
				t.Fatalf("frame notification missing %q: %v", key, view)
			}
		}
	})

	t.Run("chat.message reaches the recipient after message:new", func(t *testing.T) {
		eventID := createGroupEvent(t, "WS Frame Chat")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "chat"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()
		approveResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", eventID, noahID), avaToken, nil)
		if approveResp.StatusCode != http.StatusOK {
			t.Fatalf("approve: %d", approveResp.StatusCode)
		}
		approveResp.Body.Close()

		convResp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", eventID), avaToken, nil)
		if convResp.StatusCode != http.StatusOK {
			t.Fatalf("list conversations: %d", convResp.StatusCode)
		}
		convos := decodeJSON[eventConversationsResponse](t, convResp)
		if len(convos.Conversations) == 0 {
			t.Fatal("no conversations for event")
		}
		conversationID := convos.Conversations[0].ID

		// Host is connected but NOT viewing this conversation, so the row is
		// recorded and the frame must arrive.
		avaWS := dialWS(t, env, avaToken)
		noahWS := dialWS(t, env, noahToken)
		time.Sleep(100 * time.Millisecond)

		if err := noahWS.WriteJSON(map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           "live frame please",
			"tempId":         fmt.Sprintf("temp-%d", time.Now().UnixNano()),
		}); err != nil {
			t.Fatalf("noah ws send: %v", err)
		}

		// Ava receives the chat broadcast first, then the inbox frame.
		first := readWSFrameOfType(t, avaWS, "message:new", 3*time.Second)
		if !strings.Contains(string(first), "live frame please") {
			t.Fatalf("message:new body = %s", first)
		}
		raw := readWSFrameOfType(t, avaWS, "notification:new", 4*time.Second)
		var frame wsNotificationFrame
		if err := json.Unmarshal(raw, &frame); err != nil {
			t.Fatalf("decode notification:new: %v", err)
		}
		if frame.Notification.Type != NotificationTypeChatMessage {
			t.Fatalf("frame type = %q, want chat.message", frame.Notification.Type)
		}
		if frame.Notification.ConversationID == nil || *frame.Notification.ConversationID != conversationID {
			t.Fatalf("frame conversation_id = %v, want %d", frame.Notification.ConversationID, conversationID)
		}
		if !strings.Contains(frame.Notification.Body, "live frame please") {
			t.Fatalf("frame body = %q", frame.Notification.Body)
		}

		// The sender never receives an inbox frame for their own message.
		if err := noahWS.SetReadDeadline(time.Now().Add(500 * time.Millisecond)); err != nil {
			t.Fatalf("set deadline: %v", err)
		}
		for {
			_, msg, err := noahWS.ReadMessage()
			if err != nil {
				break // timeout: no more frames
			}
			if strings.Contains(string(msg), `"notification:new"`) {
				t.Fatalf("sender received notification:new: %s", msg)
			}
		}
	})

	t.Run("recipient without a socket still gets the row and push", func(t *testing.T) {
		push.reset()
		eventID := createGroupEvent(t, "WS Frame Offline")
		// Register a push token for ava so the push path is exercised.
		tokenResp := env.doRequest(t, http.MethodPost, "/api/push-tokens", avaToken, map[string]string{"token": "ava-offline-token", "device_id": "ava-device", "platform": "android"})
		if tokenResp.StatusCode != http.StatusOK {
			t.Fatalf("register push token: %d", tokenResp.StatusCode)
		}
		tokenResp.Body.Close()

		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "offline"})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", resp.StatusCode)
		}
		resp.Body.Close()

		row := waitForInboxRow(t, env, avaToken, NotificationTypeJoinRequestCreated, 3*time.Second)
		if row.EventID == nil || *row.EventID != eventID {
			t.Fatalf("offline row event_id = %v, want %d", row.EventID, eventID)
		}
		got := push.waitForNotifications(t, 1, 3*time.Second)
		if got[0].Data["type"] != NotificationTypeJoinRequestCreated {
			t.Fatalf("push type = %q", got[0].Data["type"])
		}
	})
}
