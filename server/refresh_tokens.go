package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// refreshTokenTTL is how long an unused refresh key stays valid. Every
// successful refresh issues a key with a fresh window, so an active device
// never has to sign in again.
const refreshTokenTTL = 90 * 24 * time.Hour

// refreshTokenRevokedRetention keeps revoked rows around briefly so a replayed
// key still reads as revoked rather than unknown.
const refreshTokenRevokedRetention = 7 * 24 * time.Hour

var (
	ErrRefreshTokenInvalid = errors.New("refresh token is invalid or expired")
	ErrRefreshTokenReused  = errors.New("refresh token was already replaced and reused")
)

// sqliteTimeLayout matches SQLite CURRENT_TIMESTAMP text (UTC), so stored
// times compare correctly as text.
const sqliteTimeLayout = "2006-01-02 15:04:05"

func sqliteTime(t time.Time) string {
	return t.UTC().Format(sqliteTimeLayout)
}

const createTableRefreshTokens = `
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    family_id TEXT NOT NULL,
    parent_id INTEGER,
    token_hash TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL,
    first_used_at DATETIME,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

var createRefreshTokenIndexes = []string{
	`CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);`,
	`CREATE INDEX IF NOT EXISTS refresh_tokens_parent_idx ON refresh_tokens (parent_id);`,
	`CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);`,
}

func (r *EventRepository) ensureRefreshTokensTable(ctx context.Context) error {
	if _, err := r.db.ExecContext(ctx, createTableRefreshTokens); err != nil {
		return fmt.Errorf("create refresh_tokens table: %w", err)
	}
	for _, query := range createRefreshTokenIndexes {
		if _, err := r.db.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("create refresh_tokens index: %w", err)
		}
	}
	return nil
}

func newRefreshTokenValue() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate refresh token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func hashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

type refreshTokenExecer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func insertRefreshToken(ctx context.Context, db refreshTokenExecer, userID int64, familyID string, parentID *int64, now time.Time) (string, time.Time, error) {
	raw, err := newRefreshTokenValue()
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := now.UTC().Add(refreshTokenTTL)
	if _, err := db.ExecContext(ctx, `
		INSERT INTO refresh_tokens (user_id, family_id, parent_id, token_hash, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?);
	`, userID, familyID, parentID, hashRefreshToken(raw), sqliteTime(now), sqliteTime(expiresAt)); err != nil {
		return "", time.Time{}, fmt.Errorf("insert refresh token: %w", err)
	}
	return raw, expiresAt, nil
}

// IssueRefreshToken starts a new refresh family for one device sign-in.
func (r *EventRepository) IssueRefreshToken(ctx context.Context, userID int64, now time.Time) (string, time.Time, error) {
	return insertRefreshToken(ctx, r.db, userID, uuid.NewString(), nil, now)
}

// RotateRefreshToken exchanges a refresh key for a new one in the same family.
//
// A key stays usable until one of its successors has been used, so a phone
// that lost a refresh response can retry with the key it still holds. Once a
// successor has been used, presenting the older key again means someone else
// holds a copy: the whole family is revoked.
func (r *EventRepository) RotateRefreshToken(ctx context.Context, raw string, now time.Time) (int64, string, time.Time, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, "", time.Time{}, fmt.Errorf("begin refresh tx: %w", err)
	}
	defer tx.Rollback()

	var (
		id        int64
		userID    int64
		familyID  string
		parentID  sql.NullInt64
		firstUsed bool
		expired   bool
		revoked   bool
	)
	nowText := sqliteTime(now)
	// Compare times inside SQLite: the driver reformats DATETIME values when
	// scanning them into Go strings, so text comparisons belong in SQL.
	err = tx.QueryRowContext(ctx, `
		SELECT id, user_id, family_id, parent_id, first_used_at IS NOT NULL,
		       expires_at <= ?, revoked_at IS NOT NULL
		FROM refresh_tokens WHERE token_hash = ?;
	`, nowText, hashRefreshToken(raw)).Scan(&id, &userID, &familyID, &parentID, &firstUsed, &expired, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", time.Time{}, ErrRefreshTokenInvalid
	}
	if err != nil {
		return 0, "", time.Time{}, fmt.Errorf("lookup refresh token: %w", err)
	}
	if revoked || expired {
		return 0, "", time.Time{}, ErrRefreshTokenInvalid
	}

	var usedChildren int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM refresh_tokens WHERE parent_id = ? AND first_used_at IS NOT NULL;
	`, id).Scan(&usedChildren); err != nil {
		return 0, "", time.Time{}, fmt.Errorf("check refresh successors: %w", err)
	}
	if usedChildren > 0 {
		if _, err := tx.ExecContext(ctx, `
			UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL;
		`, nowText, familyID); err != nil {
			return 0, "", time.Time{}, fmt.Errorf("revoke reused refresh family: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return 0, "", time.Time{}, fmt.Errorf("commit refresh revocation: %w", err)
		}
		return 0, "", time.Time{}, ErrRefreshTokenReused
	}

	if !firstUsed {
		if _, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET first_used_at = ? WHERE id = ?;`, nowText, id); err != nil {
			return 0, "", time.Time{}, fmt.Errorf("mark refresh token used: %w", err)
		}
		if parentID.Valid {
			// The device has moved on to this key; siblings minted for lost
			// responses are no longer needed.
			if _, err := tx.ExecContext(ctx, `
				UPDATE refresh_tokens SET revoked_at = ?
				WHERE parent_id = ? AND id <> ? AND first_used_at IS NULL AND revoked_at IS NULL;
			`, nowText, parentID.Int64, id); err != nil {
				return 0, "", time.Time{}, fmt.Errorf("retire refresh siblings: %w", err)
			}
		}
	}

	parent := id
	next, nextExpiresAt, err := insertRefreshToken(ctx, tx, userID, familyID, &parent, now)
	if err != nil {
		return 0, "", time.Time{}, err
	}
	if err := tx.Commit(); err != nil {
		return 0, "", time.Time{}, fmt.Errorf("commit refresh rotation: %w", err)
	}
	return userID, next, nextExpiresAt, nil
}

// RevokeRefreshTokenFamily signs a device out. Unknown keys are ignored so
// sign-out never fails because of a stale key.
func (r *EventRepository) RevokeRefreshTokenFamily(ctx context.Context, raw string, now time.Time) error {
	if _, err := r.db.ExecContext(ctx, `
		UPDATE refresh_tokens SET revoked_at = ?
		WHERE revoked_at IS NULL AND family_id = (
			SELECT family_id FROM refresh_tokens WHERE token_hash = ?
		);
	`, sqliteTime(now), hashRefreshToken(raw)); err != nil {
		return fmt.Errorf("revoke refresh family: %w", err)
	}
	return nil
}

// PurgeExpiredRefreshTokens deletes expired keys and keys revoked more than a
// week ago.
func (r *EventRepository) PurgeExpiredRefreshTokens(ctx context.Context, now time.Time) (int64, error) {
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM refresh_tokens
		WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?);
	`, sqliteTime(now), sqliteTime(now.Add(-refreshTokenRevokedRetention)))
	if err != nil {
		return 0, fmt.Errorf("purge refresh tokens: %w", err)
	}
	deleted, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("count purged refresh tokens: %w", err)
	}
	return deleted, nil
}
