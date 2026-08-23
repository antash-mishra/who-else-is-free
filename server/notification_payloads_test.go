package main

import "testing"

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
