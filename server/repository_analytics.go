package main

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"time"
)

type AnalyticsRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type CountBucket struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

type DayCount struct {
	Day   string `json:"day"`
	Count int64  `json:"count"`
}

type HourCount struct {
	Hour  string `json:"hour"`
	Count int64  `json:"count"`
}

type AnalyticsUsersSummary struct {
	NewUsers int64 `json:"new_users"`
}

type AnalyticsEventsSummary struct {
	Created           int64         `json:"created"`
	ZeroApprovedJoins int64         `json:"zero_approved_joins"`
	ByGroupType       []CountBucket `json:"by_group_type"`
	ByGender          []CountBucket `json:"by_gender"`
	ByAgeRange        []CountBucket `json:"by_age_range"`
	ByCreatedDay      []DayCount    `json:"by_created_day"`
	ByScheduledDay    []DayCount    `json:"by_scheduled_day"`
	ByScheduledHour   []HourCount   `json:"by_scheduled_hour"`
}

type AnalyticsJoinsSummary struct {
	Pending                     int64  `json:"pending"`
	Approved                    int64  `json:"approved"`
	Denied                      int64  `json:"denied"`
	CancelledDeleted            *int64 `json:"cancelled_deleted"`
	CancelledDeletedUnavailable bool   `json:"cancelled_deleted_unavailable"`
}

type AnalyticsMessagesSummary struct {
	TotalMessages      int64   `json:"total_messages"`
	EventsWithMessages int64   `json:"events_with_messages"`
	AveragePerEvent    float64 `json:"average_per_event"`
}

type AnalyticsConversionTimingSummary struct {
	AverageSignupToFirstEventHours        *float64 `json:"average_signup_to_first_event_hours"`
	AverageSignupToFirstApprovedJoinHours *float64 `json:"average_signup_to_first_approved_join_hours"`
}

type BackendAnalyticsSummary struct {
	Range              AnalyticsRange                   `json:"range"`
	Users              AnalyticsUsersSummary            `json:"users"`
	Events             AnalyticsEventsSummary           `json:"events"`
	Joins              AnalyticsJoinsSummary            `json:"joins"`
	Messages           AnalyticsMessagesSummary         `json:"messages"`
	ConversionTiming   AnalyticsConversionTimingSummary `json:"conversion_timing"`
	APIRequestFailures []APIRequestFailureStat          `json:"api_request_failures"`
	Notes              []string                         `json:"notes,omitempty"`
}

type analyticsQueryWindow struct {
	from time.Time
	to   time.Time
}

func (r *EventRepository) BackendAnalyticsSummary(ctx context.Context, window analyticsQueryWindow, failures []APIRequestFailureStat) (*BackendAnalyticsSummary, error) {
	params := []any{window.from.Format(time.RFC3339), window.to.Format(time.RFC3339)}
	summary := &BackendAnalyticsSummary{
		Range: AnalyticsRange{
			From: window.from.Format("2006-01-02"),
			To:   window.to.Add(-time.Nanosecond).Format("2006-01-02"),
		},
		Joins: AnalyticsJoinsSummary{
			CancelledDeleted:            nil,
			CancelledDeletedUnavailable: true,
		},
		APIRequestFailures: failures,
		Notes: []string{
			"cancelled/deleted join requests are not historically countable because pending rows are deleted on cancellation",
			"api_request_failures are in-memory counts since server start, not SQLite historical data",
		},
	}

	var err error
	if err = r.db.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM users
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?);
	`, params...).Scan(&summary.Users.NewUsers); err != nil {
		return nil, fmt.Errorf("count new users: %w", err)
	}

	if err = r.db.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?);
	`, params...).Scan(&summary.Events.Created); err != nil {
		return nil, fmt.Errorf("count created events: %w", err)
	}

	if err = r.db.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM events e
		WHERE datetime(e.created_at) >= datetime(?) AND datetime(e.created_at) < datetime(?)
		  AND NOT EXISTS (
			SELECT 1
			FROM conversation_join_requests r
			WHERE r.event_id = e.id AND r.status = 'approved'
		  );
	`, params...).Scan(&summary.Events.ZeroApprovedJoins); err != nil {
		return nil, fmt.Errorf("count zero-approved-join events: %w", err)
	}

	if summary.Events.ByGroupType, err = r.countBuckets(ctx, `
		SELECT COALESCE(NULLIF(group_type, ''), 'unknown') AS key, COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY key
		ORDER BY key ASC;
	`, params...); err != nil {
		return nil, fmt.Errorf("count events by group type: %w", err)
	}

	if summary.Events.ByGender, err = r.countBuckets(ctx, `
		SELECT COALESCE(NULLIF(gender, ''), 'unknown') AS key, COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY key
		ORDER BY key ASC;
	`, params...); err != nil {
		return nil, fmt.Errorf("count events by gender: %w", err)
	}

	if summary.Events.ByAgeRange, err = r.countBuckets(ctx, `
		SELECT printf('%ds_%ds', (min_age / 10) * 10, (max_age / 10) * 10) AS key, COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY key
		ORDER BY key ASC;
	`, params...); err != nil {
		return nil, fmt.Errorf("count events by age range: %w", err)
	}

	if summary.Events.ByCreatedDay, err = r.dayCounts(ctx, `
		SELECT date(created_at) AS day, COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY day
		ORDER BY day ASC;
	`, params...); err != nil {
		return nil, fmt.Errorf("count events by created day: %w", err)
	}

	if summary.Events.ByScheduledDay, err = r.dayCounts(ctx, `
		SELECT date(COALESCE(scheduled_at, event_date)) AS day, COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY day
		ORDER BY day ASC;
	`, params...); err != nil {
		return nil, fmt.Errorf("count events by scheduled day: %w", err)
	}

	if summary.Events.ByScheduledHour, err = r.hourCounts(ctx, `
		SELECT strftime('%H:00', COALESCE(scheduled_at, event_date || 'T' || time || ':00')) AS hour, COUNT(1)
		FROM events
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY hour
		ORDER BY hour ASC;
	`, params...); err != nil {
		return nil, fmt.Errorf("count events by scheduled hour: %w", err)
	}

	statusCounts, err := r.countBuckets(ctx, `
		SELECT status AS key, COUNT(1)
		FROM conversation_join_requests
		WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
		GROUP BY status
		ORDER BY status ASC;
	`, params...)
	if err != nil {
		return nil, fmt.Errorf("count join requests by status: %w", err)
	}
	for _, bucket := range statusCounts {
		switch bucket.Key {
		case "pending":
			summary.Joins.Pending = bucket.Count
		case "approved":
			summary.Joins.Approved = bucket.Count
		case "denied":
			summary.Joins.Denied = bucket.Count
		}
	}

	if err = r.db.QueryRowContext(ctx, `
		SELECT COUNT(1), COUNT(DISTINCT c.event_id)
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.event_id IS NOT NULL
		  AND datetime(m.created_at) >= datetime(?) AND datetime(m.created_at) < datetime(?);
	`, params...).Scan(&summary.Messages.TotalMessages, &summary.Messages.EventsWithMessages); err != nil {
		return nil, fmt.Errorf("count event messages: %w", err)
	}
	if summary.Events.Created > 0 {
		summary.Messages.AveragePerEvent = roundFloat(float64(summary.Messages.TotalMessages)/float64(summary.Events.Created), 2)
	}

	if summary.ConversionTiming.AverageSignupToFirstEventHours, err = r.averageHours(ctx, `
		WITH first_events AS (
			SELECT user_id, MIN(datetime(created_at)) AS first_event_at
			FROM events
			GROUP BY user_id
		)
		SELECT AVG((julianday(first_event_at) - julianday(users.created_at)) * 24.0)
		FROM users
		JOIN first_events ON first_events.user_id = users.id
		WHERE datetime(users.created_at) >= datetime(?) AND datetime(users.created_at) < datetime(?)
		  AND datetime(first_event_at) >= datetime(users.created_at);
	`, params...); err != nil {
		return nil, fmt.Errorf("average signup to first event: %w", err)
	}

	if summary.ConversionTiming.AverageSignupToFirstApprovedJoinHours, err = r.averageHours(ctx, `
		WITH first_joins AS (
			SELECT user_id, MIN(datetime(decided_at)) AS first_join_at
			FROM conversation_join_requests
			WHERE status = 'approved' AND decided_at IS NOT NULL
			GROUP BY user_id
		)
		SELECT AVG((julianday(first_join_at) - julianday(users.created_at)) * 24.0)
		FROM users
		JOIN first_joins ON first_joins.user_id = users.id
		WHERE datetime(users.created_at) >= datetime(?) AND datetime(users.created_at) < datetime(?)
		  AND datetime(first_join_at) >= datetime(users.created_at);
	`, params...); err != nil {
		return nil, fmt.Errorf("average signup to first approved join: %w", err)
	}

	sort.Slice(summary.APIRequestFailures, func(i, j int) bool {
		a := summary.APIRequestFailures[i]
		b := summary.APIRequestFailures[j]
		if a.Endpoint != b.Endpoint {
			return a.Endpoint < b.Endpoint
		}
		if a.Method != b.Method {
			return a.Method < b.Method
		}
		return a.StatusCode < b.StatusCode
	})

	return summary, nil
}

func (r *EventRepository) countBuckets(ctx context.Context, query string, args ...any) ([]CountBucket, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	buckets := make([]CountBucket, 0)
	for rows.Next() {
		var bucket CountBucket
		if err := rows.Scan(&bucket.Key, &bucket.Count); err != nil {
			return nil, err
		}
		buckets = append(buckets, bucket)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return buckets, nil
}

func (r *EventRepository) dayCounts(ctx context.Context, query string, args ...any) ([]DayCount, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make([]DayCount, 0)
	for rows.Next() {
		var count DayCount
		if err := rows.Scan(&count.Day, &count.Count); err != nil {
			return nil, err
		}
		counts = append(counts, count)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}

func (r *EventRepository) hourCounts(ctx context.Context, query string, args ...any) ([]HourCount, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make([]HourCount, 0)
	for rows.Next() {
		var count HourCount
		if err := rows.Scan(&count.Hour, &count.Count); err != nil {
			return nil, err
		}
		counts = append(counts, count)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}

func (r *EventRepository) averageHours(ctx context.Context, query string, args ...any) (*float64, error) {
	var value sql.NullFloat64
	if err := r.db.QueryRowContext(ctx, query, args...).Scan(&value); err != nil {
		return nil, err
	}
	if !value.Valid {
		return nil, nil
	}
	rounded := roundFloat(value.Float64, 2)
	return &rounded, nil
}

func roundFloat(value float64, precision int) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(value*ratio) / ratio
}
