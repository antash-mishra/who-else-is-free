package main

import (
	"fmt"
	"strings"
	"time"
)

func startOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func deriveDateLabel(eventDate string, now time.Time) string {
	loc := now.Location()
	date, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(eventDate), loc)
	if err != nil {
		return "Today"
	}
	today := startOfDay(now)
	eventDay := startOfDay(date)
	switch int(eventDay.Sub(today).Hours() / 24) {
	case 0:
		return "Today"
	case 1:
		return "Tmrw"
	default:
		return "Today"
	}
}

// normalizeEventSchedule validates the provided date/time and returns a normalized
// date string (YYYY-MM-DD), a derived date label (Today/Tmrw), and the minute
// value of the time slot for downstream comparisons.
// NOTE: We intentionally avoid enforcing "future-only" semantics here because
// the mobile client already validates against the user's local timezone. Doing
// the same on the server using its own timezone causes valid submissions to be
// rejected when the app and server are in different timezones.
func normalizeEventSchedule(eventDate string, timeLabel string, now time.Time) (string, string, int, error) {
	dateStr := strings.TrimSpace(eventDate)
	if dateStr == "" {
		return "", "", 0, fmt.Errorf("event_date is required")
	}

	loc := now.Location()
	date, err := time.ParseInLocation("2006-01-02", dateStr, loc)
	if err != nil {
		return "", "", 0, fmt.Errorf("event_date must use YYYY-MM-DD")
	}

	minutes, err := parseEventTimeLabel(timeLabel)
	if err != nil {
		return "", "", 0, err
	}

	// Derive label relative to server "now", but do not reject based on
	// past/future to avoid timezone mismatch issues.
	dateLabel := deriveDateLabel(date.Format("2006-01-02"), now)

	return date.Format("2006-01-02"), dateLabel, minutes, nil
}

func normalizeScheduledLegacyFields(eventDate string, timeLabel string, dateLabel string, now time.Time) (string, string, string, error) {
	normalizedDate, derivedLabel, _, err := normalizeEventSchedule(eventDate, timeLabel, now)
	if err != nil {
		return "", "", "", err
	}

	normalizedTime := strings.TrimSpace(timeLabel)
	normalizedLabel := normalizeLegacyDateLabel(dateLabel, derivedLabel)

	return normalizedDate, normalizedTime, normalizedLabel, nil
}

func normalizeLegacyDateLabel(dateLabel string, derivedLabel string) string {
	switch strings.ToLower(strings.TrimSpace(dateLabel)) {
	case "today":
		return "Today"
	case "tmrw":
		return "Tmrw"
	default:
		return derivedLabel
	}
}

// parseEventTimeLabel supports both 24-hour strings (e.g. "20:30") and the
// "7:00pm" format used by the client. It returns the minutes since midnight.
func parseEventTimeLabel(label string) (int, error) {
	trimmed := strings.TrimSpace(label)
	if trimmed == "" {
		return 0, fmt.Errorf("time is required")
	}

	lower := strings.ToLower(strings.ReplaceAll(trimmed, " ", ""))
	var parsed time.Time
	var err error
	if strings.Contains(lower, "am") || strings.Contains(lower, "pm") {
		parsed, err = time.Parse("3:04pm", lower)
	} else {
		parsed, err = time.Parse("15:04", lower)
	}
	if err != nil {
		return 0, fmt.Errorf("invalid time format")
	}

	return parsed.Hour()*60 + parsed.Minute(), nil
}

// parseScheduledAt parses an ISO 8601 UTC timestamp string into a time.Time value.
// Returns an error if the string is empty or not a valid ISO 8601 format.
func parseScheduledAt(isoString string) (time.Time, error) {
	trimmed := strings.TrimSpace(isoString)
	if trimmed == "" {
		return time.Time{}, fmt.Errorf("scheduled_at is required")
	}

	// Parse ISO 8601 / RFC 3339 format
	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err != nil {
		// Try without timezone suffix (assume UTC)
		parsed, err = time.Parse("2006-01-02T15:04:05", trimmed)
		if err != nil {
			return time.Time{}, fmt.Errorf("scheduled_at must be a valid ISO 8601 timestamp")
		}
		parsed = parsed.UTC()
	}

	return parsed.UTC(), nil
}

// deriveLegacyFields extracts event_date, time, and date_label from a scheduled_at
// timestamp for backward compatibility. The server time (now) is used to determine
// the date_label (Today/Tmrw).
func deriveLegacyFields(scheduledAt time.Time, serverNow time.Time) (eventDate, timeStr, dateLabel string) {
	// Convert to server's local timezone for display purposes
	local := scheduledAt.In(serverNow.Location())

	eventDate = local.Format("2006-01-02")
	timeStr = local.Format("15:04")
	dateLabel = deriveDateLabel(eventDate, serverNow)

	return eventDate, timeStr, dateLabel
}

// formatScheduledAtUTC formats a time.Time value as an ISO 8601 UTC string.
func formatScheduledAtUTC(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
