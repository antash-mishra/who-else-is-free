package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"reflect"
	"testing"
	"time"
)

func insertPastPageEvent(t *testing.T, repo *EventRepository, owner int64, scheduled any, date, created string) int64 {
	t.Helper()
	result, err := repo.db.Exec(`INSERT INTO events
 (user_id,title,location,time,event_date,description,gender,min_age,max_age,date_label,group_type,cover_key,scheduled_at,created_at)
 VALUES (?, 'Past test plan', 'Park', '10:00', ?, 'Details', 'Any', 18, 60, 'Today', 'Group', ?, ?, ?)`,
		owner, date, defaultCoverKey, scheduled, created)
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func addPastPageMembership(t *testing.T, repo *EventRepository, eventID, hostID, memberID int64) {
	t.Helper()
	result, err := repo.db.Exec(`INSERT INTO conversations (title,created_by,event_id) VALUES ('Past chat',?,?)`, hostID, eventID)
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.db.Exec(`INSERT INTO conversation_members (conversation_id,user_id,role) VALUES (?,?,'member')`, id, memberID); err != nil {
		t.Fatal(err)
	}
}

func TestPastEventsPaginationStableTiesAndChanges(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	ids := []int64{}
	for i := 0; i < 5; i++ {
		ids = append(ids, insertPastPageEvent(t, repo, 1, "2020-01-02T10:00:00.123Z", "2020-01-02", "2020-01-01 10:00:00"))
	}
	page, err := repo.listUserPastEventsPage(ctx, 1, 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 2 || page.Data[0].ID != ids[4] || page.Data[1].ID != ids[3] || page.NextCursor == nil {
		t.Fatalf("first page: %+v", page)
	}
	cursor, err := decodePastEventsCursor(*page.NextCursor, 1)
	if err != nil {
		t.Fatal(err)
	}
	// Delete the boundary row and add a newer item between pages: neither shifts the cursor.
	if _, err := repo.db.Exec(`DELETE FROM events WHERE id=?`, ids[3]); err != nil {
		t.Fatal(err)
	}
	insertPastPageEvent(t, repo, 1, "2021-01-02T10:00:00Z", "2021-01-02", "2021-01-01 10:00:00")
	got := []int64{}
	for {
		page, err = repo.listUserPastEventsPage(ctx, 1, 2, &cursor)
		if err != nil {
			t.Fatal(err)
		}
		for _, event := range page.Data {
			got = append(got, event.ID)
		}
		if page.NextCursor == nil {
			break
		}
		cursor, err = decodePastEventsCursor(*page.NextCursor, 1)
		if err != nil {
			t.Fatal(err)
		}
	}
	if want := []int64{ids[2], ids[1], ids[0]}; !reflect.DeepEqual(got, want) {
		t.Fatalf("remaining IDs %v, want %v", got, want)
	}
}

func TestPastEventsPaginationMembershipDatesAndSnapshot(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	other, err := repo.CreateUserWithPassword(ctx, "Other", "other@example.test", "pw")
	if err != nil {
		t.Fatal(err)
	}
	legacy := insertPastPageEvent(t, repo, 1, nil, "2020-01-01", "2020-01-01 10:00:00")
	early := insertPastPageEvent(t, repo, other.ID, "2020-01-03T10:00:00+05:30", "2020-01-03", "2020-01-01 10:00:00")
	addPastPageMembership(t, repo, early, other.ID, 1)
	addPastPageMembership(t, repo, early, other.ID, 1)
	late := insertPastPageEvent(t, repo, 1, "2020-01-03T05:00:00Z", "2020-01-03", "2020-01-01 10:00:00")
	insertPastPageEvent(t, repo, other.ID, "2020-01-04T10:00:00Z", "2020-01-04", "2020-01-01 10:00:00") // unrelated
	insertPastPageEvent(t, repo, 1, "2099-01-01T10:00:00Z", "2099-01-01", "2020-01-01 10:00:00")        // future
	page, err := repo.listUserPastEventsPage(ctx, 1, 100, nil)
	if err != nil {
		t.Fatal(err)
	}
	got := []int64{}
	for _, event := range page.Data {
		got = append(got, event.ID)
	}
	if want := []int64{late, early, legacy}; !reflect.DeepEqual(got, want) {
		t.Fatalf("IDs %v, want %v", got, want)
	}
	if page.Data[1].ScheduledAt == nil || page.Data[1].ScheduledAt.Hour() != 4 {
		t.Fatal("offset schedule not normalized")
	}
	// A fixed cutoff excludes an event that has become past since the first page.
	cutoff := time.Now().UTC().Add(-time.Hour)
	insertPastPageEvent(t, repo, 1, cutoff.Add(30*time.Minute).Format(time.RFC3339), cutoff.Format("2006-01-02"), "2020-01-01 10:00:00")
	cursor := pastEventsCursor{Version: 1, UserID: 1, Snapshot: cutoff.Format(pastEventsCursorTimeLayout), Scheduled: "2099-01-01T00:00:00.000Z", Created: "2099-01-01T00:00:00.000Z", ID: 9999}
	page, err = repo.listUserPastEventsPage(ctx, 1, 100, &cursor)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 3 {
		t.Fatalf("cutoff page: %+v", page)
	}
	// Removing membership is effective immediately, even with an older cursor.
	if _, err := repo.db.Exec(`DELETE FROM conversation_members WHERE user_id=1`); err != nil {
		t.Fatal(err)
	}
	page, err = repo.listUserPastEventsPage(ctx, 1, 100, &cursor)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 2 {
		t.Fatal("revoked membership remained visible")
	}
}

func TestPastEventsPaginationHTTPContract(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()
	userID, err := env.repo.CreateUserWithPassword(ctx, "History", "history@example.test", "pw")
	if err != nil {
		t.Fatal(err)
	}
	token := env.issueTokenForEmail(t, "history@example.test")
	for i := 0; i < 101; i++ {
		insertPastPageEvent(t, env.repo, userID.ID, "2020-01-02T10:00:00Z", "2020-01-02", "2020-01-01 10:00:00")
	}
	resp := env.doRequest(t, http.MethodGet, "/api/events/past?limit=25", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatal(resp.StatusCode)
	}
	page := decodeJSON[pastEventsPage](t, resp)
	if len(page.Data) != 25 || page.NextCursor == nil {
		t.Fatalf("bounded page: %+v", page)
	}
	resp = env.doRequest(t, http.MethodGet, "/api/events/past?cursor="+url.QueryEscape(*page.NextCursor), token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatal(resp.StatusCode)
	}
	next := decodeJSON[pastEventsPage](t, resp)
	if len(next.Data) != 25 || next.Data[0].ID >= page.Data[24].ID {
		t.Fatalf("next page: %+v", next)
	}
	resp = env.doRequest(t, http.MethodGet, "/api/events/past?limit=100", token, nil)
	if got := decodeJSON[pastEventsPage](t, resp); len(got.Data) != 100 || got.NextCursor == nil {
		t.Fatal("maximum page not bounded")
	}
	resp = env.doRequest(t, http.MethodGet, "/api/events/past", token, nil)
	if got := decodeJSON[pastEventsPage](t, resp); len(got.Data) != 101 {
		t.Fatal("legacy client history truncated")
	}
	for _, path := range []string{"?limit=0", "?limit=101", "?limit=-1", "?limit=oops", "?limit=", "?cursor=oops", "?cursor="} {
		resp = env.doRequest(t, http.MethodGet, "/api/events/past"+path, token, nil)
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s status %d", path, resp.StatusCode)
		}
	}
	otherToken := env.issueTokenForEmail(t, "ava@example.com")
	resp = env.doRequest(t, http.MethodGet, "/api/events/past?cursor="+url.QueryEscape(*page.NextCursor), otherToken, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatal("cross-user cursor accepted")
	}
	resp = env.doRequest(t, http.MethodGet, "/api/events/past?limit=25", "", nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatal("unauthenticated request accepted")
	}
	resp = env.doRequest(t, http.MethodGet, "/api/events/past?limit=25", otherToken, nil)
	got := decodeJSON[pastEventsPage](t, resp)
	for _, event := range got.Data {
		if event.UserID == userID.ID {
			t.Fatal("another user's history leaked")
		}
	}
	if err := env.repo.Init(ctx); err != nil {
		t.Fatal(fmt.Errorf("idempotent indexes: %w", err))
	}
}
