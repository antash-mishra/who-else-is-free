package main

import (
	"context"
	"encoding/json"
	"log"
	"time"
)

// recordAndSendPushToUser persists one Notification row for the recipient
// (with the inbox-display body swapped in for override types) and then
// dispatches the raw FCM push payload unchanged. Persistence is best-effort:
// on row-insert failure it logs and still sends the push so push delivery is
// never degraded by the inbox recorder (see Confirmed Decision #7).
func (h *ChatHub) recordAndSendPushToUser(userID int64, data map[string]string) {
	h.recordAndSendPushToUsers([]int64{userID}, data)
}

// recordAndSendPushToUsers persists one Notification row per recipient (one
// row per user, not per token) and then dispatches the raw FCM push to all
// recipients. Best-effort: row-insert failures are logged per-user and do not
// block the FCM dispatch or other recipients' inserts.
func (h *ChatHub) recordAndSendPushToUsers(userIDs []int64, data map[string]string) {
	nType := payloadField(data, "type")
	title := payloadField(data, "title")
	rawBody := payloadField(data, "body")
	eventID := int64PtrOrNil(payloadField(data, "eventId"))
	conversationID := int64PtrOrNil(payloadField(data, "conversationId"))
	payloadJSON := encodeNotificationPayload(data)
	row := buildNotification(0, nType, eventID, conversationID, title, rawBody, payloadJSON)

	// De-duplicate recipients the same way sendPushToUsers does, so we insert
	// exactly one row per unique user.
	unique := make([]int64, 0, len(userIDs))
	seen := make(map[int64]struct{}, len(userIDs))
	for _, userID := range userIDs {
		if userID <= 0 {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		unique = append(unique, userID)
	}

	if len(unique) > 0 {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		for _, userID := range unique {
			row.UserID = userID
			if _, err := h.repo.CreateNotification(ctx, row); err != nil {
				log.Printf("notifications: persist row for user %d failed: %v (push still sent)", userID, err)
			}
		}
		cancel()
	}

	h.sendPushToUsers(unique, data)
}

// recordChatMessageNotification persists a chat.message Notification row for a
// single recipient, using the already-resolved title/body (the OS push body is
// "<senderName>: <preview>", which is also the verbatim inbox body for
// chat.message — no override). Best-effort; insert failure is logged and does
// not block the FCM dispatch.
func (h *ChatHub) recordChatMessageNotification(recipientID int64, conversationID int64, senderName, title, body string, data map[string]string) {
	convID := conversationID
	payloadJSON := encodeNotificationPayload(data)
	row := buildNotification(recipientID, NotificationTypeChatMessage, nil, &convID, title, body, payloadJSON)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := h.repo.CreateNotification(ctx, row); err != nil {
		log.Printf("notifications: persist chat.message row for user %d failed: %v (push still sent)", recipientID, err)
	}
}

// encodeNotificationPayload serializes the raw push data map into a JSON
// string for opaque storage on the Notification row. This preserves the
// original push fields (senderId, removedUserId, etc.) so the client can route
// inbox taps with the same data it routes OS push taps with. Returns "" on
// failure so an empty payload is stored rather than crashing the push path.
func encodeNotificationPayload(data map[string]string) string {
	if len(data) == 0 {
		return ""
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		log.Printf("notifications: encode payload failed: %v", err)
		return ""
	}
	return string(encoded)
}
