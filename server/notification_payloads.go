package main

import (
	"fmt"
	"strings"
)

// NotificationType* constants mirror the push-payload "type" values sent to
// the OS. They are the single source of truth for the types that can be
// persisted to the notifications table.
const (
	NotificationTypeChatMessage         = "chat.message"
	NotificationTypeJoinRequestCreated  = "join_request.created"
	NotificationTypeJoinRequestApproved = "join_request.approved"
	NotificationTypeJoinRequestDenied   = "join_request.denied"
	NotificationTypeMemberRemoved       = "event.member_removed"
	NotificationTypeEventDeleted        = "event.deleted"
)

// Notification categories control inbox grouping/retention independently of
// action state. Tasks point at work that can become handled or unavailable;
// outcomes remain historical records even when their original target is gone.
type NotificationCategory string

const (
	NotificationCategoryTask    NotificationCategory = "task"
	NotificationCategoryOutcome NotificationCategory = "outcome"
	NotificationCategoryUnknown NotificationCategory = "unknown"
)

func notificationCategoryForType(notificationType string) NotificationCategory {
	switch notificationType {
	case NotificationTypeChatMessage, NotificationTypeJoinRequestCreated:
		return NotificationCategoryTask
	case NotificationTypeJoinRequestApproved, NotificationTypeJoinRequestDenied,
		NotificationTypeMemberRemoved, NotificationTypeEventDeleted:
		return NotificationCategoryOutcome
	default:
		return NotificationCategoryUnknown
	}
}

// notificationCopy is the canonical copy contract shared by OS pushes and the
// in-app inbox. The only intentional difference is that join-request creation
// and approval omit the final full stop in the compact OS push body.
type notificationCopy struct {
	PushBody  string
	InboxBody string
}

func notificationCopyFor(nType, eventTitle, actorName string) (notificationCopy, bool) {
	title := strings.TrimSpace(eventTitle)
	actor := strings.TrimSpace(actorName)

	var pushBody string
	switch nType {
	case NotificationTypeJoinRequestCreated:
		pushBody = fmt.Sprintf("%s wants to join your plan %s", actor, title)
	case NotificationTypeJoinRequestApproved:
		pushBody = fmt.Sprintf("Your request to join the plan %s has been approved", title)
	case NotificationTypeJoinRequestDenied:
		pushBody = fmt.Sprintf("%s is no longer available to you. Explore other plans nearby.", title)
	case NotificationTypeMemberRemoved:
		pushBody = fmt.Sprintf("You no longer have access to the %s. Explore other plans nearby.", title)
	case NotificationTypeEventDeleted:
		pushBody = fmt.Sprintf("%s has been cancelled and is no longer happening. Explore other events nearby.", title)
	default:
		return notificationCopy{}, false
	}

	inboxBody := pushBody
	if nType == NotificationTypeJoinRequestCreated || nType == NotificationTypeJoinRequestApproved {
		inboxBody += "."
	}
	return notificationCopy{PushBody: pushBody, InboxBody: inboxBody}, true
}

func notificationPushBody(nType, eventTitle, actorName string) string {
	copy, ok := notificationCopyFor(nType, eventTitle, actorName)
	if !ok {
		return ""
	}
	return copy.PushBody
}

// inboxDisplayBody returns the body persisted for the inbox. New call sites
// already pass canonical push copy, so only the two intentional punctuation
// differences need adapting here. Unknown and chat types remain verbatim.
func inboxDisplayBody(nType, rawPushBody string) string {
	if (nType == NotificationTypeJoinRequestCreated || nType == NotificationTypeJoinRequestApproved) &&
		!strings.HasSuffix(rawPushBody, ".") {
		return rawPushBody + "."
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

// maxPayloadAvatarLength bounds the avatar value copied into push/inbox
// payloads. The same data map is sent as an FCM data message (4 KB cap), so
// only short remote URLs qualify; inline base64 avatars are omitted and the
// client falls back to a seeded monogram or a locally known avatar.
const maxPayloadAvatarLength = 512

// payloadAvatar returns the avatar suitable for a push/inbox payload, or "".
func payloadAvatar(avatar *string) string {
	if avatar == nil {
		return ""
	}
	value := strings.TrimSpace(*avatar)
	if value == "" || len(value) > maxPayloadAvatarLength {
		return ""
	}
	if !strings.HasPrefix(value, "https://") && !strings.HasPrefix(value, "http://") {
		return ""
	}
	return value
}

// setPayloadIfPresent adds key=value to a push data map only when value is
// non-empty, keeping optional decoration (avatars, cover keys) out of payloads
// that have nothing to show.
func setPayloadIfPresent(data map[string]string, key, value string) {
	if value != "" {
		data[key] = value
	}
}
