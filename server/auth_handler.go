package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"google.golang.org/api/idtoken"
)

type googleTokenVerifier interface {
	Validate(ctx context.Context, idToken, audience string) (map[string]any, error)
}

type liveGoogleTokenVerifier struct{}

func (liveGoogleTokenVerifier) Validate(ctx context.Context, idToken, audience string) (map[string]any, error) {
	verified, err := idtoken.Validate(ctx, idToken, audience)
	if err != nil {
		return nil, err
	}
	return verified.Claims, nil
}

type AuthHandler struct {
	repo           *EventRepository
	signer         *tokenSigner
	googleVerifier googleTokenVerifier
	appleVerifier  appleTokenVerifier
}

func NewAuthHandler(repo *EventRepository, signer *tokenSigner) *AuthHandler {
	return &AuthHandler{
		repo:           repo,
		signer:         signer,
		googleVerifier: liveGoogleTokenVerifier{},
		appleVerifier:  newLiveAppleTokenVerifier(),
	}
}

func (h *AuthHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.POST("/google-login", h.googleLogin)
	group.POST("/apple-login", h.appleLogin)
}

type googleLoginRequest struct {
	IDToken string `json:"id_token" binding:"required"`
}

type appleLoginRequest struct {
	IDToken string `json:"id_token" binding:"required"`
}

func (h *AuthHandler) googleLogin(c *gin.Context) {
	var payload googleLoginRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	audience := strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID"))
	if audience == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server misconfigured: missing GOOGLE_OAUTH_CLIENT_ID"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	claims, err := h.googleVerifier.Validate(ctx, payload.IDToken, audience)
	if err != nil {
		log.Printf("google-login: failed to validate id token: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Google token"})
		return
	}

	email, _ := claims["email"].(string)
	if email == "" {
		log.Printf("google-login: token missing email claim: %+v", claims)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google account does not expose an email address"})
		return
	}

	if emailVerified, ok := claims["email_verified"].(bool); ok && !emailVerified {
		log.Printf("google-login: email not verified for %s", email)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google email is not verified"})
		return
	}

	name, _ := claims["name"].(string)
	user, isNewUser, err := h.getOrCreateUserByEmail(c.Request.Context(), email, name)
	if err != nil {
		log.Printf("google-login: failed to upsert user %s: %v", email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	h.respondWithIssuedSession(c, user, "google-login", isNewUser)
}

func (h *AuthHandler) appleLogin(c *gin.Context) {
	var payload appleLoginRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	audiences := parseAudienceListEnv("APPLE_OAUTH_AUDIENCES")
	if len(audiences) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server misconfigured: missing APPLE_OAUTH_AUDIENCES"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	identity, err := h.appleVerifier.Verify(ctx, payload.IDToken, audiences)
	if err != nil {
		log.Printf("apple-login: failed to verify id token: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Apple token"})
		return
	}

	subject := strings.TrimSpace(identity.Subject)
	if subject == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Apple token missing account identifier"})
		return
	}

	ctxRepo, cancelRepo := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancelRepo()

	user, err := h.repo.GetUserByAppleSubject(ctxRepo, subject)
	switch {
	case err == nil:
		h.respondWithIssuedSession(c, user, "apple-login", false)
		return
	case !errors.Is(err, ErrUserNotFound):
		log.Printf("apple-login: failed to lookup account for sub %s: %v", subject, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	email := strings.TrimSpace(identity.Email)
	if email == "" {
		log.Printf("apple-login: no email and no existing subject link for sub %s", subject)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Apple account does not expose an email address; please complete first sign-in with email sharing enabled"})
		return
	}

	user, isNewUser, err := h.getOrCreateUserByEmail(c.Request.Context(), email, identity.Name)
	if err != nil {
		log.Printf("apple-login: failed to upsert user %s: %v", email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	ctxLink, cancelLink := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancelLink()
	if err := h.repo.LinkAppleAccount(ctxLink, subject, user.ID, email); err != nil {
		status := http.StatusInternalServerError
		message := "failed to link Apple account"
		if errors.Is(err, ErrAppleAccountLinkedToDifferentUser) {
			status = http.StatusUnauthorized
			message = "Apple account already linked to a different user"
		}
		log.Printf("apple-login: failed to link Apple account sub %s to user %d: %v", subject, user.ID, err)
		c.JSON(status, gin.H{"error": message})
		return
	}

	h.respondWithIssuedSession(c, user, "apple-login", isNewUser)
}

func (h *AuthHandler) getOrCreateUserByEmail(parentCtx context.Context, email, displayName string) (*User, bool, error) {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = fallbackNameFromEmail(email)
	}

	ctx, cancel := context.WithTimeout(parentCtx, requestTimeout)
	defer cancel()

	user, err := h.repo.GetUserByEmail(ctx, email)
	if err == nil {
		return user, false, nil
	}
	if !errors.Is(err, ErrUserNotFound) {
		return nil, false, err
	}

	passwordPlaceholder := uuid.NewString()
	user, err = h.repo.CreateUserWithPassword(ctx, name, email, passwordPlaceholder)
	if err != nil {
		return nil, false, err
	}
	return user, true, nil
}

func (h *AuthHandler) respondWithIssuedSession(c *gin.Context, user *User, logPrefix string, isNewUser bool) {
	token, claims, err := h.signer.issue(user.ID, user.Email)
	if err != nil {
		log.Printf("%s: failed to issue token for %d: %v", logPrefix, user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue session token"})
		return
	}

	userResponse := gin.H{
		"id":               user.ID,
		"name":             user.Name,
		"email":            user.Email,
		"profile_complete": user.ProfileComplete,
	}
	if user.Gender != nil {
		userResponse["gender"] = *user.Gender
	}
	if user.Age != nil {
		userResponse["age"] = *user.Age
	}
	if user.Avatar != nil {
		userResponse["avatar"] = *user.Avatar
	}

	c.JSON(http.StatusOK, gin.H{
		"user":        userResponse,
		"token":       token,
		"expires_at":  claims.ExpiresAt,
		"is_new_user": isNewUser,
	})
}

func parseAudienceListEnv(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	audiences := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			audiences = append(audiences, trimmed)
		}
	}
	return audiences
}

func fallbackNameFromEmail(email string) string {
	local := strings.TrimSpace(email)
	if local == "" {
		return "User"
	}
	if at := strings.Index(local, "@"); at > 0 {
		return local[:at]
	}
	return local
}
