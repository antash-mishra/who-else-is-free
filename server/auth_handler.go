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

type AuthHandler struct {
	repo   *EventRepository
	signer *tokenSigner
}

func NewAuthHandler(repo *EventRepository, signer *tokenSigner) *AuthHandler {
	return &AuthHandler{repo: repo, signer: signer}
}

func (h *AuthHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.POST("/google-login", h.googleLogin)
}

type googleLoginRequest struct {
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

	verified, err := idtoken.Validate(ctx, payload.IDToken, audience)
	if err != nil {
		log.Printf("google-login: failed to validate id token: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Google token"})
		return
	}

	email, _ := verified.Claims["email"].(string)
	if email == "" {
		log.Printf("google-login: token missing email claim: %+v", verified.Claims)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google account does not expose an email address"})
		return
	}

	if emailVerified, ok := verified.Claims["email_verified"].(bool); ok && !emailVerified {
		log.Printf("google-login: email not verified for %s", email)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google email is not verified"})
		return
	}

	name, _ := verified.Claims["name"].(string)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	ctx, cancelRepo := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancelRepo()

	user, err := h.repo.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			passwordPlaceholder := uuid.NewString()
			user, err = h.repo.CreateUserWithPassword(ctx, name, email, passwordPlaceholder)
			if err != nil {
				log.Printf("google-login: failed to create user %s: %v", email, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
				return
			}
		} else {
			log.Printf("google-login: failed to load user %s: %v", email, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
			return
		}
	}

	token, claims, err := h.signer.issue(user.ID, user.Email)
	if err != nil {
		log.Printf("google-login: failed to issue token for %d: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue session token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
		"token":      token,
		"expires_at": claims.ExpiresAt,
	})
}
