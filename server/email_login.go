package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/mail"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	emailCodeTTL         = 10 * time.Minute
	emailCodeMaxAttempts = 5
	// emailCodeRetention keeps used and expired codes for a day before purge.
	emailCodeRetention    = 24 * time.Hour
	defaultEmailDailyCap  = 500
	emailCodeDigitPattern = `^\d{6}$`
)

var (
	ErrEmailCodeInvalid = errors.New("email login code is wrong")
	ErrEmailCodeExpired = errors.New("email login code is expired or used up")

	emailCodePattern = regexp.MustCompile(emailCodeDigitPattern)
)

const createTableEmailLoginCodes = `
CREATE TABLE IF NOT EXISTS email_login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at DATETIME
);
`

func (r *EventRepository) ensureEmailLoginCodesTable(ctx context.Context) error {
	if _, err := r.db.ExecContext(ctx, createTableEmailLoginCodes); err != nil {
		return fmt.Errorf("create email_login_codes table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS email_login_codes_email_idx ON email_login_codes (email);`); err != nil {
		return fmt.Errorf("create email_login_codes index: %w", err)
	}
	return nil
}

// CreateEmailLoginCode stores a new code for email and retires any earlier
// open code for the same address.
func (r *EventRepository) CreateEmailLoginCode(ctx context.Context, email, codeHash string, now time.Time) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin email code tx: %w", err)
	}
	defer tx.Rollback()
	nowText := sqliteTime(now)
	if _, err := tx.ExecContext(ctx, `
		UPDATE email_login_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL;
	`, nowText, email); err != nil {
		return 0, fmt.Errorf("retire earlier email codes: %w", err)
	}
	res, err := tx.ExecContext(ctx, `
		INSERT INTO email_login_codes (email, code_hash, created_at, expires_at)
		VALUES (?, ?, ?, ?);
	`, email, codeHash, nowText, sqliteTime(now.Add(emailCodeTTL)))
	if err != nil {
		return 0, fmt.Errorf("insert email code: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("email code id: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit email code: %w", err)
	}
	return id, nil
}

func (r *EventRepository) DeleteEmailLoginCode(ctx context.Context, id int64) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM email_login_codes WHERE id = ?;`, id); err != nil {
		return fmt.Errorf("delete email code: %w", err)
	}
	return nil
}

// ConsumeEmailLoginCode checks a code against the latest open code for email.
// A correct code is used up; a wrong one counts an attempt, and the fifth
// wrong attempt ends the code.
func (r *EventRepository) ConsumeEmailLoginCode(ctx context.Context, email, codeHash string, now time.Time) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin email verify tx: %w", err)
	}
	defer tx.Rollback()

	nowText := sqliteTime(now)
	var (
		id         int64
		storedHash string
		attempts   int
		expired    bool
	)
	err = tx.QueryRowContext(ctx, `
		SELECT id, code_hash, attempts, expires_at <= ?
		FROM email_login_codes
		WHERE email = ? AND consumed_at IS NULL
		ORDER BY id DESC LIMIT 1;
	`, nowText, email).Scan(&id, &storedHash, &attempts, &expired)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrEmailCodeExpired
	}
	if err != nil {
		return fmt.Errorf("lookup email code: %w", err)
	}
	if expired || attempts >= emailCodeMaxAttempts {
		return ErrEmailCodeExpired
	}

	if !hmac.Equal([]byte(storedHash), []byte(codeHash)) {
		attempts++
		if _, err := tx.ExecContext(ctx, `UPDATE email_login_codes SET attempts = ? WHERE id = ?;`, attempts, id); err != nil {
			return fmt.Errorf("count email code attempt: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit email code attempt: %w", err)
		}
		if attempts >= emailCodeMaxAttempts {
			return ErrEmailCodeExpired
		}
		return ErrEmailCodeInvalid
	}

	res, err := tx.ExecContext(ctx, `
		UPDATE email_login_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL;
	`, nowText, id)
	if err != nil {
		return fmt.Errorf("consume email code: %w", err)
	}
	if affected, err := res.RowsAffected(); err != nil || affected != 1 {
		return ErrEmailCodeExpired
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit email code: %w", err)
	}
	return nil
}

// PurgeExpiredEmailLoginCodes deletes codes that expired over a day ago.
func (r *EventRepository) PurgeExpiredEmailLoginCodes(ctx context.Context, now time.Time) (int64, error) {
	res, err := r.db.ExecContext(ctx, `DELETE FROM email_login_codes WHERE expires_at < ?;`, sqliteTime(now.Add(-emailCodeRetention)))
	if err != nil {
		return 0, fmt.Errorf("purge email codes: %w", err)
	}
	deleted, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("count purged email codes: %w", err)
	}
	return deleted, nil
}

// emailLoginLimits bounds how many codes can be requested, per address, per
// client IP and in total. In memory: limits reset on deploy and assume a
// single server instance.
type emailLoginLimits struct {
	perEmailMinute *anonymousHelpRateLimiter
	perEmailHour   *anonymousHelpRateLimiter
	perIPHour      *anonymousHelpRateLimiter
	global         *anonymousHelpRateLimiter
}

func newEmailLoginLimitsFromEnv() *emailLoginLimits {
	dailyCap := defaultEmailDailyCap
	if raw := strings.TrimSpace(os.Getenv("EMAIL_LOGIN_DAILY_CAP")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			dailyCap = parsed
		}
	}
	return &emailLoginLimits{
		perEmailMinute: newAnonymousHelpRateLimiter(1, time.Minute),
		perEmailHour:   newAnonymousHelpRateLimiter(5, time.Hour),
		perIPHour:      newAnonymousHelpRateLimiter(20, time.Hour),
		global:         newAnonymousHelpRateLimiter(dailyCap, 24*time.Hour),
	}
}

func (l *emailLoginLimits) allow(email, clientIP string, now time.Time) bool {
	return l.perEmailMinute.Allow(email, now) &&
		l.perEmailHour.Allow(email, now) &&
		l.perIPHour.Allow(clientIP, now) &&
		l.global.Allow("all", now)
}

// validLoginEmail accepts a bare address with a dotted domain.
func validLoginEmail(email string) bool {
	if email == "" || len(email) > 254 {
		return false
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || parsed.Name != "" {
		return false
	}
	at := strings.LastIndex(email, "@")
	return at > 0 && strings.Contains(email[at+1:], ".")
}

func newEmailLoginCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", fmt.Errorf("generate email code: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func (h *AuthHandler) hashEmailLoginCode(email, code string) string {
	mac := hmac.New(sha256.New, h.signer.secret)
	mac.Write([]byte("email-login:" + email + ":" + code))
	return hex.EncodeToString(mac.Sum(nil))
}

type emailLoginStartRequest struct {
	Email string `json:"email"`
}

type emailLoginVerifyRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// startEmailLogin sends a sign-in code. The response is the same whether or
// not the address has an account.
func (h *AuthHandler) startEmailLogin(c *gin.Context) {
	var payload emailLoginStartRequest
	_ = c.ShouldBindJSON(&payload)
	email := normalizeEmail(payload.Email)
	if !validLoginEmail(email) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a valid email address."})
		return
	}
	if h.emailSender == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Email sign-in isn't available right now."})
		return
	}
	now := h.clock()
	if !h.emailLimits.allow(email, c.ClientIP(), now) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many codes requested. Wait a minute and try again."})
		return
	}

	code, err := newEmailLoginCode()
	if err != nil {
		log.Printf("email-login: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "We couldn't send the code. Please try again."})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	codeID, err := h.repo.CreateEmailLoginCode(ctx, email, h.hashEmailLoginCode(email, code), now)
	if err != nil {
		log.Printf("email-login: failed to store code: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "We couldn't send the code. Please try again."})
		return
	}

	sendCtx, cancelSend := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancelSend()
	if err := h.emailSender.SendLoginCode(sendCtx, email, code); err != nil {
		log.Printf("email-login: failed to send code: %v", err)
		if delErr := h.repo.DeleteEmailLoginCode(context.Background(), codeID); delErr != nil {
			log.Printf("email-login: failed to delete unsent code: %v", delErr)
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "We couldn't send the code. Please try again."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "sent"})
}

// verifyEmailLogin signs in with an emailed code, creating the account when
// the address is new.
func (h *AuthHandler) verifyEmailLogin(c *gin.Context) {
	var payload emailLoginVerifyRequest
	_ = c.ShouldBindJSON(&payload)
	email := normalizeEmail(payload.Email)
	code := strings.TrimSpace(payload.Code)
	if !validLoginEmail(email) || !emailCodePattern.MatchString(code) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Enter the 6-digit code."})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	err := h.repo.ConsumeEmailLoginCode(ctx, email, h.hashEmailLoginCode(email, code), h.clock())
	switch {
	case errors.Is(err, ErrEmailCodeInvalid):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "That code isn't right. Check it and try again.", "code": "code_invalid"})
		return
	case errors.Is(err, ErrEmailCodeExpired):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "This code has expired. Request a new one.", "code": "code_expired"})
		return
	case err != nil:
		log.Printf("email-login: failed to check code: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to sign in. Please try again."})
		return
	}

	user, isNewUser, err := h.getOrCreateUserByEmail(c.Request.Context(), email, "")
	if err != nil {
		log.Printf("email-login: failed to load user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}
	h.recordIdentityHashes(c.Request.Context(), user, identityProviderEmail, email)
	h.respondWithIssuedSession(c, user, "email-login", isNewUser)
}
