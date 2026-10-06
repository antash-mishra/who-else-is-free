package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const defaultPastEventsLimit = 25
const maxPastEventsLimit = 100
const pastEventsCursorTimeLayout = "2006-01-02T15:04:05.000Z"

// The cursor uses the exact normalized SQL sort keys, including the ID tie-breaker.
// Snapshot fixes the past cutoff across pages; authorization is checked by every query.
type pastEventsCursor struct {
	Version   int    `json:"v"`
	UserID    int64  `json:"user"`
	Snapshot  string `json:"snapshot"`
	Scheduled string `json:"scheduled"`
	Created   string `json:"created"`
	ID        int64  `json:"id"`
}

type pastEventsPage struct {
	Data       []Event `json:"data"`
	NextCursor *string `json:"next_cursor"`
}

func (h *EventHandler) listUserPastEventsPage(c *gin.Context, userID int64) {
	limit := defaultPastEventsLimit
	if value, supplied := c.GetQuery("limit"); supplied {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > maxPastEventsLimit {
			c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be between 1 and 100"})
			return
		}
		limit = parsed
	} else if c.Request.URL.Query().Has("limit") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be between 1 and 100"})
		return
	}
	var cursor *pastEventsCursor
	if c.Request.URL.Query().Has("cursor") {
		decoded, err := decodePastEventsCursor(c.Query("cursor"), userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid past events cursor"})
			return
		}
		cursor = &decoded
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	page, err := h.repo.listUserPastEventsPage(ctx, userID, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch past events"})
		return
	}
	c.JSON(http.StatusOK, page)
}

func decodePastEventsCursor(encoded string, userID int64) (pastEventsCursor, error) {
	var cursor pastEventsCursor
	if len(encoded) > 1024 {
		return cursor, errors.New("cursor too large")
	}
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return cursor, err
	}
	if err := json.Unmarshal(data, &cursor); err != nil {
		return cursor, err
	}
	if cursor.Version != 1 || cursor.UserID != userID || cursor.ID <= 0 {
		return cursor, errors.New("invalid cursor identity")
	}
	for _, value := range []string{cursor.Snapshot, cursor.Scheduled, cursor.Created} {
		if _, err := time.Parse(pastEventsCursorTimeLayout, value); err != nil {
			return cursor, err
		}
	}
	return cursor, nil
}

func (r *EventRepository) listUserPastEventsPage(ctx context.Context, userID int64, limit int, cursor *pastEventsCursor) (pastEventsPage, error) {
	if limit < 1 || limit > maxPastEventsLimit {
		return pastEventsPage{}, errors.New("invalid page limit")
	}
	snapshot := time.Now().UTC().Format(pastEventsCursorTimeLayout)
	if cursor != nil {
		snapshot = cursor.Snapshot
	}
	// UNION de-duplicates hosts and participants, including multiple 1:1 conversations.
	// Enumerate the viewer's events using indexed ownership/membership, not a global history scan.
	query := `WITH eligible AS (
 SELECT id FROM events WHERE user_id = ?
 UNION
 SELECT c.event_id FROM conversation_members cm
 JOIN conversations c ON c.id = cm.conversation_id WHERE cm.user_id = ?
), ordered AS (
 SELECT e.*, strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(e.scheduled_at, e.event_date)) AS sort_schedule,
 strftime('%Y-%m-%dT%H:%M:%fZ', e.created_at) AS sort_created
 FROM events e WHERE e.id IN (SELECT id FROM eligible)
 AND ((e.scheduled_at IS NOT NULL AND datetime(e.scheduled_at) < datetime(?))
 OR (e.scheduled_at IS NULL AND e.event_date < date(?)))
)
SELECT e.id, e.user_id, e.title, e.location, e.time, e.event_date, e.description,
 e.gender, e.age_group_ids, e.age_selection_mode, e.min_age, e.max_age, e.date_label, e.group_type, e.cover_key, e.cover_upload_id,
 e.scheduled_at, e.place_id, e.latitude, e.longitude, e.created_at,
 u.name, u.avatar, e.sort_schedule, e.sort_created
FROM ordered e JOIN users u ON u.id = e.user_id`
	args := []any{userID, userID, snapshot, snapshot}
	if cursor != nil {
		query += ` WHERE (e.sort_schedule, e.sort_created, e.id) < (?, ?, ?)`
		args = append(args, cursor.Scheduled, cursor.Created, cursor.ID)
	}
	query += ` ORDER BY e.sort_schedule DESC, e.sort_created DESC, e.id DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return pastEventsPage{}, fmt.Errorf("query past events page: %w", err)
	}
	defer rows.Close()
	page := pastEventsPage{Data: make([]Event, 0, limit)}
	var last pastEventsCursor
	for rows.Next() {
		if len(page.Data) == limit {
			encoded, err := json.Marshal(last)
			if err != nil {
				return pastEventsPage{}, err
			}
			next := base64.RawURLEncoding.EncodeToString(encoded)
			page.NextCursor = &next
			break
		}
		var event Event
		var scheduled, placeID sql.NullString
		var latitude, longitude sql.NullFloat64
		var sortSchedule, sortCreated string
		if err := rows.Scan(&event.ID, &event.UserID, &event.Title, &event.Location,
			&event.Time, &event.EventDate, &event.Description, &event.Gender,
			&event.AgeGroupIDs, &event.AgeSelectionMode, &event.MinAge, &event.MaxAge, &event.DateLabel, &event.GroupType,
			&event.CoverKey, &event.CoverUploadID, &scheduled, &placeID, &latitude, &longitude,
			&event.CreatedAt, &event.HostName, &event.HostAvatar, &sortSchedule, &sortCreated); err != nil {
			return pastEventsPage{}, fmt.Errorf("scan past events page: %w", err)
		}
		if scheduled.Valid {
			for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05"} {
				if parsed, err := time.Parse(layout, scheduled.String); err == nil {
					utc := parsed.UTC()
					event.ScheduledAt = &utc
					break
				}
			}
		}
		if placeID.Valid {
			event.PlaceID = &placeID.String
		}
		if latitude.Valid {
			event.Latitude = &latitude.Float64
		}
		if longitude.Valid {
			event.Longitude = &longitude.Float64
		}
		event.DateLabel = deriveDateLabel(event.EventDate, time.Now())
		page.Data = append(page.Data, event)
		last = pastEventsCursor{Version: 1, UserID: userID, Snapshot: snapshot, Scheduled: sortSchedule, Created: sortCreated, ID: event.ID}
	}
	if err := rows.Err(); err != nil {
		return pastEventsPage{}, fmt.Errorf("read past events page: %w", err)
	}
	return page, nil
}
