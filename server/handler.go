package main

import (
	"context"
	"net/http"
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
