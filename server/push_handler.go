package main

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type PushHandler struct {
	repo       *EventRepository
	pushSender PushSender
}

func NewPushHandler(repo *EventRepository, pushSender PushSender) *PushHandler {
	return &PushHandler{repo: repo, pushSender: pushSender}
}

type registerPushTokenRequest struct {
	Token    string `json:"token" binding:"required"`
	DeviceID string `json:"device_id" binding:"required"`
	Platform string `json:"platform" binding:"required,oneof=android ios"`
}

type deletePushTokenRequest struct {
	Token string `json:"token" binding:"required"`
}

// registerPushToken stores or updates a push token for the authenticated user.
func (h *PushHandler) registerPushToken(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	var payload registerPushTokenRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token := strings.TrimSpace(payload.Token)
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	ctx := c.Request.Context()
	if err := h.repo.UpsertPushToken(ctx, claims.UserID, token, payload.DeviceID, payload.Platform); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register push token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "push token registered"})
}

// testPush sends a test push notification to all devices of the authenticated user.
func (h *PushHandler) testPush(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	ctx := c.Request.Context()
	tokens, err := h.repo.ListPushTokensByUser(ctx, claims.UserID)
	if err != nil {
		log.Printf("testPush: list tokens failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list push tokens"})
		return
	}
	if len(tokens) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no push tokens registered"})
		return
	}

	var notifications []PushNotification
	for _, t := range tokens {
		notifications = append(notifications, PushNotification{
			Token: t.Token,
			Data: map[string]string{
				"type":  "test",
				"title": "Test Notification",
				"body":  "Push notifications are working!",
			},
		})
	}

	if err := h.pushSender.SendBatch(ctx, notifications); err != nil {
		log.Printf("testPush: send failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send test notification"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "test notification sent", "device_count": len(tokens)})
}

// deletePushToken removes a specific push token for the authenticated user.
func (h *PushHandler) deletePushToken(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	var payload deletePushTokenRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token := strings.TrimSpace(payload.Token)
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	ctx := c.Request.Context()
	if err := h.repo.DeletePushToken(ctx, claims.UserID, token); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "push token not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "push token deleted"})
}
