package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"testing"
	"time"
)

func insertPastEventForTest(
	t *testing.T,
	env *apiTestEnv,
	userID int64,
	title string,
	scheduledAt time.Time,
	createdAt time.Time,
) {
	t.Helper()
	_, err := env.db.ExecContext(context.Background(), `
INSERT INTO events (
    user_id, title, location, time, event_date, description, gender,
    min_age, max_age, date_label, group_type, cover_key, scheduled_at, created_at
)
VALUES (?, ?, 'Dublin', '18:00', ?, 'Past plan', 'Any', 18, 60, 'Today', 'Group', ?, ?, ?)
`,
		userID,
		title,
		scheduledAt.Format("2006-01-02"),
		defaultCoverKey,
		scheduledAt.UTC().Format(time.RFC3339),
		createdAt.UTC().Format("2006-01-02 15:04:05"),
	)
	if err != nil {
		t.Fatalf("insert past event %q: %v", title, err)
	}
}

func TestListUserPastEventsPagination(t *testing.T) {
	env := setupAPITestEnv(t)
	user, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
	if err != nil {
		t.Fatalf("load seeded user: %v", err)
	}
	token := env.issueTokenForEmail(t, user.Email)
	now := time.Now().UTC().Truncate(time.Second)
	for index := 0; index < 5; index++ {
		insertPastEventForTest(
			t,
			env,
			user.ID,
			fmt.Sprintf("Past %d", index),
			now.Add(-time.Duration(index+1)*time.Hour),
			now.Add(-time.Duration(index)*time.Minute),
		)
	}

	firstResponse := env.doRequest(t, http.MethodGet, "/api/events/past?limit=2", token, nil)
	if firstResponse.StatusCode != http.StatusOK {
		t.Fatalf("first page: expected 200, got %d", firstResponse.StatusCode)
	}
	firstPage := decodeJSON[listPastEventsResponse](t, firstResponse)
	if len(firstPage.Data) != 2 || firstPage.Data[0].Title != "Past 0" || firstPage.Data[1].Title != "Past 1" {
		t.Fatalf("unexpected first page: %#v", firstPage.Data)
	}
	if firstPage.NextCursor == nil {
		t.Fatal("expected first page cursor")
	}

	// A newly ended plan inserted before the next request must not shift the
	// cursor window or duplicate a row from page one.
	insertPastEventForTest(t, env, user.ID, "Newly ended", now.Add(-30*time.Minute), now)
	secondResponse := env.doRequest(
		t,
		http.MethodGet,
		"/api/events/past?limit=2&cursor="+url.QueryEscape(*firstPage.NextCursor),
		token,
		nil,
	)
	if secondResponse.StatusCode != http.StatusOK {
		t.Fatalf("second page: expected 200, got %d", secondResponse.StatusCode)
	}
	secondPage := decodeJSON[listPastEventsResponse](t, secondResponse)
	if len(secondPage.Data) != 2 || secondPage.Data[0].Title != "Past 2" || secondPage.Data[1].Title != "Past 3" {
		t.Fatalf("unexpected second page: %#v", secondPage.Data)
	}
	if secondPage.NextCursor == nil {
		t.Fatal("expected second page cursor")
	}

	thirdResponse := env.doRequest(
		t,
		http.MethodGet,
		"/api/events/past?limit=2&cursor="+url.QueryEscape(*secondPage.NextCursor),
		token,
		nil,
	)
	thirdPage := decodeJSON[listPastEventsResponse](t, thirdResponse)
	if len(thirdPage.Data) != 1 || thirdPage.Data[0].Title != "Past 4" {
		t.Fatalf("unexpected third page: %#v", thirdPage.Data)
	}
	if thirdPage.NextCursor != nil {
		t.Fatal("expected final page without a cursor")
	}
}

func TestListUserPastEventsRejectsInvalidPagination(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")

	for _, path := range []string{
		"/api/events/past?limit=0",
		"/api/events/past?limit=not-a-number",
		"/api/events/past?cursor=not-a-cursor",
	} {
		response := env.doRequest(t, http.MethodGet, path, token, nil)
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d", path, response.StatusCode)
		}
		response.Body.Close()
	}
}
