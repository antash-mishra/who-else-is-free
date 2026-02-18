package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const requestTimeout = 5 * time.Second
const updatedEventDetailMessage = "Updated Event Detail"

type EventHandler struct {
	repo *EventRepository
	hub  *ChatHub
}

func NewEventHandler(repo *EventRepository, hub ...*ChatHub) *EventHandler {
	handler := &EventHandler{repo: repo}
	if len(hub) > 0 {
		handler.hub = hub[0]
	}
	return handler
}

func (h *EventHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.GET("/events", h.listEvents)
}

func (h *EventHandler) RegisterProtectedRoutes(group *gin.RouterGroup) {
	group.POST("/events", h.createEvent)
	group.PUT("/events/:id", h.updateEvent)
	group.DELETE("/events/:id", h.deleteEvent)
}

func (h *EventHandler) listEvents(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	events, err := h.repo.List(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch events"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": events})
}

func (h *EventHandler) createEvent(c *gin.Context) {
	var payload CreateEventParams
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	payload.UserID = claims.UserID

	if payload.MaxAge < payload.MinAge {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_age must be greater than or equal to min_age"})
		return
	}

	now := time.Now()

	// If scheduled_at is provided, parse it and derive legacy fields
	if payload.ScheduledAt != "" {
		scheduledTime, err := parseScheduledAt(payload.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// Derive legacy fields from scheduled_at for backward compatibility
		eventDate, timeStr, dateLabel := deriveLegacyFields(scheduledTime, now)
		payload.EventDate = eventDate
		payload.Time = timeStr
		payload.DateLabel = dateLabel
	} else {
		// Fall back to legacy validation
		eventDate, normalizedLabel, _, err := normalizeEventSchedule(payload.EventDate, payload.Time, now)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.EventDate = eventDate
		payload.DateLabel = normalizedLabel
	}

	payload.GroupType = strings.TrimSpace(payload.GroupType)
	if payload.GroupType == "" {
		payload.GroupType = "Single"
	}
	payload.CoverKey = normalizeCoverKey(payload.CoverKey)

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	id, err := h.repo.Create(ctx, payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create event"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *EventHandler) updateEvent(c *gin.Context) {
	var payload UpdateEventParams
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if payload.MaxAge < payload.MinAge {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_age must be greater than or equal to min_age"})
		return
	}

	if payload.CoverKey != nil {
		value := normalizeCoverKey(*payload.CoverKey)
		payload.CoverKey = &value
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	// Get user from session
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	now := time.Now()

	// If scheduled_at is provided, parse it and derive legacy fields
	if payload.ScheduledAt != "" {
		scheduledTime, err := parseScheduledAt(payload.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// Derive legacy fields from scheduled_at for backward compatibility
		eventDate, timeStr, dateLabel := deriveLegacyFields(scheduledTime, now)
		payload.EventDate = eventDate
		payload.Time = timeStr
		payload.DateLabel = dateLabel
	} else {
		// Fall back to legacy validation
		eventDate, normalizedLabel, _, err := normalizeEventSchedule(payload.EventDate, payload.Time, now)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.EventDate = eventDate
		payload.DateLabel = normalizedLabel
	}

	payload.GroupType = strings.TrimSpace(payload.GroupType)
	if payload.GroupType == "" {
		payload.GroupType = "Single"
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	err = h.repo.Update(ctx, id, claims.UserID, payload)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "event not found or not owned by user"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update event"})
		}
		return
	}

	h.emitEventUpdateChatMessages(ctx, id, claims.UserID)

	c.JSON(http.StatusOK, gin.H{"message": "event updated"})
}

func (h *EventHandler) emitEventUpdateChatMessages(ctx context.Context, eventID, hostUserID int64) {
	if h.hub == nil {
		return
	}

	conversations, err := h.repo.ListConversationsForEvent(ctx, eventID, hostUserID)
	if err != nil {
		log.Printf("failed to list conversations for event update message (event %d): %v", eventID, err)
		return
	}

	seenConversationIDs := make(map[int64]struct{}, len(conversations))
	for _, conversation := range conversations {
		if conversation.ID == 0 {
			continue
		}
		if _, seen := seenConversationIDs[conversation.ID]; seen {
			continue
		}
		seenConversationIDs[conversation.ID] = struct{}{}

		message, err := h.repo.CreateMessage(ctx, CreateMessageParams{
			ConversationID: conversation.ID,
			SenderID:       hostUserID,
			Body:           updatedEventDetailMessage,
			DeliveryStatus: "sent",
		})
		if err != nil {
			log.Printf(
				"failed to create event update message for event %d conversation %d: %v",
				eventID,
				conversation.ID,
				err,
			)
			continue
		}

		h.hub.emitChatMessage(message, "")
	}
}

func (h *EventHandler) deleteEvent(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	// Get user from session
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	err = h.repo.Delete(ctx, id, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found or not owned by user"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete event"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "event deleted"})
}

func normalizeCoverKey(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return defaultCoverKey
	}
	return trimmed
}

type reportEventBody struct {
	Reason string `json:"reason" binding:"required"`
}

func (h *EventHandler) reportEvent(c *gin.Context) {
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	idStr := c.Param("id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	var payload reportEventBody
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reason := strings.TrimSpace(payload.Reason)
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	// Verify event exists
	_, err = h.repo.GetEventByID(ctx, eventID)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		return
	}

	report, err := h.repo.CreateEventReport(ctx, eventID, claims.UserID, reason)
	if err != nil {
		if errors.Is(err, ErrReportAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": "you have already reported this event"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit report"})
		return
	}

	convo, convoErr := h.repo.findUserConversationForEventPublic(ctx, eventID, claims.UserID)
	if convoErr != nil && !errors.Is(convoErr, ErrConversationNotFound) {
		log.Printf("failed to find reporter conversation for event %d user %d: %v", eventID, claims.UserID, convoErr)
	}

	// Reporter should be detached from event participation after report submission.
	removeErr := h.repo.RemoveEventMember(ctx, eventID, claims.UserID)
	if removeErr != nil &&
		!errors.Is(removeErr, ErrNotConversationMember) &&
		!errors.Is(removeErr, ErrCannotRemoveHost) {
		log.Printf("failed to remove reporter %d from event %d: %v", claims.UserID, eventID, removeErr)
	}

	if removeErr == nil && convo != nil && h.hub != nil {
		h.hub.NotifyMembership(convo.ID, claims.UserID, "removed")
	}

	// Silently cancel any pending join request for this user/event
	_ = h.repo.CancelJoinRequest(ctx, eventID, claims.UserID)

	c.JSON(http.StatusCreated, gin.H{"report": report})
}
