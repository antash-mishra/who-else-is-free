package main

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

type AdminAccessHandler struct {
	repo *EventRepository
}

func NewAdminAccessHandler(repo *EventRepository) *AdminAccessHandler {
	return &AdminAccessHandler{repo: repo}
}

func (h *AdminAccessHandler) access(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	isAdmin, err := h.repo.IsAdmin(ctx, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check admin access"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"is_admin": isAdmin})
}
