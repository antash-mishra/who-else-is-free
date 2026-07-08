package main

import "fmt"

// NotificationType* constants mirror the push-payload "type" values sent to
// the OS. They are the single source of truth for the types that can be
// persisted to the notifications table.
const (
	NotificationTypeChatMessage       = "chat.message"
	NotificationTypeJoinRequestCreated = "join_request.created"
	NotificationTypeJoinRequestApproved = "join_request.approved"
	NotificationTypeJoinRequestDenied  = "join_request.denied"
	NotificationTypeMemberRemoved     = "event.member_removed"
	NotificationTypeEventDeleted      = "event.deleted"
)

// notificationDisplayTexts holds the INBOX-display title/body for each type.
// The raw push body sent to the OS via FCM is unchanged; this map only swaps
// the text shown inside the NotificationsScreen. For the three "harsh"
// override scenarios the inbox shows friendlier phrasing; all other types
// render the raw push body verbatim.
//
// The title from the push payload is always reused as-is for the inbox title.
// Only body may be overridden here. When a type has no entry, the inbox uses
// the raw push body verbatim.
var notificationDisplayTexts = map[string]string{
	NotificationTypeJoinRequestDenied: "This event is no longer available to you. Explore other events nearby.",
	NotificationTypeMemberRemoved:     "You no longer have access to this event. Explore other events nearby.",
	NotificationTypeEventDeleted:      "This event has been cancelled and is no longer available. Explore other events nearby.",
}

// inboxDisplayBody returns the body string to persist for the inbox. It swaps
// in the friendlier override text for the three harsh types and passes
// everything else through verbatim.
func inboxDisplayBody(nType, rawPushBody string) string {
	if override, ok := notificationDisplayTexts[nType]; ok {
		return override
	}
	return rawPushBody
}

// buildNotification constructs a Notification value ready for
// CreateNotification from the components of a push. nType is one of the
// NotificationType* constants. The raw push body is the OS-notification body
// (unchanged on the wire); the inbox body is derived from it via
// inboxDisplayBody. payloadJSON is the opaque serialized push data map (may be
// empty). eventID / conversationID may be nil.
func buildNotification(
	userID int64,
	nType string,
	eventID, conversationID *int64,
	title, rawPushBody, payloadJSON string,
) Notification {
	return Notification{
		UserID:         userID,
		Type:           nType,
		EventID:        eventID,
		ConversationID: conversationID,
		Title:          title,
		Body:           inboxDisplayBody(nType, rawPushBody),
		Payload:        payloadJSON,
	}
}

// payloadField extracts a string field from a push data map, returning "" if
// absent. Used to pull the raw push body/title out of the map when recording.
func payloadField(data map[string]string, key string) string {
	if data == nil {
		return ""
	}
	return data[key]
}

// int64PtrOrNil returns nil for a zero/empty value, else a pointer. Used when
// lifting eventId/conversationId from the push data map into the Notification.
func int64PtrOrNil(s string) *int64 {
	if s == "" {
		return nil
	}
	var v int64
	if _, err := fmt.Sscanf(s, "%d", &v); err != nil || v == 0 {
		return nil
	}
	return &v
}
