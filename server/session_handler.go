package main

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type refreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

const sessionExpiredMessage = "session expired, please sign in again"

// refreshSession trades a refresh key for a new access token and a rotated
// refresh key. The response matches the sign-in response so the client can
// refresh its cached profile too.
func (h *AuthHandler) refreshSession(c *gin.Context) {
	var payload refreshTokenRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	userID, refreshToken, refreshExpiresAt, err := h.repo.RotateRefreshToken(ctx, payload.RefreshToken, h.clock())
	if err != nil {
		if errors.Is(err, ErrRefreshTokenReused) {
			log.Printf("session-refresh: reused refresh key; family revoked")
		} else if !errors.Is(err, ErrRefreshTokenInvalid) {
			log.Printf("session-refresh: failed to rotate refresh key: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to refresh session"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": sessionExpiredMessage})
		return
	}

	user, err := h.repo.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": sessionExpiredMessage})
			return
		}
		log.Printf("session-refresh: failed to load user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to refresh session"})
		return
	}

	h.issueSession(c, user, "session-refresh", false, refreshToken, refreshExpiresAt)
}

// logoutSession revokes the device's refresh family. It always answers 204 so
// signing out never depends on the key still being known.
func (h *AuthHandler) logoutSession(c *gin.Context) {
	var payload refreshTokenRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.Status(http.StatusNoContent)
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	if err := h.repo.RevokeRefreshTokenFamily(ctx, payload.RefreshToken, h.clock()); err != nil {
		log.Printf("session-logout: failed to revoke refresh key: %v", err)
	}
	c.Status(http.StatusNoContent)
}
