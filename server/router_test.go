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

func clientIPFor(t *testing.T, headers map[string]string) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := newEngine()
	var got string
	r.GET("/ip", func(c *gin.Context) { got = c.ClientIP() })
	req := httptest.NewRequest(http.MethodGet, "/ip", nil)
	req.RemoteAddr = "10.0.0.1:4321"
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	r.ServeHTTP(httptest.NewRecorder(), req)
	return got
}

func TestClientIPIgnoresSpoofedForwardedFor(t *testing.T) {
	if got := clientIPFor(t, map[string]string{"X-Forwarded-For": "1.2.3.4"}); got != "10.0.0.1" {
		t.Fatalf("a client-supplied X-Forwarded-For must not set the client IP, got %q", got)
	}
}

func TestClientIPUsesFlyClientIP(t *testing.T) {
	got := clientIPFor(t, map[string]string{"Fly-Client-IP": "5.6.7.8", "X-Forwarded-For": "1.2.3.4"})
	if got != "5.6.7.8" {
		t.Fatalf("expected the Fly proxy's client IP, got %q", got)
	}
}
