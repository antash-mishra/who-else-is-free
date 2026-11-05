package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCoverAssetHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	for name, body := range map[string]string{
		"sports-badminton-1.png":   "badminton",
		"food-drinks-brunch-1.png": "brunch",
		"generic-1.png":            "generic",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	router := gin.New()
	handler := coverAssetHandler(dir, mustParseTestCoverCatalog(t))
	router.GET("/assets/covers/:file", handler)
	router.HEAD("/assets/covers/:file", handler)

	cases := []struct {
		path   string
		status int
		body   string
	}{
		{"/assets/covers/food-drinks-brunch-1.png", http.StatusOK, "brunch"},
		{"/assets/covers/food-drinks-brunch-2.png", http.StatusOK, "brunch"}, // retired: same folder
		{"/assets/covers/outdoor-nature-1.png", http.StatusOK, "badminton"},  // retired: default
		{"/assets/covers/generic-2.png", http.StatusOK, "generic"},
		{"/assets/covers/food-drinks-coffee-1.png", http.StatusNotFound, ""}, // active, image missing
		{"/assets/covers/no-such-cover-1.png", http.StatusNotFound, ""},
		{"/assets/covers/Sports-Badminton-1.png", http.StatusNotFound, ""},
		{"/assets/covers/sports-badminton-1.jpg", http.StatusNotFound, ""},
		{"/assets/covers/..png", http.StatusNotFound, ""},
	}
	for _, tc := range cases {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != tc.status {
			t.Fatalf("GET %s = %d, want %d", tc.path, rec.Code, tc.status)
		}
		if tc.body != "" && rec.Body.String() != tc.body {
			t.Fatalf("GET %s body = %q, want %q", tc.path, rec.Body.String(), tc.body)
		}
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodHead, "/assets/covers/food-drinks-brunch-2.png", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("HEAD for a retired cover = %d, want 200", rec.Code)
	}
}
