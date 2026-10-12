package main

import (
	"context"
	"log"
	"time"
)

// startReportRetentionJob purges expired safety reports once at startup and
// then every interval until ctx ends. It logs counts only, never content.
func startReportRetentionJob(ctx context.Context, repo *EventRepository, interval time.Duration) {
	purge := func() {
		runCtx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		deleted, err := repo.PurgeExpiredEventReports(runCtx, time.Now())
		if err != nil {
			log.Printf("report retention: purge failed: %v", err)
			return
		}
		if deleted > 0 {
			log.Printf("report retention: purged %d expired report(s)", deleted)
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
