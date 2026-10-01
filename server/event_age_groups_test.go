package main

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"testing"
	"time"
)

func TestEventAgeGroupsHTTP(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	body := map[string]any{"title": "Synthetic plan", "location": "Test place", "time": "12:00", "event_date": time.Now().AddDate(0, 0, 1).Format("2006-01-02"), "gender": "Any", "min_age": 20, "max_age": 60, "group_type": "Single", "age_group_ids": []string{"20-25", "40+"}}
	resp := env.doRequest(t, http.MethodPost, "/api/events", token, body)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d", resp.StatusCode)
	}
	created := decodeJSON[map[string]int64](t, resp)
	get := func() map[string]any {
		rows := decodeJSON[struct {
			Data []map[string]any `json:"data"`
		}](t, env.doRequest(t, http.MethodGet, "/api/events", "", nil))
		for _, row := range rows.Data {
			if row["id"] == float64(created["id"]) {
				return row
			}
		}
		t.Fatal("created event missing")
		return nil
	}
	expected := []any{map[string]any{"min": float64(20), "max": float64(25)}, map[string]any{"min": float64(40), "max": float64(60)}}
	if !reflect.DeepEqual(get()["age_ranges"], expected) {
		t.Fatalf("exact ranges lost: %v", get()["age_ranges"])
	}
	delete(body, "age_group_ids")
	body["title"] = "Updated synthetic plan"
	resp = env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", created["id"]), token, body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update: %d", resp.StatusCode)
	}
	resp.Body.Close()
	if !reflect.DeepEqual(get()["age_ranges"], expected) {
		t.Fatal("legacy edit lost exact ranges")
	}
	if err := env.repo.Init(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(get()["age_ranges"], expected) {
		t.Fatal("reopening lost ranges")
	}
	body["min_age"] = 30
	body["max_age"] = 35
	resp = env.doRequest(t, http.MethodPut, fmt.Sprintf("/api/events/%d", created["id"]), token, body)
	resp.Body.Close()
	if !reflect.DeepEqual(get()["age_ranges"], []any{map[string]any{"min": float64(30), "max": float64(35)}}) {
		t.Fatal("changed legacy range not applied")
	}
	for _, ids := range [][]string{{}, {"unknown"}, {"all", "20-25"}} {
		body["age_group_ids"] = ids
		resp = env.doRequest(t, http.MethodPost, "/api/events", token, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("invalid selection %v: %d", ids, resp.StatusCode)
		}
		resp.Body.Close()
	}
}

func TestAgeGroupUnionAndPastEvents(t *testing.T) {
	ids, ranges, err := normalizeAgeGroups(AgeGroupIDs{"25-30", "20-25", "20-25"})
	if err != nil || !reflect.DeepEqual(ids, AgeGroupIDs{"20-25", "25-30"}) || !reflect.DeepEqual(ranges, []AgeRange{{20, 30}}) {
		t.Fatal("overlapping selection not canonical")
	}
	env := setupAPITestEnv(t)
	id, err := env.repo.Create(context.Background(), CreateEventParams{UserID: 1, Title: "Synthetic past plan", Location: "Test", Time: "12:00", EventDate: "2020-01-01", Gender: "Any", MinAge: 20, MaxAge: 60, GroupType: "Single", AgeGroupIDs: AgeGroupIDs{"20-25", "40+"}})
	if err != nil {
		t.Fatal(err)
	}
	token := env.issueTokenForEmail(t, "ava@example.com")
	for _, path := range []string{"/api/events/past", "/api/events/past?limit=25"} {
		result := decodeJSON[struct {
			Data []map[string]any `json:"data"`
		}](t, env.doRequest(t, "GET", path, token, nil))
		if len(result.Data) != 1 || result.Data[0]["id"] != float64(id) || len(result.Data[0]["age_ranges"].([]any)) != 2 {
			t.Fatalf("past ranges missing at %s", path)
		}
	}
}
