package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	errInvalidAnalyticsFromDate = errors.New("from must be in YYYY-MM-DD format")
	errInvalidAnalyticsToDate   = errors.New("to must be in YYYY-MM-DD format")
	errInvalidAnalyticsRange    = errors.New("from must be before or equal to to")
)

type AnalyticsHandler struct {
	repo      *EventRepository
	collector *analyticsCollector
}

func NewAnalyticsHandler(repo *EventRepository, collector *analyticsCollector) *AnalyticsHandler {
	return &AnalyticsHandler{
		repo:      repo,
		collector: collector,
	}
}

func (h *AnalyticsHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.GET("/analytics/summary", h.summary)
}

func (h *AnalyticsHandler) summary(c *gin.Context) {
	window, err := parseAnalyticsWindow(c.Query("from"), c.Query("to"), time.Now().UTC())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	failures := []APIRequestFailureStat(nil)
	if h.collector != nil {
		failures = h.collector.FailureStats()
	}

	summary, err := h.repo.BackendAnalyticsSummary(ctx, window, failures)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch analytics summary"})
		return
	}

	c.JSON(http.StatusOK, summary)
}

func parseAnalyticsWindow(fromValue string, toValue string, now time.Time) (analyticsQueryWindow, error) {
	fromValue = strings.TrimSpace(fromValue)
	toValue = strings.TrimSpace(toValue)

	var (
		from time.Time
		to   time.Time
		err  error
	)

	if fromValue == "" {
		from = startOfDay(now).AddDate(0, 0, -30)
	} else {
		from, err = time.Parse("2006-01-02", fromValue)
		if err != nil {
			return analyticsQueryWindow{}, errInvalidAnalyticsFromDate
		}
	}

	if toValue == "" {
		to = startOfDay(now).AddDate(0, 0, 1)
	} else {
		to, err = time.Parse("2006-01-02", toValue)
		if err != nil {
			return analyticsQueryWindow{}, errInvalidAnalyticsToDate
		}
		to = to.AddDate(0, 0, 1)
	}

	if !from.Before(to) {
		return analyticsQueryWindow{}, errInvalidAnalyticsRange
	}

	return analyticsQueryWindow{from: from.UTC(), to: to.UTC()}, nil
}
