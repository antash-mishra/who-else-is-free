package main

import (
	"context"
	"log"
	"time"
)

// startAuthCleanupJob deletes expired sign-in material (refresh keys and email
// codes) once at
// startup and then every interval until ctx ends. It logs counts only.
func startAuthCleanupJob(ctx context.Context, repo *EventRepository, interval time.Duration) {
	purge := func() {
		runCtx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		deleted, err := repo.PurgeExpiredRefreshTokens(runCtx, time.Now())
		if err != nil {
			log.Printf("auth cleanup: refresh key purge failed: %v", err)
		} else if deleted > 0 {
			log.Printf("auth cleanup: purged %d refresh key(s)", deleted)
		}
		codes, err := repo.PurgeExpiredEmailLoginCodes(runCtx, time.Now())
		if err != nil {
			log.Printf("auth cleanup: email code purge failed: %v", err)
		} else if codes > 0 {
			log.Printf("auth cleanup: purged %d email code(s)", codes)
		}
	}
	go func() {
		purge()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				purge()
			}
		}
	}()
}
