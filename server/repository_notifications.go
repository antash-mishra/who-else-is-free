package main

import (
	"context"
	"database/sql"
	"fmt"
)

// ErrNotificationNotFound is returned by MarkNotificationRead when no unread
// row matched the given id+user (already read, missing, or owned by another
// user — all collapse to not-found for the caller).
var ErrNotificationNotFound = fmt.Errorf("notification not found")

// CreateNotification inserts a Notification row and returns the persisted row
// (including the server-assigned id and created_at).
func (r *EventRepository) CreateNotification(ctx context.Context, n Notification) (Notification, error) {
	var (
		eventID        sql.NullInt64
		conversationID sql.NullInt64
		payload        sql.NullString
	)
	if n.EventID != nil {
		eventID = sql.NullInt64{Int64: *n.EventID, Valid: true}
	}
	if n.ConversationID != nil {
		conversationID = sql.NullInt64{Int64: *n.ConversationID, Valid: true}
	}
	if n.Payload != "" {
		payload = sql.NullString{String: n.Payload, Valid: true}
	}

	var stored Notification
	err := r.db.QueryRowContext(ctx, insertNotification,
		n.UserID, n.Type, eventID, conversationID, n.Title, n.Body, payload,
	).Scan(
		&stored.ID, &stored.UserID, &stored.Type, &eventID, &conversationID,
		&stored.Title, &stored.Body, &payload, &stored.Read, &stored.CreatedAt,
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
	if payload.Valid {
		stored.Payload = payload.String
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
// body, payload, read, created_at.
func scanNotification(sc interface {
	Scan(dest ...any) error
}) (Notification, error) {
	var (
		n              Notification
		eventID        sql.NullInt64
		conversationID sql.NullInt64
		payload        sql.NullString
	)
	if err := sc.Scan(
		&n.ID, &n.UserID, &n.Type, &eventID, &conversationID,
		&n.Title, &n.Body, &payload, &n.Read, &n.CreatedAt,
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
	if payload.Valid {
		n.Payload = payload.String
	}
	return n, nil
}
