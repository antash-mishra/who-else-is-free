package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

// Providers whose identifiers are pseudonymised for safety reports (#184).
const (
	identityProviderApple  = "apple"
	identityProviderGoogle = "google"
	identityProviderEmail  = "email"
)

// IdentityHasher pseudonymises account identifiers for safety reports: HMAC
// with a server-side key, not a plain hash, so a stored value cannot be
// checked against a known identifier by anyone without the key.
type IdentityHasher struct {
	key []byte
}

// newIdentityHasherFromEnv returns nil when REPORT_IDENTITY_HMAC_KEY is unset.
// A nil hasher hashes nothing, so reports are filed without identity rows.
func newIdentityHasherFromEnv() *IdentityHasher {
	key := strings.TrimSpace(os.Getenv("REPORT_IDENTITY_HMAC_KEY"))
	if key == "" {
		log.Println("REPORT_IDENTITY_HMAC_KEY not set; safety reports will not carry identity hashes")
		return nil
	}
	return &IdentityHasher{key: []byte(key)}
}

// Hash returns the hex HMAC-SHA256 of "provider:value", comparing emails
// case-insensitively. It returns false when hashing is not configured or the
// value is blank.
func (h *IdentityHasher) Hash(provider, value string) (string, bool) {
	value = strings.TrimSpace(value)
	if h == nil || len(h.key) == 0 || value == "" {
		return "", false
	}
	if provider == identityProviderEmail {
		value = strings.ToLower(value)
	}
	mac := hmac.New(sha256.New, h.key)
	mac.Write([]byte(provider + ":" + value))
	return hex.EncodeToString(mac.Sum(nil)), true
}
