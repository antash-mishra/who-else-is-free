package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestLoggerDropsQueryString(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var out bytes.Buffer
	r := gin.New()
	r.Use(requestLogger(&out))
	r.GET("/api/ws", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/ws?token=session-secret", nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	line := out.String()
	if strings.Contains(line, "session-secret") || strings.Contains(line, "token=") {
		t.Fatalf("log line leaks the query string: %q", line)
	}
	if !strings.Contains(line, `"/api/ws"`) || !strings.Contains(line, "200") {
		t.Fatalf("log line is missing the path or status: %q", line)
	}
}
