package main

import (
	"strings"
	"testing"
)

func TestNotificationCategoryForType(t *testing.T) {
	tests := []struct {
		name             string
		notificationType string
		want             NotificationCategory
	}{
		{"chat task", NotificationTypeChatMessage, NotificationCategoryTask},
		{"join request task", NotificationTypeJoinRequestCreated, NotificationCategoryTask},
		{"approval outcome", NotificationTypeJoinRequestApproved, NotificationCategoryOutcome},
		{"denial outcome", NotificationTypeJoinRequestDenied, NotificationCategoryOutcome},
		{"member removed outcome", NotificationTypeMemberRemoved, NotificationCategoryOutcome},
		{"event deleted outcome", NotificationTypeEventDeleted, NotificationCategoryOutcome},
		{"future type", "future.notification", NotificationCategoryUnknown},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := notificationCategoryForType(test.notificationType); got != test.want {
				t.Fatalf("category = %q, want %q", got, test.want)
			}
		})
	}
}

func TestNotificationCopyFor(t *testing.T) {
	tests := []struct {
		name      string
		nType     string
		title     string
		actor     string
		wantPush  string
		wantInbox string
	}{
		{
			"join request created", NotificationTypeJoinRequestCreated, "Hike", "Alice",
			"Alice wants to join your plan Hike",
			"Alice wants to join your plan Hike.",
		},
		{
			"join request approved", NotificationTypeJoinRequestApproved, "Hike", "",
			"Your request to join the plan Hike has been approved",
			"Your request to join the plan Hike has been approved.",
		},
		{
			"join request denied", NotificationTypeJoinRequestDenied, "Hike", "",
			"Hike is no longer available to you. Explore other plans nearby.",
			"Hike is no longer available to you. Explore other plans nearby.",
		},
		{
			"member removed", NotificationTypeMemberRemoved, "Hike", "",
			"You no longer have access to the Hike. Explore other plans nearby.",
			"You no longer have access to the Hike. Explore other plans nearby.",
		},
		{
			"event deleted", NotificationTypeEventDeleted, "Hike", "",
			"Hike has been cancelled and is no longer happening. Explore other events nearby.",
			"Hike has been cancelled and is no longer happening. Explore other events nearby.",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			copy, ok := notificationCopyFor(test.nType, test.title, test.actor)
			if !ok {
				t.Fatal("notificationCopyFor returned ok=false")
			}
			if copy.PushBody != test.wantPush {
				t.Fatalf("push body = %q, want %q", copy.PushBody, test.wantPush)
			}
			if copy.InboxBody != test.wantInbox {
				t.Fatalf("inbox body = %q, want %q", copy.InboxBody, test.wantInbox)
			}
			if got := inboxDisplayBody(test.nType, copy.PushBody); got != test.wantInbox {
				t.Fatalf("persisted body = %q, want %q", got, test.wantInbox)
			}
		})
	}
}

func TestPayloadAvatarOnlyForwardsShortRemoteURLs(t *testing.T) {
	long := "https://cdn.example/" + strings.Repeat("a", maxPayloadAvatarLength)
	base64Avatar := "/9j/4AAQSkZJRgABAQAAAQABAAD"
	tests := []struct {
		name   string
		avatar *string
		want   string
	}{
		{"nil", nil, ""},
		{"empty", ptr(""), ""},
		{"https url", ptr("https://cdn.example/u/4.jpg"), "https://cdn.example/u/4.jpg"},
		{"http url", ptr("http://cdn.example/u/4.jpg"), "http://cdn.example/u/4.jpg"},
		{"inline base64 is dropped", ptr(base64Avatar), ""},
		{"too long is dropped", ptr(long), ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := payloadAvatar(test.avatar); got != test.want {
				t.Fatalf("payloadAvatar = %q, want %q", got, test.want)
			}
		})
	}
}

func TestSetPayloadIfPresent(t *testing.T) {
	data := map[string]string{"type": "x"}
	setPayloadIfPresent(data, "coverKey", "")
	setPayloadIfPresent(data, "senderAvatar", "https://cdn.example/a.jpg")
	if _, ok := data["coverKey"]; ok {
		t.Fatal("empty value must not be written")
	}
	if data["senderAvatar"] != "https://cdn.example/a.jpg" {
		t.Fatalf("senderAvatar = %q", data["senderAvatar"])
	}
}

func ptr(s string) *string { return &s }
