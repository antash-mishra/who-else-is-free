package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
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
	group.POST("/events", h.createEvent)
}

func (h *EventHandler) RegisterProtectedRoutes(group *gin.RouterGroup) {
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

	if payload.MaxAge < payload.MinAge {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_age must be greater than or equal to min_age"})
		return
	}

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
