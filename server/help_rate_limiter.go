package main

import (
	"sync"
	"time"
)

type anonymousHelpWindow struct {
	startedAt time.Time
	count     int
}

type anonymousHelpRateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	maxKeys int
	windows map[string]anonymousHelpWindow
}

func newAnonymousHelpRateLimiter(limit int, window time.Duration) *anonymousHelpRateLimiter {
	return &anonymousHelpRateLimiter{
		limit:   limit,
		window:  window,
		maxKeys: 10_000,
		windows: make(map[string]anonymousHelpWindow),
	}
}

func (l *anonymousHelpRateLimiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	for existingKey, entry := range l.windows {
		if now.Sub(entry.startedAt) >= l.window {
			delete(l.windows, existingKey)
		}
	}

	entry, exists := l.windows[key]
	if !exists {
		if len(l.windows) >= l.maxKeys {
			return false
		}
		l.windows[key] = anonymousHelpWindow{startedAt: now, count: 1}
		return true
	}
	if entry.count >= l.limit {
		return false
	}
	entry.count++
	l.windows[key] = entry
	return true
}
