package main

import (
	"testing"
	"time"
)

func TestAnonymousHelpRateLimiter(t *testing.T) {
	now := time.Now()
	limiter := newAnonymousHelpRateLimiter(2, time.Minute)
	if !limiter.Allow("first", now) || !limiter.Allow("first", now) {
		t.Fatal("expected requests within the limit to pass")
	}
	if limiter.Allow("first", now) {
		t.Fatal("expected request over the limit to be rejected")
	}
	if !limiter.Allow("first", now.Add(time.Minute)) {
		t.Fatal("expected the key to reset after the window")
	}
}

func TestAnonymousHelpRateLimiterBoundsTrackedKeys(t *testing.T) {
	limiter := newAnonymousHelpRateLimiter(1, time.Minute)
	limiter.maxKeys = 1
	now := time.Now()
	if !limiter.Allow("first", now) {
		t.Fatal("expected first key to be accepted")
	}
	if limiter.Allow("second", now) {
		t.Fatal("expected a new key to be rejected at capacity")
	}
	if !limiter.Allow("second", now.Add(time.Minute)) {
		t.Fatal("expected expired entries to be pruned before the capacity check")
	}
}
