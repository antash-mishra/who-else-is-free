package main

import (
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestNotificationActions_DeletedEventRegression(t *testing.T) {
	env := setupAPITestEnv(t)
	hostToken := env.issueTokenForEmail(t, "ava@example.com")
	requesterToken := env.issueTokenForEmail(t, "noah@example.com")

	createResponse := env.doRequest(t, http.MethodPost, "/api/events", hostToken, CreateEventParams{
		Title:       "Stale request regression",
		Location:    "Trail",
		Time:        "10:00",
		EventDate:   time.Now().Add(48 * time.Hour).Format("2006-01-02"),
		Description: "Regression",
		Gender:      "Any",
		MinAge:      18,
		MaxAge:      99,
		GroupType:   "Group",
		CoverKey:    defaultCoverKey,
	})
	if createResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create event: %d", createResponse.StatusCode)
	}
	eventID := decodeJSON[createEventResponse](t, createResponse).ID

	requestResponse := env.doRequest(
		t,
		http.MethodPost,
		fmt.Sprintf("/api/events/%d/chat/requests", eventID),
		requesterToken,
		map[string]string{"message": "Please add me"},
	)
	if requestResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create join request: %d", requestResponse.StatusCode)
	}
	requestResponse.Body.Close()
	notification := waitForInboxRow(t, env, hostToken, NotificationTypeJoinRequestCreated, 3*time.Second)

	deleteResponse := env.doRequest(
		t,
		http.MethodDelete,
		fmt.Sprintf("/api/events/%d", eventID),
		hostToken,
		nil,
	)
	if deleteResponse.StatusCode != http.StatusOK {
		t.Fatalf("delete event: %d", deleteResponse.StatusCode)
	}
	deleteResponse.Body.Close()

	row := fetchInboxRow(t, env, hostToken, NotificationTypeJoinRequestCreated)
	if row.ActionState != NotificationActionUnavailable || !row.Read {
		t.Fatalf("stale host row = %+v, want read/unavailable", row)
	}
	if row.ActionReason == nil || *row.ActionReason != NotificationReasonEventDeleted {
		t.Fatalf("stale host row reason = %v", row.ActionReason)
	}

	countResponse := env.doRequest(t, http.MethodGet, "/api/notifications/unread-count", hostToken, nil)
	count := decodeJSON[notificationsUnreadCountResponse](t, countResponse)
	if count.Count != 0 {
		t.Fatalf("unread count = %d, want 0", count.Count)
	}

	resolveResponse := env.doRequest(
		t,
		http.MethodPost,
		"/api/notifications/actions/resolve",
		hostToken,
		notificationActionResolveRequest{
			NotificationIDs: []int64{notification.ID},
			MarkHandled:     true,
		},
	)
	if resolveResponse.StatusCode != http.StatusOK {
		t.Fatalf("resolve action: %d", resolveResponse.StatusCode)
	}
	resolution := decodeJSON[NotificationActionResolution](t, resolveResponse)
	if resolution.Status != NotificationActionUnavailable || resolution.Destination != NotificationDestinationEvents {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Reason == nil || *resolution.Reason != NotificationReasonEventDeleted {
		t.Fatalf("resolution reason = %v", resolution.Reason)
	}
}
