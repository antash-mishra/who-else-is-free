package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// defaultSessionTTL controls how long issued chat tokens remain valid.
const defaultSessionTTL = 12 * time.Hour

var (
	errMissingSecret  = errors.New("chat session secret is not configured")
	errInvalidToken   = errors.New("invalid session token")
	errExpiredToken   = errors.New("session token expired")
	errMalformedToken = errors.New("malformed session token")
)

// sessionClaims is serialized into the token payload so both REST and WebSocket
// layers can identify the caller without re-querying the database.
type sessionClaims struct {
	UserID    int64     `json:"user_id"`
	Email     string    `json:"email"`
	IssuedAt  time.Time `json:"issued_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// tokenSigner is a lightweight HMAC-based signer/validator for session tokens.
type tokenSigner struct {
	secret []byte
	ttl    time.Duration
}

// newTokenSignerFromEnv loads the secret from server/.env (or falls back to a
// noisy dev default) so both CLI and production processes share the same token key.
func newTokenSignerFromEnv() (*tokenSigner, error) {
	secret := strings.TrimSpace(os.Getenv("CHAT_SESSION_SECRET"))
	if secret == "" {
		log.Println("CHAT_SESSION_SECRET not set; using development fallback secret")
		secret = "local-dev-secret"
	}
	ttl := defaultSessionTTL
	return &tokenSigner{secret: []byte(secret), ttl: ttl}, nil
}

// issue creates a signed token describing the current user; callers return both
// the opaque token string and the structured claims for convenience.
func (s *tokenSigner) issue(userID int64, email string) (string, *sessionClaims, error) {
	now := time.Now().UTC()
	claims := sessionClaims{
		UserID:    userID,
		Email:     email,
		IssuedAt:  now,
		ExpiresAt: now.Add(s.ttl),
	}

	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", nil, fmt.Errorf("encode claims: %w", err)
	}

	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signature := s.sign([]byte(payload))
	token := fmt.Sprintf("%s.%s", payload, signature)
	return token, &claims, nil
}

// verify checks signature + expiry and rebuilds the claims for downstream use.
func (s *tokenSigner) verify(token string) (*sessionClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errMalformedToken
	}

	payloadPart := parts[0]
	signaturePart := parts[1]

	expected := s.sign([]byte(payloadPart))
	if !hmac.Equal([]byte(signaturePart), []byte(expected)) {
		return nil, errInvalidToken
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadPart)
	if err != nil {
		return nil, errMalformedToken
	}

	var claims sessionClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, errMalformedToken
	}

	if time.Now().UTC().After(claims.ExpiresAt) {
		return nil, errExpiredToken
	}

	return &claims, nil
}

func (s *tokenSigner) sign(payload []byte) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write(payload)
	sum := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(sum)
}
