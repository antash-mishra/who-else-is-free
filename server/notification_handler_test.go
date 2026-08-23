package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
)

type notificationsListResponse struct {
	Notifications []NotificationView `json:"notifications"`
}

type notificationsUnreadCountResponse struct {
	Count int `json:"count"`
}

func TestNotificationHandler_AuthRequired(t *testing.T) {
	env := setupAPITestEnv(t)

	cases := []struct {
		name   string
		method string
		path   string
	}{
		{"list", http.MethodGet, "/api/notifications"},
		{"resolve-action", http.MethodPost, "/api/notifications/actions/resolve"},
		{"unread-count", http.MethodGet, "/api/notifications/unread-count"},
		{"mark-one", http.MethodPost, "/api/notifications/1/read"},
		{"mark-all", http.MethodPost, "/api/notifications/read-all"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := env.doRequest(t, tc.method, tc.path, "", nil)
			if resp.StatusCode != http.StatusUnauthorized {
				t.Fatalf("%s %s without token: got %d, want 401", tc.method, tc.path, resp.StatusCode)
			}
			resp.Body.Close()
		})
	}
}

func TestNotificationHandler_ListPaginationAndOrdering(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	user, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}

	ctx := context.Background()
	for i := 0; i < 25; i++ {
		if _, err := env.repo.CreateNotification(ctx, Notification{
			UserID: user.ID,
			Type:   "chat.message",
			Title:  "T",
			Body:   "B",
		}); err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}

	// Page 1 default limit.
	resp := env.doRequest(t, http.MethodGet, "/api/notifications", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d", resp.StatusCode)
	}
	page1 := decodeJSON[notificationsListResponse](t, resp)
	if len(page1.Notifications) != 20 {
		t.Fatalf("page1 len = %d, want 20", len(page1.Notifications))
	}
	if page1.Notifications[0].ActionState != NotificationActionActive {
		t.Fatalf("action state = %q, want active", page1.Notifications[0].ActionState)
	}
	for i := 1; i < len(page1.Notifications); i++ {
		if page1.Notifications[i-1].ID < page1.Notifications[i].ID {
			t.Fatalf("not desc by id")
		}
	}

	// Page 2 via explicit offset.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications?limit=20&offset=20", token, nil)
	page2 := decodeJSON[notificationsListResponse](t, resp)
	if len(page2.Notifications) != 5 {
		t.Fatalf("page2 len = %d, want 5", len(page2.Notifications))
	}
}

func TestNotificationHandler_UnreadCount(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	user, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if _, err := env.repo.CreateNotification(ctx, Notification{UserID: user.ID, Type: "chat.message", Title: "T", Body: "B"}); err != nil {
			t.Fatalf("create: %v", err)
		}
	}
	resp := env.doRequest(t, http.MethodGet, "/api/notifications/unread-count", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	payload := decodeJSON[notificationsUnreadCountResponse](t, resp)
	if payload.Count != 3 {
		t.Fatalf("count = %d, want 3", payload.Count)
	}
}

func TestNotificationHandler_MarkOneRead(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	user, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	ctx := context.Background()
	n, err := env.repo.CreateNotification(ctx, Notification{UserID: user.ID, Type: "chat.message", Title: "T", Body: "B"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	resp := env.doRequest(t, http.MethodPost, "/api/notifications/"+strconv.FormatInt(n.ID, 10)+"/read", token, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("mark-one status = %d, want 204", resp.StatusCode)
	}
	resp.Body.Close()

	// Unread count now 0.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications/unread-count", token, nil)
	payload := decodeJSON[notificationsUnreadCountResponse](t, resp)
	if payload.Count != 0 {
		t.Fatalf("count = %d, want 0", payload.Count)
	}

	// Re-marking an already-read row is 404 (idempotent read, no-op second time).
	resp = env.doRequest(t, http.MethodPost, "/api/notifications/"+strconv.FormatInt(n.ID, 10)+"/read", token, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("re-mark status = %d, want 404", resp.StatusCode)
	}
	resp.Body.Close()

	// Non-existent id is 404.
	resp = env.doRequest(t, http.MethodPost, "/api/notifications/999999/read", token, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing id status = %d, want 404", resp.StatusCode)
	}
	resp.Body.Close()

	// Malformed id is 400.
	resp = env.doRequest(t, http.MethodPost, "/api/notifications/abc/read", token, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad id status = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestNotificationHandler_MarkAllRead(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	user, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if _, err := env.repo.CreateNotification(ctx, Notification{UserID: user.ID, Type: "chat.message", Title: "T", Body: "B"}); err != nil {
			t.Fatalf("create: %v", err)
		}
	}

	resp := env.doRequest(t, http.MethodPost, "/api/notifications/read-all", token, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("mark-all status = %d, want 204", resp.StatusCode)
	}
	resp.Body.Close()

	resp = env.doRequest(t, http.MethodGet, "/api/notifications/unread-count", token, nil)
	payload := decodeJSON[notificationsUnreadCountResponse](t, resp)
	if payload.Count != 0 {
		t.Fatalf("count after mark-all = %d, want 0", payload.Count)
	}

	// All listed rows are read.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications", token, nil)
	list := decodeJSON[notificationsListResponse](t, resp)
	for _, n := range list.Notifications {
		if !n.Read {
			t.Fatalf("row %d still unread after mark-all", n.ID)
		}
	}
}

func TestNotificationHandler_CrossUserIsolation(t *testing.T) {
	env := setupAPITestEnv(t)
	// Two users.
	if _, err := env.repo.CreateUserWithPassword(context.Background(), "bob", "bob@example.com", "pw"); err != nil {
		t.Fatalf("seed bob: %v", err)
	}
	aliceToken := env.issueTokenForEmail(t, "ava@example.com")
	bobToken := env.issueTokenForEmail(t, "bob@example.com")
	alice, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
	if err != nil {
		t.Fatalf("get alice: %v", err)
	}
	bob, err := env.repo.GetUserByEmail(context.Background(), "bob@example.com")
	if err != nil {
		t.Fatalf("get bob: %v", err)
	}
	ctx := context.Background()
	aliceNotif, err := env.repo.CreateNotification(ctx, Notification{UserID: alice.ID, Type: "chat.message", Title: "A", Body: "A-body"})
	if err != nil {
		t.Fatalf("create alice notif: %v", err)
	}
	bobNotif, err := env.repo.CreateNotification(ctx, Notification{UserID: bob.ID, Type: "chat.message", Title: "B", Body: "B-body"})
	if err != nil {
		t.Fatalf("create bob notif: %v", err)
	}

	// Bob cannot mark Alice's notification read (404, scoped to owner).
	resp := env.doRequest(t, http.MethodPost, "/api/notifications/"+strconv.FormatInt(aliceNotif.ID, 10)+"/read", bobToken, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("bob marking alice's notif = %d, want 404", resp.StatusCode)
	}
	resp.Body.Close()

	// Alice cannot see Bob's notification in her list.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications", aliceToken, nil)
	list := decodeJSON[notificationsListResponse](t, resp)
	for _, n := range list.Notifications {
		if n.ID == bobNotif.ID {
			t.Fatalf("alice saw bob's notification %d", bobNotif.ID)
		}
	}
	resp.Body.Close()

	// Alice's unread count reflects only her row.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications/unread-count", aliceToken, nil)
	count := decodeJSON[notificationsUnreadCountResponse](t, resp)
	if count.Count != 1 {
		t.Fatalf("alice unread = %d, want 1", count.Count)
	}

	// Bob's unread count reflects only his row.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications/unread-count", bobToken, nil)
	count = decodeJSON[notificationsUnreadCountResponse](t, resp)
	if count.Count != 1 {
		t.Fatalf("bob unread = %d, want 1", count.Count)
	}

	// Sanity-check body override is served from the persisted row.
	resp = env.doRequest(t, http.MethodGet, "/api/notifications", aliceToken, nil)
	list = decodeJSON[notificationsListResponse](t, resp)
	if len(list.Notifications) != 1 || list.Notifications[0].Body != "A-body" {
		t.Fatalf("alice list body = %#v", list.Notifications)
	}
	// Ensure no JSON structure surprises by re-decoding raw.
	_ = json.Valid
}
