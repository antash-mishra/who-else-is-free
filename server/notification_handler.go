package main

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// NotificationHandler exposes the in-app Notifications inbox over HTTP. The
// inbox-display body is finalized server-side at persistence time (see
// notification_payloads.go), so these endpoints are pure renderers — the client
// receives the already-mapped body string and never constructs inbox text.
type NotificationHandler struct {
	repo *EventRepository
}

func NewNotificationHandler(repo *EventRepository) *NotificationHandler {
	return &NotificationHandler{repo: repo}
}

// NotificationView is the JSON shape returned by the inbox endpoints. It
// mirrors the persisted Notification but omits internal fields the client does
// not need directly. The inbox body is the already-overridden display text.
type NotificationView struct {
	ID             int64  `json:"id"`
	Type           string `json:"type"`
	EventID        *int64 `json:"event_id,omitempty"`
	ConversationID *int64 `json:"conversation_id,omitempty"`
	Title          string `json:"title"`
	Body           string `json:"body"`
	Payload        string `json:"payload,omitempty"`
	Read           bool   `json:"read"`
	CreatedAt      string `json:"created_at"`
}

type listNotificationsResponse struct {
	Notifications []NotificationView `json:"notifications"`
}

type unreadCountResponse struct {
	Count int `json:"count"`
}

func (h *NotificationHandler) RegisterRoutes(protected *gin.RouterGroup) {
	protected.GET("/notifications", h.listNotifications)
	protected.POST("/notifications/:id/read", h.markNotificationRead)
	protected.POST("/notifications/read-all", h.markAllNotificationsRead)
	protected.DELETE("/notifications", h.clearNotifications)
	protected.GET("/notifications/unread-count", h.unreadCount)
}

const (
	defaultNotificationsLimit  = 20
	maxNotificationsLimit     = 100
)

func (h *NotificationHandler) listNotifications(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	limit, offset := parseNotificationsPagination(c)
	ctx := c.Request.Context()
	notifications, err := h.repo.ListNotifications(ctx, claims.UserID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notifications"})
		return
	}

	views := make([]NotificationView, 0, len(notifications))
	for _, n := range notifications {
		views = append(views, toNotificationView(n))
	}
	c.JSON(http.StatusOK, listNotificationsResponse{Notifications: views})
}

func (h *NotificationHandler) markNotificationRead(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	idString := c.Param("id")
	id, err := strconv.ParseInt(idString, 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid notification id"})
		return
	}

	ctx := c.Request.Context()
	if err := h.repo.MarkNotificationRead(ctx, claims.UserID, id); err != nil {
		if errors.Is(err, ErrNotificationNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark notification read"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *NotificationHandler) markAllNotificationsRead(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	ctx := c.Request.Context()
	if err := h.repo.MarkAllNotificationsRead(ctx, claims.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark notifications read"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *NotificationHandler) clearNotifications(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	ctx := c.Request.Context()
	if err := h.repo.DeleteAllNotifications(ctx, claims.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear notifications"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *NotificationHandler) unreadCount(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	ctx := c.Request.Context()
	count, err := h.repo.CountUnreadNotifications(ctx, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count unread notifications"})
		return
	}
	c.JSON(http.StatusOK, unreadCountResponse{Count: count})
}

// parseNotificationsPagination reads ?limit=&offset= with sane clamps.
func parseNotificationsPagination(c *gin.Context) (int, int) {
	limit := defaultNotificationsLimit
	offset := 0
	if v := c.Query("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = parsed
			if limit > maxNotificationsLimit {
				limit = maxNotificationsLimit
			}
		}
	}
	if v := c.Query("offset"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	return limit, offset
}

func toNotificationView(n Notification) NotificationView {
	var createdAt string
	if !n.CreatedAt.IsZero() {
		createdAt = n.CreatedAt.Format("2006-01-02T15:04:05.000Z")
	}
	return NotificationView{
		ID:             n.ID,
		Type:           n.Type,
		EventID:        n.EventID,
		ConversationID: n.ConversationID,
		Title:          n.Title,
		Body:           n.Body,
		Payload:        n.Payload,
		Read:           n.Read,
		CreatedAt:      createdAt,
	}
}
