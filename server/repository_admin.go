package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// IsAdmin reports whether the immutable user ID has a persisted admin grant.
func (r *EventRepository) IsAdmin(ctx context.Context, userID int64) (bool, error) {
	var found int
	err := r.db.QueryRowContext(ctx, `SELECT 1 FROM admin_users WHERE user_id = ? LIMIT 1`, userID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check admin grant: %w", err)
	}
	return true, nil
}

// GrantAdmin persists an admin grant. grantedBy is nil for controlled bootstrap grants.
func (r *EventRepository) GrantAdmin(ctx context.Context, userID int64, grantedBy *int64) error {
	var grantedByValue any
	if grantedBy != nil {
		grantedByValue = *grantedBy
	}
	if _, err := r.db.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO admin_users (user_id, granted_by) VALUES (?, ?)`,
		userID,
		grantedByValue,
	); err != nil {
		return fmt.Errorf("grant admin: %w", err)
	}
	return nil
}

// BootstrapAdmins grants existing users whose stored account email exactly matches the configured
// bootstrap list. Email is only a provisioning lookup; runtime authorization always uses user_id.
func (r *EventRepository) BootstrapAdmins(ctx context.Context, emails []string) (int, error) {
	granted := 0
	for _, email := range emails {
		trimmed := strings.TrimSpace(email)
		if trimmed == "" {
			continue
		}
		user, err := r.GetUserByEmail(ctx, trimmed)
		if errors.Is(err, ErrUserNotFound) {
			continue
		}
		if err != nil {
			return granted, fmt.Errorf("bootstrap admin lookup: %w", err)
		}
		wasAdmin, err := r.IsAdmin(ctx, user.ID)
		if err != nil {
			return granted, err
		}
		if err := r.GrantAdmin(ctx, user.ID, nil); err != nil {
			return granted, err
		}
		if !wasAdmin {
			granted++
		}
	}
	return granted, nil
}

func parseAdminBootstrapEmails(raw string) []string {
	parts := strings.Split(raw, ",")
	emails := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		email := strings.TrimSpace(part)
		if email == "" {
			continue
		}
		if _, exists := seen[email]; exists {
			continue
		}
		seen[email] = struct{}{}
		emails = append(emails, email)
	}
	return emails
}

func isBootstrapAdminEmail(email string, configured []string) bool {
	trimmed := strings.TrimSpace(email)
	for _, candidate := range configured {
		if trimmed == candidate {
			return true
		}
	}
	return false
}
