package main

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

type APIRequestFailureStat struct {
	Endpoint   string `json:"endpoint"`
	Method     string `json:"method"`
	StatusCode int    `json:"status_code"`
	Count      int64  `json:"count"`
}

type analyticsCollector struct {
	mu       sync.Mutex
	failures map[apiFailureKey]int64
}

type apiFailureKey struct {
	Endpoint   string
	Method     string
	StatusCode int
}

func newAnalyticsCollector() *analyticsCollector {
	return &analyticsCollector{
		failures: make(map[apiFailureKey]int64),
	}
}

func (c *analyticsCollector) middleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		ctx.Next()

		status := ctx.Writer.Status()
		if status < http.StatusBadRequest {
			return
		}

		endpoint := ctx.FullPath()
		if endpoint == "" {
			endpoint = ctx.Request.URL.Path
		}

		c.mu.Lock()
		c.failures[apiFailureKey{
			Endpoint:   endpoint,
			Method:     ctx.Request.Method,
			StatusCode: status,
		}]++
		c.mu.Unlock()
	}
}

func (c *analyticsCollector) FailureStats() []APIRequestFailureStat {
	c.mu.Lock()
	defer c.mu.Unlock()

	stats := make([]APIRequestFailureStat, 0, len(c.failures))
	for key, count := range c.failures {
		stats = append(stats, APIRequestFailureStat{
			Endpoint:   key.Endpoint,
			Method:     key.Method,
			StatusCode: key.StatusCode,
			Count:      count,
		})
	}
	return stats
}
