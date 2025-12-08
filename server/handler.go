package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const requestTimeout = 5 * time.Second

type EventHandler struct {
	repo *EventRepository
}

func NewEventHandler(repo *EventRepository) *EventHandler {
	return &EventHandler{repo: repo}
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
	clientLabel := strings.ToLower(strings.TrimSpace(payload.DateLabel))
	if clientLabel == "today" || clientLabel == "tmrw" {
		target := startOfDay(now)
		if clientLabel == "tmrw" {
			target = target.AddDate(0, 0, 1)
		}
		payload.EventDate = target.Format("2006-01-02")
	}

	eventDate, fallbackLabel, _, err := normalizeEventSchedule(payload.EventDate, payload.Time, now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	payload.EventDate = eventDate
	if clientLabel == "today" {
		payload.DateLabel = "Today"
	} else if clientLabel == "tmrw" {
		payload.DateLabel = "Tmrw"
	} else {
		payload.DateLabel = fallbackLabel
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
	clientLabel := strings.ToLower(strings.TrimSpace(payload.DateLabel))
	if clientLabel == "today" || clientLabel == "tmrw" {
		target := startOfDay(now)
		if clientLabel == "tmrw" {
			target = target.AddDate(0, 0, 1)
		}
		payload.EventDate = target.Format("2006-01-02")
	}

	eventDate, fallbackLabel, _, err := normalizeEventSchedule(payload.EventDate, payload.Time, now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payload.EventDate = eventDate
	if clientLabel == "today" {
		payload.DateLabel = "Today"
	} else if clientLabel == "tmrw" {
		payload.DateLabel = "Tmrw"
	} else {
		payload.DateLabel = fallbackLabel
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

	c.JSON(http.StatusOK, gin.H{"message": "event updated"})
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
