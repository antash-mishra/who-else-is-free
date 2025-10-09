package main

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
    repo   *EventRepository
    signer *tokenSigner
}

func NewAuthHandler(repo *EventRepository, signer *tokenSigner) *AuthHandler {
    return &AuthHandler{repo: repo, signer: signer}
}

func (h *AuthHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.POST("/login", h.login)
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) login(c *gin.Context) {
    // Authenticate the user, then issue a signed chat token consumed by REST + WS flows.
    var payload loginRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	user, err := h.repo.AuthenticateUser(ctx, payload.Email, payload.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to sign in"})
		return
	}

	token, claims, err := h.signer.issue(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to issue session token"})
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
