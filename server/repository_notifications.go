package main

import (
	"context"
	"database/sql"
	"fmt"
)

type notificationActionExecer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// ErrNotificationNotFound is returned by MarkNotificationRead when no unread
// row matched the given id+user (already read, missing, or owned by another
// user — all collapse to not-found for the caller).
var ErrNotificationNotFound = fmt.Errorf("notification not found")

// CreateNotification inserts a Notification row and returns the persisted row
// (including the server-assigned id and created_at).
func (r *EventRepository) CreateNotification(ctx context.Context, n Notification) (Notification, error) {
	if n.ActionState == "" {
		n.ActionState = NotificationActionActive
	}
	if !validNotificationActionState(n.ActionState) {
		return Notification{}, fmt.Errorf("create notification: invalid action state %q", n.ActionState)
	}
	read := n.Read || (n.ActionState != NotificationActionActive &&
		notificationCategoryForType(n.Type) == NotificationCategoryTask)
	var (
		eventID        sql.NullInt64
		conversationID sql.NullInt64
		joinRequestID  sql.NullInt64
		payload        sql.NullString
		actionReason   sql.NullString
		actionResolved sql.NullTime
	)
	if n.EventID != nil {
		eventID = sql.NullInt64{Int64: *n.EventID, Valid: true}
	}
	if n.ConversationID != nil {
		conversationID = sql.NullInt64{Int64: *n.ConversationID, Valid: true}
	}
	if n.JoinRequestID != nil {
		joinRequestID = sql.NullInt64{Int64: *n.JoinRequestID, Valid: true}
	}
	if n.Payload != "" {
		payload = sql.NullString{String: n.Payload, Valid: true}
	}
	if n.ActionReason != nil {
		actionReason = sql.NullString{String: string(*n.ActionReason), Valid: true}
	}
	if n.ActionResolvedAt != nil {
		actionResolved = sql.NullTime{Time: *n.ActionResolvedAt, Valid: true}
	}

	var stored Notification
	err := r.db.QueryRowContext(ctx, insertNotification,
		n.UserID, n.Type, eventID, conversationID, n.Title, n.Body, payload, read,
		n.ActionState, actionReason, actionResolved, joinRequestID,
	).Scan(
		&stored.ID, &stored.UserID, &stored.Type, &eventID, &conversationID,
		&stored.Title, &stored.Body, &payload, &stored.Read, &stored.ActionState,
		&actionReason, &actionResolved, &joinRequestID, &stored.CreatedAt,
	)
	if err != nil {
		return Notification{}, fmt.Errorf("create notification: %w", err)
	}
	if eventID.Valid {
		v := eventID.Int64
		stored.EventID = &v
	}
	if conversationID.Valid {
		v := conversationID.Int64
		stored.ConversationID = &v
	}
	if joinRequestID.Valid {
		v := joinRequestID.Int64
		stored.JoinRequestID = &v
	}
	if payload.Valid {
		stored.Payload = payload.String
	}
	if actionReason.Valid {
		v := NotificationActionReason(actionReason.String)
		stored.ActionReason = &v
	}
	if actionResolved.Valid {
		v := actionResolved.Time
		stored.ActionResolvedAt = &v
	}
	return stored, nil
}

// ListNotifications returns a page of notifications for the user, newest first.
// Ordering is created_at DESC with an id DESC tie-break so equal timestamps
// stay stable across pages.
func (r *EventRepository) ListNotifications(ctx context.Context, userID int64, limit, offset int) ([]Notification, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.db.QueryContext(ctx, selectNotificationsForUser, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()

	var out []Notification
	for rows.Next() {
		n, err := scanNotification(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// CountUnreadNotifications returns the number of unread notifications for
// the user (the bell badge value).
func (r *EventRepository) CountUnreadNotifications(ctx context.Context, userID int64) (int, error) {
	var count int
	if err := r.db.QueryRowContext(ctx, countUnreadNotificationsForUser, userID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count unread notifications: %w", err)
	}
	return count, nil
}

// MarkNotificationRead marks a single notification read for the owner. It is
// scoped to userID so a user can never mark another user's row. Returns
// ErrNotificationNotFound when no unread row matched.
func (r *EventRepository) MarkNotificationRead(ctx context.Context, userID, id int64) error {
	result, err := r.db.ExecContext(ctx, markNotificationReadForUser, id, userID)
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrNotificationNotFound
	}
	return nil
}

// MarkAllNotificationsRead marks every unread notification for the user as read.
func (r *EventRepository) MarkAllNotificationsRead(ctx context.Context, userID int64) error {
	if _, err := r.db.ExecContext(ctx, markAllNotificationsReadForUser, userID); err != nil {
		return fmt.Errorf("mark all notifications read: %w", err)
	}
	return nil
}

// DeleteAllNotifications removes every notification for the user ("Clear all").
func (r *EventRepository) DeleteAllNotifications(ctx context.Context, userID int64) error {
	if _, err := r.db.ExecContext(ctx, deleteAllNotificationsForUser, userID); err != nil {
		return fmt.Errorf("delete all notifications: %w", err)
	}
	return nil
}

// scanNotification scans a notification row from a *sql.Rows / *sql.Row-style
// scanner that walks the column order produced by selectNotificationsForUser
// / insertNotification: id, user_id, type, event_id, conversation_id, title,
// body, payload, read, action_state, action_reason, action_resolved_at,
// join_request_id, created_at.
func scanNotification(sc interface {
	Scan(dest ...any) error
}) (Notification, error) {
	var (
		n              Notification
		eventID        sql.NullInt64
		conversationID sql.NullInt64
		joinRequestID  sql.NullInt64
		payload        sql.NullString
		actionReason   sql.NullString
		actionResolved sql.NullTime
	)
	if err := sc.Scan(
		&n.ID, &n.UserID, &n.Type, &eventID, &conversationID,
		&n.Title, &n.Body, &payload, &n.Read, &n.ActionState,
		&actionReason, &actionResolved, &joinRequestID, &n.CreatedAt,
	); err != nil {
		return Notification{}, fmt.Errorf("scan notification: %w", err)
	}
	if eventID.Valid {
		v := eventID.Int64
		n.EventID = &v
	}
	if conversationID.Valid {
		v := conversationID.Int64
		n.ConversationID = &v
	}
	if joinRequestID.Valid {
		v := joinRequestID.Int64
		n.JoinRequestID = &v
	}
	if payload.Valid {
		n.Payload = payload.String
	}
	if actionReason.Valid {
		v := NotificationActionReason(actionReason.String)
		n.ActionReason = &v
	}
	if actionResolved.Valid {
		v := actionResolved.Time
		n.ActionResolvedAt = &v
	}
	return n, nil
}

func validNotificationActionState(state NotificationActionState) bool {
	switch state {
	case NotificationActionActive, NotificationActionResolved, NotificationActionUnavailable:
		return true
	default:
		return false
	}
}

// ResolveJoinRequestNotifications resolves the matching host task. Stable IDs
// update the exact row; ambiguous legacy rows are updated only when no pending
// request remains for the event, preserving mixed pending/resolved groups.
func (r *EventRepository) ResolveJoinRequestNotifications(
	ctx context.Context,
	eventID, joinRequestID int64,
	state NotificationActionState,
	reason NotificationActionReason,
) error {
	if !validNotificationActionState(state) || state == NotificationActionActive {
		return fmt.Errorf("resolve join request notifications: invalid state %q", state)
	}
	return resolveJoinRequestNotificationsWith(ctx, r.db, eventID, joinRequestID, state, reason)
}

func resolveJoinRequestNotificationsWith(
	ctx context.Context,
	execer notificationActionExecer,
	eventID, joinRequestID int64,
	state NotificationActionState,
	reason NotificationActionReason,
) error {
	_, err := execer.ExecContext(ctx, `
		UPDATE notifications
		SET action_state = ?, action_reason = ?, action_resolved_at = CURRENT_TIMESTAMP, read = 1
		WHERE type = 'join_request.created'
		  AND event_id = ?
		  AND action_state = 'active'
		  AND (
		      (join_request_id IS NOT NULL AND join_request_id = ?)
		      OR (
		          join_request_id IS NULL
		          AND NOT EXISTS (
		              SELECT 1 FROM conversation_join_requests r
		              WHERE r.event_id = ? AND r.status = 'pending'
		          )
		      )
		  );
	`, state, reason, eventID, joinRequestID, eventID)
	if err != nil {
		return fmt.Errorf("resolve join request notifications: %w", err)
	}
	return nil
}

func invalidateEventNotificationsWith(
	ctx context.Context,
	execer notificationActionExecer,
	eventID int64,
) error {
	_, err := execer.ExecContext(ctx, `
		UPDATE notifications
		SET action_state = 'unavailable', action_reason = 'event_deleted',
		    action_resolved_at = CURRENT_TIMESTAMP, read = 1
		WHERE action_state = 'active'
		  AND type IN ('join_request.created', 'chat.message', 'join_request.approved')
		  AND (
		      event_id = ?
		      OR conversation_id IN (SELECT id FROM conversations WHERE event_id = ?)
		  );
	`, eventID, eventID)
	if err != nil {
		return fmt.Errorf("invalidate event notifications: %w", err)
	}
	return nil
}

func invalidateConversationNotificationsWith(
	ctx context.Context,
	execer notificationActionExecer,
	conversationID int64,
	userID *int64,
	reason NotificationActionReason,
) error {
	query := `
		UPDATE notifications
		SET action_state = 'unavailable', action_reason = ?,
		    action_resolved_at = CURRENT_TIMESTAMP, read = 1
		WHERE action_state = 'active'
		  AND type IN ('chat.message', 'join_request.approved')
		  AND conversation_id = ?`
	args := []any{reason, conversationID}
	if userID != nil {
		query += ` AND user_id = ?`
		args = append(args, *userID)
	}
	query += `;`
	if _, err := execer.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("invalidate conversation notifications: %w", err)
	}
	return nil
}

func invalidateEventAccessNotificationsWith(
	ctx context.Context,
	execer notificationActionExecer,
	eventID, conversationID, userID int64,
	reason NotificationActionReason,
) error {
	_, err := execer.ExecContext(ctx, `
		UPDATE notifications
		SET action_state = 'unavailable', action_reason = ?,
		    action_resolved_at = CURRENT_TIMESTAMP, read = 1
		WHERE user_id = ?
		  AND action_state = 'active'
		  AND type IN ('chat.message', 'join_request.approved')
		  AND (event_id = ? OR conversation_id = ?);
	`, reason, userID, eventID, conversationID)
	if err != nil {
		return fmt.Errorf("invalidate event access notifications: %w", err)
	}
	return nil
}

func invalidateRequesterJoinNotificationsWith(
	ctx context.Context,
	execer notificationActionExecer,
	requesterID int64,
) error {
	_, err := execer.ExecContext(ctx, `
		UPDATE notifications
		SET action_state = 'resolved', action_reason = 'requester_deleted',
		    action_resolved_at = CURRENT_TIMESTAMP, read = 1
		WHERE action_state = 'active'
		  AND type = 'join_request.created'
		  AND join_request_id IN (
		      SELECT id FROM conversation_join_requests WHERE user_id = ?
		  );
	`, requesterID)
	if err != nil {
		return fmt.Errorf("invalidate requester join notifications: %w", err)
	}
	return nil
}
