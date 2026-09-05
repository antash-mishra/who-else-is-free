package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// inboxRow filters a user's notifications by type, returning the first match.
func fetchInboxRow(t *testing.T, env *apiTestEnv, token, wantType string) NotificationView {
	t.Helper()
	resp := env.doRequest(t, http.MethodGet, "/api/notifications?limit=100", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/notifications: %d", resp.StatusCode)
	}
	list := decodeJSON[notificationsListResponse](t, resp)
	for _, n := range list.Notifications {
		if n.Type == wantType {
			return n
		}
	}
	t.Fatalf("no %q notification in inbox (%d rows): %+v", wantType, len(list.Notifications), list.Notifications)
	return NotificationView{}
}

func waitForInboxRow(t *testing.T, env *apiTestEnv, token, wantType string, timeout time.Duration) NotificationView {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		resp := env.doRequest(t, http.MethodGet, "/api/notifications?limit=100", token, nil)
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			if time.Now().After(deadline) {
				t.Fatalf("GET /api/notifications: %d", resp.StatusCode)
			}
			time.Sleep(50 * time.Millisecond)
			continue
		}
		list := decodeJSON[notificationsListResponse](t, resp)
		for _, n := range list.Notifications {
			if n.Type == wantType {
				return n
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %q notification in inbox (%d rows): %+v", wantType, len(list.Notifications), list.Notifications)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// TestNotificationInboxPersistsPerScenario drives each push-triggering
// scenario end-to-end through the API and asserts the inbox endpoint returns
// a row with the expected body — including the three "harsh"-type override
// bodies owned server-side. See notification-inbox-plan.md (Step 2 tests).
func TestNotificationInboxPersistsPerScenario(t *testing.T) {
	env := setupAPITestEnv(t) // NoopPushSender is fine: rows persist regardless of tokens.

	avaToken := env.issueTokenForEmail(t, "ava@example.com")   // user 1, host
	noahToken := env.issueTokenForEmail(t, "noah@example.com") // user 4

	ctx := context.Background()
	noahUser, err := env.repo.GetUserByEmail(ctx, "noah@example.com")
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

	t.Run("join_request.created persisted for host", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Created")
		joinBody := map[string]string{"message": "let me in"}
		resp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, joinBody)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", resp.StatusCode)
		}
		resp.Body.Close()

		row := waitForInboxRow(t, env, avaToken, "join_request.created", 3*time.Second)
		if row.Body != "Noah Smith wants to join your plan Inbox Created." {
			t.Fatalf("inbox body = %q, want canonical plan copy", row.Body)
		}
		if row.Read {
			t.Fatal("new row should be unread")
		}
		if row.JoinRequestID == nil || *row.JoinRequestID <= 0 {
			t.Fatalf("join_request_id = %v, want stable request identity", row.JoinRequestID)
		}
		var payload map[string]string
		if err := json.Unmarshal([]byte(row.Payload), &payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		if payload["requesterId"] != strconv.FormatInt(noahID, 10) || payload["senderName"] == "" {
			t.Fatalf("request identity payload = %+v", payload)
		}
		if payload["coverKey"] != defaultCoverKey {
			t.Fatalf("coverKey = %q, want the event cover %q so the banner can show the plan artwork", payload["coverKey"], defaultCoverKey)
		}
		if _, ok := payload["senderAvatar"]; ok {
			t.Fatalf("senderAvatar must be omitted when the requester has no remote avatar: %+v", payload)
		}
	})

	t.Run("join_request.approved persisted for requester", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Approved")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "approve me"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()

		approveResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", eventID, noahID), avaToken, nil)
		if approveResp.StatusCode != http.StatusOK {
			t.Fatalf("approve: %d", approveResp.StatusCode)
		}
		approveResp.Body.Close()

		row := waitForInboxRow(t, env, noahToken, "join_request.approved", 3*time.Second)
		if row.Body != "Your request to join the plan Inbox Approved has been approved." {
			t.Fatalf("inbox body = %q, want canonical plan copy", row.Body)
		}
		if row.JoinRequestID == nil || *row.JoinRequestID <= 0 {
			t.Fatalf("approval join_request_id = %v", row.JoinRequestID)
		}
		hostTask := fetchInboxRow(t, env, avaToken, NotificationTypeJoinRequestCreated)
		if hostTask.EventID == nil || *hostTask.EventID != eventID || hostTask.ActionState != NotificationActionResolved || !hostTask.Read {
			t.Fatalf("approved host task = %+v", hostTask)
		}
		if hostTask.ActionReason == nil || *hostTask.ActionReason != NotificationReasonRequestApproved {
			t.Fatalf("approved host task reason = %v", hostTask.ActionReason)
		}
	})

	t.Run("join_request.denied persisted with override body", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Denied")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "deny me"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()

		denyResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/%d/deny", eventID, noahID), avaToken, nil)
		if denyResp.StatusCode != http.StatusOK {
			t.Fatalf("deny: %d", denyResp.StatusCode)
		}
		denyResp.Body.Close()

		row := waitForInboxRow(t, env, noahToken, "join_request.denied", 3*time.Second)
		const want = "Inbox Denied is no longer available to you. Explore other plans nearby."
		if row.Body != want {
			t.Fatalf("override body = %q, want %q", row.Body, want)
		}
		hostTask := fetchInboxRow(t, env, avaToken, NotificationTypeJoinRequestCreated)
		if hostTask.EventID == nil || *hostTask.EventID != eventID || hostTask.ActionState != NotificationActionResolved || !hostTask.Read {
			t.Fatalf("denied host task = %+v", hostTask)
		}
		if hostTask.ActionReason == nil || *hostTask.ActionReason != NotificationReasonRequestDenied {
			t.Fatalf("denied host task reason = %v", hostTask.ActionReason)
		}
	})

	t.Run("join request cancellation resolves host task", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Cancelled")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "cancel me"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()
		_ = waitForInboxRow(t, env, avaToken, NotificationTypeJoinRequestCreated, 3*time.Second)

		cancelResp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/requests/me", eventID), noahToken, nil)
		if cancelResp.StatusCode != http.StatusOK {
			t.Fatalf("cancel request: %d", cancelResp.StatusCode)
		}
		cancelResp.Body.Close()

		hostTask := fetchInboxRow(t, env, avaToken, NotificationTypeJoinRequestCreated)
		if hostTask.EventID == nil || *hostTask.EventID != eventID || hostTask.ActionState != NotificationActionResolved || !hostTask.Read {
			t.Fatalf("cancelled host task = %+v", hostTask)
		}
		if hostTask.ActionReason == nil || *hostTask.ActionReason != NotificationReasonRequestCancelled {
			t.Fatalf("cancelled host task reason = %v", hostTask.ActionReason)
		}
	})

	t.Run("event.member_removed persisted with override body", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Removed")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "then remove me"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()
		approveResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", eventID, noahID), avaToken, nil)
		if approveResp.StatusCode != http.StatusOK {
			t.Fatalf("approve: %d", approveResp.StatusCode)
		}
		approveResp.Body.Close()
		time.Sleep(150 * time.Millisecond) // let approve push settle

		removeResp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d/chat/members/%d", eventID, noahID), avaToken, nil)
		if removeResp.StatusCode != http.StatusNoContent {
			t.Fatalf("remove member: %d", removeResp.StatusCode)
		}
		removeResp.Body.Close()

		row := waitForInboxRow(t, env, noahToken, "event.member_removed", 3*time.Second)
		const want = "You no longer have access to the Inbox Removed. Explore other plans nearby."
		if row.Body != want {
			t.Fatalf("override body = %q, want %q", row.Body, want)
		}
	})

	t.Run("event.deleted persisted with override body", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Event Deleted")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "then delete event"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()
		approveResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", eventID, noahID), avaToken, nil)
		if approveResp.StatusCode != http.StatusOK {
			t.Fatalf("approve: %d", approveResp.StatusCode)
		}
		approveResp.Body.Close()
		time.Sleep(150 * time.Millisecond)

		deleteResp := env.doRequest(t, http.MethodDelete, fmt.Sprintf("/api/events/%d", eventID), avaToken, nil)
		if deleteResp.StatusCode != http.StatusOK {
			t.Fatalf("delete event: %d", deleteResp.StatusCode)
		}
		deleteResp.Body.Close()

		row := waitForInboxRow(t, env, noahToken, "event.deleted", 3*time.Second)
		const want = "Inbox Event Deleted has been cancelled and is no longer happening. Explore other events nearby."
		if row.Body != want {
			t.Fatalf("override body = %q, want %q", row.Body, want)
		}
	})

	t.Run("chat.message persisted per recipient", func(t *testing.T) {
		eventID := createGroupEvent(t, "Inbox Chat Message")
		joinResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests", eventID), noahToken, map[string]string{"message": "for chat"})
		if joinResp.StatusCode != http.StatusCreated {
			t.Fatalf("join request: %d", joinResp.StatusCode)
		}
		joinResp.Body.Close()
		approveResp := env.doRequest(t, http.MethodPost, fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", eventID, noahID), avaToken, nil)
		if approveResp.StatusCode != http.StatusOK {
			t.Fatalf("approve: %d", approveResp.StatusCode)
		}
		approveResp.Body.Close()
		time.Sleep(150 * time.Millisecond)

		// Host lists event conversation, then noah sends a message over WS.
		convResp := env.doRequest(t, http.MethodGet, fmt.Sprintf("/api/events/%d/conversations", eventID), avaToken, nil)
		if convResp.StatusCode != http.StatusOK {
			t.Fatalf("list conversations: %d", convResp.StatusCode)
		}
		convos := decodeJSON[eventConversationsResponse](t, convResp)
		if len(convos.Conversations) == 0 {
			t.Fatal("no conversations for event")
		}
		conversationID := convos.Conversations[0].ID

		noahDialURL := strings.Replace(env.server.URL, "http", env.wsScheme, 1) + "/api/ws?token=" + url.QueryEscape(noahToken)
		noahWS, _, err := websocket.DefaultDialer.Dial(noahDialURL, nil)
		if err != nil {
			t.Fatalf("noah ws dial: %v", err)
		}
		defer noahWS.Close()

		if err := noahWS.WriteJSON(map[string]any{
			"type":           "message:send",
			"conversationId": conversationID,
			"body":           "inbox me please",
			"tempId":         fmt.Sprintf("temp-%d", time.Now().UnixNano()),
		}); err != nil {
			t.Fatalf("noah ws send: %v", err)
		}

		// Await the push goroutine + row insert for the host (ava).
		row := waitForInboxRow(t, env, avaToken, "chat.message", 4*time.Second)
		if !strings.Contains(row.Body, "inbox me please") {
			t.Fatalf("inbox body = %q, want sender-prefixed preview", row.Body)
		}
	})

	// Confirm every known outcome uses the canonical plan copy.
	t.Run("legacy outcome copy does not leak", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodGet, "/api/notifications?limit=100", noahToken, nil)
		list := decodeJSON[notificationsListResponse](t, resp)
		for _, n := range list.Notifications {
			switch n.Type {
			case "join_request.denied":
				if n.Body == "Your request to join was declined" {
					t.Fatalf("denied row leaked raw push body")
				}
			case "event.member_removed":
				if n.Body == "The host removed you from this event." {
					t.Fatalf("removed row leaked raw push body")
				}
			case "event.deleted":
				if n.Body == "The host deleted this event." {
					t.Fatalf("deleted row leaked raw push body")
				}
			}
		}
	})
}
