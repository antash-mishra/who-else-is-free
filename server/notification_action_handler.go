package main

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type notificationActionResolveRequest struct {
	NotificationIDs []int64 `json:"notification_ids"`
	MarkHandled     bool    `json:"mark_handled"`
	Type            string  `json:"type"`
	EventID         *int64  `json:"event_id"`
	ConversationID  *int64  `json:"conversation_id"`
	JoinRequestID   *int64  `json:"join_request_id"`
}

func (h *NotificationHandler) resolveAction(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	var request notificationActionResolveRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid notification action request"})
		return
	}
	request.Type = strings.TrimSpace(strings.ToLower(request.Type))
	resolution, err := h.repo.ResolveNotificationAction(c.Request.Context(), claims.UserID, NotificationActionResolveInput{
		NotificationIDs: request.NotificationIDs,
		MarkHandled:     request.MarkHandled,
		Type:            request.Type,
		EventID:         request.EventID,
		ConversationID:  request.ConversationID,
		JoinRequestID:   request.JoinRequestID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrNotificationActionInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid notification action request"})
		case errors.Is(err, ErrNotificationActionNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "notification action not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve notification action"})
		}
		return
	}

	reason := ""
	if resolution.Reason != nil {
		reason = string(*resolution.Reason)
	}
	log.Printf(
		"notification action resolved user=%d status=%s reason=%s destination=%s id_count=%d",
		claims.UserID,
		resolution.Status,
		reason,
		resolution.Destination,
		len(request.NotificationIDs),
	)
	c.JSON(http.StatusOK, resolution)
}
