package main

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	appleIssuer       = "https://appleid.apple.com"
	appleJWKSURL      = "https://appleid.apple.com/auth/keys"
	appleJWKSCacheTTL = time.Hour
)

var (
	errInvalidAppleToken        = errors.New("invalid apple token")
	errAppleTokenExpired        = errors.New("apple token expired")
	errAppleTokenAudienceMissed = errors.New("apple token audience mismatch")
)

type appleIdentity struct {
	Subject string
	Email   string
	Name    string
}

type appleTokenVerifier interface {
	Verify(ctx context.Context, idToken string, audiences []string) (*appleIdentity, error)
}

type liveAppleTokenVerifier struct {
	client *http.Client

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

type appleJWTHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type appleTokenClaims struct {
	Issuer   string `json:"iss"`
	Audience any    `json:"aud"`
	Expiry   int64  `json:"exp"`
	Subject  string `json:"sub"`
	Email    string `json:"email"`
	Name     string `json:"name"`
}

type appleJWKS struct {
	Keys []appleJWK `json:"keys"`
}

type appleJWK struct {
	KeyType   string `json:"kty"`
	KeyID     string `json:"kid"`
	Algorithm string `json:"alg"`
	Modulus   string `json:"n"`
	Exponent  string `json:"e"`
}

func newLiveAppleTokenVerifier() appleTokenVerifier {
	return &liveAppleTokenVerifier{
		client: &http.Client{Timeout: 5 * time.Second},
		keys:   make(map[string]*rsa.PublicKey),
	}
}

func (v *liveAppleTokenVerifier) Verify(ctx context.Context, idToken string, audiences []string) (*appleIdentity, error) {
	header, claims, signedInput, signature, err := parseAppleJWT(idToken)
	if err != nil {
		return nil, errInvalidAppleToken
	}
	if header.Algorithm != "RS256" || strings.TrimSpace(header.KeyID) == "" {
		return nil, errInvalidAppleToken
	}

	key, err := v.lookupKey(ctx, header.KeyID)
	if err != nil {
		return nil, err
	}
	if err := verifyJWTSignatureRS256(key, signedInput, signature); err != nil {
		return nil, errInvalidAppleToken
	}

	if claims.Issuer != appleIssuer {
		return nil, errInvalidAppleToken
	}
	if !audienceMatches(claims.Audience, audiences) {
		return nil, errAppleTokenAudienceMissed
	}
	if claims.Expiry <= 0 || time.Now().UTC().After(time.Unix(claims.Expiry, 0)) {
		return nil, errAppleTokenExpired
	}

	subject := strings.TrimSpace(claims.Subject)
	if subject == "" {
		return nil, errInvalidAppleToken
	}

	return &appleIdentity{
		Subject: subject,
		Email:   strings.TrimSpace(claims.Email),
		Name:    strings.TrimSpace(claims.Name),
	}, nil
}

func parseAppleJWT(token string) (*appleJWTHeader, *appleTokenClaims, string, []byte, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, nil, "", nil, errInvalidAppleToken
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, nil, "", nil, errInvalidAppleToken
	}
	var header appleJWTHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, nil, "", nil, errInvalidAppleToken
	}

	claimBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, nil, "", nil, errInvalidAppleToken
	}
	var claims appleTokenClaims
	if err := json.Unmarshal(claimBytes, &claims); err != nil {
		return nil, nil, "", nil, errInvalidAppleToken
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, nil, "", nil, errInvalidAppleToken
	}

	return &header, &claims, parts[0] + "." + parts[1], signature, nil
}

func verifyJWTSignatureRS256(key *rsa.PublicKey, signedInput string, signature []byte) error {
	sum := sha256.Sum256([]byte(signedInput))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], signature); err != nil {
		return errInvalidAppleToken
	}
	return nil
}

func (v *liveAppleTokenVerifier) lookupKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	now := time.Now().UTC()

	v.mu.RLock()
	key, found := v.keys[kid]
	cacheFresh := !v.fetchedAt.IsZero() && now.Sub(v.fetchedAt) < appleJWKSCacheTTL
	v.mu.RUnlock()

	if found && cacheFresh {
		return key, nil
	}

	if err := v.refreshKeys(ctx); err != nil {
		return nil, fmt.Errorf("refresh apple jwks: %w", err)
	}

	v.mu.RLock()
	key, found = v.keys[kid]
	v.mu.RUnlock()
	if !found {
		return nil, errInvalidAppleToken
	}
	return key, nil
}

func (v *liveAppleTokenVerifier) refreshKeys(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, appleJWKSURL, nil)
	if err != nil {
		return err
	}

	resp, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("apple jwks returned %d", resp.StatusCode)
	}

	var payload appleJWKS
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return err
	}

	keySet := make(map[string]*rsa.PublicKey)
	for _, item := range payload.Keys {
		if strings.ToUpper(item.KeyType) != "RSA" || strings.TrimSpace(item.KeyID) == "" {
			continue
		}
		key, err := appleJWKToRSAPublicKey(item)
		if err != nil {
			continue
		}
		keySet[item.KeyID] = key
	}
	if len(keySet) == 0 {
		return errors.New("apple jwks did not contain usable keys")
	}

	v.mu.Lock()
	v.keys = keySet
	v.fetchedAt = time.Now().UTC()
	v.mu.Unlock()
	return nil
}

func appleJWKToRSAPublicKey(jwk appleJWK) (*rsa.PublicKey, error) {
	modulusBytes, err := base64.RawURLEncoding.DecodeString(jwk.Modulus)
	if err != nil || len(modulusBytes) == 0 {
		return nil, errInvalidAppleToken
	}
	exponentBytes, err := base64.RawURLEncoding.DecodeString(jwk.Exponent)
	if err != nil || len(exponentBytes) == 0 {
		return nil, errInvalidAppleToken
	}

	exp := 0
	for _, b := range exponentBytes {
		exp = (exp << 8) | int(b)
	}
	if exp <= 0 {
		return nil, errInvalidAppleToken
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(modulusBytes),
		E: exp,
	}, nil
}

func audienceMatches(audClaim any, allowed []string) bool {
	if len(allowed) == 0 {
		return false
	}

	allowedSet := make(map[string]struct{}, len(allowed))
	for _, aud := range allowed {
		trimmed := strings.TrimSpace(aud)
		if trimmed != "" {
			allowedSet[trimmed] = struct{}{}
		}
	}

	matches := func(candidate string) bool {
		_, ok := allowedSet[strings.TrimSpace(candidate)]
		return ok
	}

	switch typed := audClaim.(type) {
	case string:
		return matches(typed)
	case []string:
		for _, item := range typed {
			if matches(item) {
				return true
			}
		}
	case []any:
		for _, item := range typed {
			asString, ok := item.(string)
			if ok && matches(asString) {
				return true
			}
		}
	}
	return false
}
