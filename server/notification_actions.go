package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

const (
	NotificationDestinationNotifications = "notifications"
	NotificationDestinationEvents        = "events"
	NotificationDestinationEventDetails  = "event_details"
	NotificationDestinationJoinRequests  = "join_requests"
	NotificationDestinationChat          = "chat"
)

type NotificationActionResolveInput struct {
	NotificationIDs []int64
	MarkHandled     bool
	Type            string
	EventID         *int64
	ConversationID  *int64
	JoinRequestID   *int64
}

type NotificationActionResolution struct {
	Status         NotificationActionState   `json:"status"`
	Reason         *NotificationActionReason `json:"reason,omitempty"`
	Destination    string                    `json:"destination"`
	EventID        *int64                    `json:"event_id,omitempty"`
	ConversationID *int64                    `json:"conversation_id,omitempty"`
	Title          string                    `json:"title,omitempty"`
}

type notificationEventTarget struct {
	ID        int64
	OwnerID   int64
	Title     string
	GroupType string
}

type notificationConversationTarget struct {
	ID      int64
	EventID *int64
	Member  bool
}

// ResolveNotificationAction is the server-authoritative boundary used by both
// inbox and OS notification taps. Stored IDs are ownership/group checked in a
// transaction; ID-less legacy pushes are resolved from validated hints only.
func (r *EventRepository) ResolveNotificationAction(
	ctx context.Context,
	userID int64,
	input NotificationActionResolveInput,
) (NotificationActionResolution, error) {
	if userID <= 0 || len(input.NotificationIDs) > 100 {
		return NotificationActionResolution{}, ErrNotificationActionInvalid
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return NotificationActionResolution{}, fmt.Errorf("begin notification action resolution: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var notifications []Notification
	if len(input.NotificationIDs) > 0 {
		notifications, err = loadOwnedNotificationsForResolution(ctx, tx, userID, input.NotificationIDs)
		if err != nil {
			return NotificationActionResolution{}, err
		}
		if err := validateNotificationActionGroup(notifications); err != nil {
			return NotificationActionResolution{}, err
		}
	} else {
		notificationType := strings.TrimSpace(strings.ToLower(input.Type))
		if notificationType == "" {
			return NotificationActionResolution{}, ErrNotificationActionInvalid
		}
		notifications = []Notification{{
			UserID:         userID,
			Type:           notificationType,
			EventID:        input.EventID,
			ConversationID: input.ConversationID,
			JoinRequestID:  input.JoinRequestID,
			ActionState:    NotificationActionActive,
		}}
	}

	resolution, err := resolveCurrentNotificationTarget(ctx, tx, userID, notifications)
	if err != nil {
		return NotificationActionResolution{}, err
	}

	if len(input.NotificationIDs) > 0 {
		if err := persistNotificationResolution(
			ctx,
			tx,
			userID,
			input.NotificationIDs,
			notifications[0].Type,
			input.MarkHandled,
			resolution,
		); err != nil {
			return NotificationActionResolution{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return NotificationActionResolution{}, fmt.Errorf("commit notification action resolution: %w", err)
	}
	committed = true
	return resolution, nil
}

func loadOwnedNotificationsForResolution(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	ids []int64,
) ([]Notification, error) {
	seen := make(map[int64]struct{}, len(ids))
	placeholders := make([]string, 0, len(ids))
	args := make([]any, 0, len(ids)+1)
	args = append(args, userID)
	for _, id := range ids {
		if id <= 0 {
			return nil, ErrNotificationActionInvalid
		}
		if _, duplicate := seen[id]; duplicate {
			return nil, ErrNotificationActionInvalid
		}
		seen[id] = struct{}{}
		placeholders = append(placeholders, "?")
		args = append(args, id)
	}
	if len(placeholders) == 0 {
		return nil, ErrNotificationActionInvalid
	}

	query := fmt.Sprintf(`
		SELECT id, user_id, type, event_id, conversation_id, title, body, payload, read,
		       action_state, action_reason, action_resolved_at, join_request_id, created_at
		FROM notifications
		WHERE user_id = ? AND id IN (%s)
		ORDER BY created_at DESC, id DESC;
	`, strings.Join(placeholders, ","))
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("load notification action rows: %w", err)
	}
	defer rows.Close()

	notifications := make([]Notification, 0, len(ids))
	for rows.Next() {
		notification, err := scanNotification(rows)
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, notification)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notification action rows: %w", err)
	}
	if len(notifications) != len(ids) {
		return nil, ErrNotificationActionNotFound
	}
	return notifications, nil
}

func validateNotificationActionGroup(notifications []Notification) error {
	if len(notifications) == 0 {
		return ErrNotificationActionInvalid
	}
	first := notifications[0]
	for _, notification := range notifications[1:] {
		if notification.Type != first.Type {
			return ErrNotificationActionInvalid
		}
	}

	switch first.Type {
	case NotificationTypeChatMessage:
		if len(notifications) == 1 {
			return nil
		}
		if first.ConversationID == nil {
			return ErrNotificationActionInvalid
		}
		for _, notification := range notifications[1:] {
			if notification.ConversationID == nil || *notification.ConversationID != *first.ConversationID {
				return ErrNotificationActionInvalid
			}
		}
	case NotificationTypeJoinRequestCreated:
		if len(notifications) == 1 {
			return nil
		}
		if first.EventID == nil {
			return ErrNotificationActionInvalid
		}
		for _, notification := range notifications[1:] {
			if notification.EventID == nil || *notification.EventID != *first.EventID {
				return ErrNotificationActionInvalid
			}
		}
	default:
		if len(notifications) != 1 {
			return ErrNotificationActionInvalid
		}
	}
	return nil
}

func resolveCurrentNotificationTarget(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	notifications []Notification,
) (NotificationActionResolution, error) {
	notification := notifications[0]
	if allNotificationActionsInactive(notifications) {
		return resolvePersistedInactiveTarget(ctx, tx, userID, notifications)
	}
	switch strings.TrimSpace(strings.ToLower(notification.Type)) {
	case NotificationTypeChatMessage:
		return resolveChatNotification(ctx, tx, userID, notification)
	case NotificationTypeJoinRequestCreated:
		return resolveJoinRequestNotification(ctx, tx, userID, notifications)
	case NotificationTypeJoinRequestApproved:
		return resolveApprovedNotification(ctx, tx, userID, notification)
	case NotificationTypeJoinRequestDenied, NotificationTypeMemberRemoved, NotificationTypeEventDeleted,
		"event_deleted", "event.member.removed":
		return NotificationActionResolution{
			Status:      NotificationActionActive,
			Destination: NotificationDestinationEvents,
		}, nil
	default:
		return NotificationActionResolution{
			Status:      NotificationActionActive,
			Destination: NotificationDestinationNotifications,
		}, nil
	}
}

func allNotificationActionsInactive(notifications []Notification) bool {
	for _, notification := range notifications {
		if notification.ActionState == NotificationActionActive {
			return false
		}
	}
	return true
}

// Inactive rows are historical actions and must never become live shortcuts
// again if membership or topology later happens to resemble their old target.
func resolvePersistedInactiveTarget(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	notifications []Notification,
) (NotificationActionResolution, error) {
	latest := notifications[0]
	for _, notification := range notifications {
		if notification.ActionState == NotificationActionUnavailable {
			return NotificationActionResolution{
				Status:      NotificationActionUnavailable,
				Reason:      notification.ActionReason,
				Destination: NotificationDestinationEvents,
			}, nil
		}
	}

	if latest.Type == NotificationTypeJoinRequestCreated && latest.EventID != nil {
		event, err := loadNotificationEvent(ctx, tx, *latest.EventID)
		if errors.Is(err, sql.ErrNoRows) {
			return unavailableNotification(NotificationReasonEventDeleted), nil
		}
		if err != nil {
			return NotificationActionResolution{}, err
		}
		if event.OwnerID != userID {
			return unavailableNotification(NotificationReasonAccessRemoved), nil
		}
		return NotificationActionResolution{
			Status:      NotificationActionResolved,
			Reason:      latest.ActionReason,
			Destination: NotificationDestinationEventDetails,
			EventID:     &event.ID,
			Title:       event.Title,
		}, nil
	}

	return NotificationActionResolution{
		Status:      NotificationActionResolved,
		Reason:      latest.ActionReason,
		Destination: NotificationDestinationEvents,
	}, nil
}

func resolveChatNotification(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	notification Notification,
) (NotificationActionResolution, error) {
	if notification.ConversationID == nil || *notification.ConversationID <= 0 {
		return unavailableNotification(NotificationReasonConversationDeleted), nil
	}
	conversation, err := loadNotificationConversation(ctx, tx, *notification.ConversationID, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return unavailableNotification(NotificationReasonConversationDeleted), nil
		}
		return NotificationActionResolution{}, err
	}
	if !conversation.Member {
		return unavailableNotification(NotificationReasonAccessRemoved), nil
	}
	if notification.EventID != nil &&
		(conversation.EventID == nil || *conversation.EventID != *notification.EventID) {
		return NotificationActionResolution{}, ErrNotificationActionInvalid
	}
	return NotificationActionResolution{
		Status:         NotificationActionActive,
		Destination:    NotificationDestinationChat,
		EventID:        conversation.EventID,
		ConversationID: &conversation.ID,
	}, nil
}

func resolveJoinRequestNotification(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	notifications []Notification,
) (NotificationActionResolution, error) {
	eventID := notifications[0].EventID
	if eventID == nil || *eventID <= 0 {
		return unavailableNotification(NotificationReasonEventDeleted), nil
	}
	event, err := loadNotificationEvent(ctx, tx, *eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return unavailableNotification(NotificationReasonEventDeleted), nil
		}
		return NotificationActionResolution{}, err
	}
	if event.OwnerID != userID {
		return unavailableNotification(NotificationReasonAccessRemoved), nil
	}

	hasPending := false
	hasLegacy := false
	var resolvedReason *NotificationActionReason
	for _, notification := range notifications {
		if notification.ActionReason != nil {
			resolvedReason = notification.ActionReason
			break
		}
	}
	for _, notification := range notifications {
		if notification.JoinRequestID == nil {
			hasLegacy = true
			continue
		}
		var requestEventID int64
		var status string
		err := tx.QueryRowContext(ctx,
			`SELECT event_id, status FROM conversation_join_requests WHERE id = ?;`,
			*notification.JoinRequestID,
		).Scan(&requestEventID, &status)
		if errors.Is(err, sql.ErrNoRows) {
			if resolvedReason == nil {
				reason := NotificationReasonRequestCancelled
				resolvedReason = &reason
			}
			continue
		}
		if err != nil {
			return NotificationActionResolution{}, fmt.Errorf("resolve join request identity: %w", err)
		}
		if requestEventID != *eventID {
			return NotificationActionResolution{}, ErrNotificationActionInvalid
		}
		switch status {
		case "pending":
			hasPending = true
		case "approved":
			reason := NotificationReasonRequestApproved
			resolvedReason = &reason
		case "denied":
			if resolvedReason == nil || *resolvedReason != NotificationReasonRequestApproved {
				reason := NotificationReasonRequestDenied
				resolvedReason = &reason
			}
		}
	}
	if hasLegacy {
		var pendingCount int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(1) FROM conversation_join_requests WHERE event_id = ? AND status = 'pending';`,
			*eventID,
		).Scan(&pendingCount); err != nil {
			return NotificationActionResolution{}, fmt.Errorf("resolve legacy join requests: %w", err)
		}
		hasPending = hasPending || pendingCount > 0
	}

	if !hasPending {
		return NotificationActionResolution{
			Status:      NotificationActionResolved,
			Reason:      resolvedReason,
			Destination: NotificationDestinationEventDetails,
			EventID:     &event.ID,
			Title:       event.Title,
		}, nil
	}
	if event.GroupType == "Group" {
		var conversationID int64
		if err := tx.QueryRowContext(ctx,
			`SELECT id FROM conversations WHERE event_id = ? ORDER BY id DESC LIMIT 1;`,
			event.ID,
		).Scan(&conversationID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return unavailableNotification(NotificationReasonConversationDeleted), nil
			}
			return NotificationActionResolution{}, fmt.Errorf("resolve join request conversation: %w", err)
		}
		return NotificationActionResolution{
			Status:         NotificationActionActive,
			Destination:    NotificationDestinationJoinRequests,
			EventID:        &event.ID,
			ConversationID: &conversationID,
			Title:          event.Title,
		}, nil
	}
	return NotificationActionResolution{
		Status:      NotificationActionActive,
		Destination: NotificationDestinationEventDetails,
		EventID:     &event.ID,
		Title:       event.Title,
	}, nil
}

func resolveApprovedNotification(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	notification Notification,
) (NotificationActionResolution, error) {
	var eventID *int64
	if notification.EventID != nil {
		value := *notification.EventID
		eventID = &value
	}
	if notification.ConversationID != nil {
		conversation, err := loadNotificationConversation(ctx, tx, *notification.ConversationID, userID)
		if err == nil {
			if eventID == nil && conversation.EventID != nil {
				value := *conversation.EventID
				eventID = &value
			}
			sameEvent := eventID == nil || (conversation.EventID != nil && *conversation.EventID == *eventID)
			if conversation.Member && sameEvent {
				return NotificationActionResolution{
					Status:         NotificationActionActive,
					Destination:    NotificationDestinationChat,
					EventID:        eventID,
					ConversationID: &conversation.ID,
				}, nil
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return NotificationActionResolution{}, err
		}
	}
	if eventID == nil || *eventID <= 0 {
		return unavailableNotification(NotificationReasonConversationDeleted), nil
	}
	event, err := loadNotificationEvent(ctx, tx, *eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return unavailableNotification(NotificationReasonEventDeleted), nil
		}
		return NotificationActionResolution{}, err
	}
	var replacementID int64
	err = tx.QueryRowContext(ctx, `
		SELECT c.id
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id
		WHERE c.event_id = ? AND cm.user_id = ?
		ORDER BY c.created_at DESC, c.id DESC
		LIMIT 1;
	`, event.ID, userID).Scan(&replacementID)
	if errors.Is(err, sql.ErrNoRows) {
		return unavailableNotification(NotificationReasonAccessRemoved), nil
	}
	if err != nil {
		return NotificationActionResolution{}, fmt.Errorf("resolve approval replacement conversation: %w", err)
	}
	return NotificationActionResolution{
		Status:         NotificationActionActive,
		Destination:    NotificationDestinationChat,
		EventID:        &event.ID,
		ConversationID: &replacementID,
		Title:          event.Title,
	}, nil
}

func loadNotificationEvent(ctx context.Context, tx *sql.Tx, eventID int64) (notificationEventTarget, error) {
	var event notificationEventTarget
	err := tx.QueryRowContext(ctx,
		`SELECT id, user_id, title, group_type FROM events WHERE id = ? LIMIT 1;`,
		eventID,
	).Scan(&event.ID, &event.OwnerID, &event.Title, &event.GroupType)
	return event, err
}

func loadNotificationConversation(
	ctx context.Context,
	tx *sql.Tx,
	conversationID, userID int64,
) (notificationConversationTarget, error) {
	var conversation notificationConversationTarget
	var eventID sql.NullInt64
	var member int
	err := tx.QueryRowContext(ctx, `
		SELECT c.id, c.event_id,
		       EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ?)
		FROM conversations c
		WHERE c.id = ?
		LIMIT 1;
	`, userID, conversationID).Scan(&conversation.ID, &eventID, &member)
	if eventID.Valid {
		value := eventID.Int64
		conversation.EventID = &value
	}
	conversation.Member = member == 1
	return conversation, err
}

func persistNotificationResolution(
	ctx context.Context,
	tx *sql.Tx,
	userID int64,
	ids []int64,
	notificationType string,
	markHandled bool,
	resolution NotificationActionResolution,
) error {
	placeholders := make([]string, len(ids))
	for i := range ids {
		placeholders[i] = "?"
	}
	if resolution.Status == NotificationActionActive {
		if !markHandled {
			return nil
		}
		args := make([]any, 0, len(ids)+1)
		args = append(args, userID)
		for _, id := range ids {
			args = append(args, id)
		}
		query := fmt.Sprintf(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (%s);`, strings.Join(placeholders, ","))
		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("mark resolved notification action handled: %w", err)
		}
		return nil
	}

	shouldRead := markHandled || notificationCategoryForType(notificationType) == NotificationCategoryTask
	args := make([]any, 0, len(ids)+5)
	args = append(args, resolution.Status)
	if resolution.Reason == nil {
		args = append(args, nil)
	} else {
		args = append(args, string(*resolution.Reason))
	}
	args = append(args, shouldRead, userID)
	for _, id := range ids {
		args = append(args, id)
	}
	query := fmt.Sprintf(`
		UPDATE notifications
		SET action_state = ?, action_reason = ?, action_resolved_at = CURRENT_TIMESTAMP,
		    read = CASE WHEN ? THEN 1 ELSE read END
		WHERE user_id = ? AND id IN (%s);
	`, strings.Join(placeholders, ","))
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("persist notification action resolution: %w", err)
	}
	return nil
}

func unavailableNotification(reason NotificationActionReason) NotificationActionResolution {
	return NotificationActionResolution{
		Status:      NotificationActionUnavailable,
		Reason:      &reason,
		Destination: NotificationDestinationEvents,
	}
}
