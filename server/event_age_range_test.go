package main

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestContinuousAgeRangeHTTP(t *testing.T) {
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	body := map[string]any{"title": "Range plan", "location": "Test park", "time": "12:00", "event_date": time.Now().AddDate(0, 0, 1).Format("2006-01-02"), "gender": "Any", "min_age": 18, "max_age": 60, "group_type": "Group", "age_group_ids": []string{"20-25", "40+"}}
	resp := env.doRequest(t, http.MethodPost, "/api/events", token, body)
	if resp.StatusCode != 201 {
		t.Fatalf("create: %d", resp.StatusCode)
	}
	created := decodeJSON[map[string]int64](t, resp)
	path := fmt.Sprintf("/api/events/%d", created["id"])
	// Same envelope still explicitly replaces the separated union.
	delete(body, "age_group_ids")
	body["min_age"] = 20
	body["age_selection_mode"] = "range"
	resp = env.doRequest(t, http.MethodPut, path, token, body)
	if resp.StatusCode != 200 {
		t.Fatalf("range replacement: %d", resp.StatusCode)
	}
	resp.Body.Close()
	get := func() Event {
		return decodeJSON[struct {
			Data Event `json:"data"`
		}](t, env.doRequest(t, http.MethodGet, path, token, nil)).Data
	}
	check := func(mode string, min, max int) {
		t.Helper()
		e := get()
		if e.AgeSelectionMode != mode || e.MinAge != min || e.MaxAge != max || e.AgeGroupIDs != nil {
			t.Fatalf("unexpected persisted age: %+v", e)
		}
	}
	check("range", 20, 60)
	if err := env.repo.Init(context.Background()); err != nil {
		t.Fatal(err)
	}
	check("range", 20, 60)
	// Old clients do not strip the mode on unrelated changes.
	delete(body, "age_selection_mode")
	body["title"] = "Old client edit"
	resp = env.doRequest(t, http.MethodPut, path, token, body)
	if resp.StatusCode != 200 {
		t.Fatal(resp.StatusCode)
	}
	resp.Body.Close()
	check("range", 20, 60)
	// But a changed legacy audience returns to legacy semantics.
	body["max_age"] = 25
	resp = env.doRequest(t, http.MethodPut, path, token, body)
	if resp.StatusCode != 200 {
		t.Fatal(resp.StatusCode)
	}
	resp.Body.Close()
	check("", 20, 25)
	for _, r := range [][2]int{{18, 99}, {24, 99}, {20, 60}, {40, 45}} {
		body["age_selection_mode"] = "range"
		body["min_age"] = r[0]
		body["max_age"] = r[1]
		resp = env.doRequest(t, http.MethodPut, path, token, body)
		if resp.StatusCode != 200 {
			t.Fatalf("valid range %v: %d", r, resp.StatusCode)
		}
		resp.Body.Close()
		check("range", r[0], r[1])
	}
	for _, r := range [][2]int{{17, 99}, {18, 100}, {40, 44}, {45, 40}} {
		body["min_age"] = r[0]
		body["max_age"] = r[1]
		for _, method := range []string{http.MethodPost, http.MethodPut} {
			endpoint := "/api/events"
			if method == http.MethodPut {
				endpoint = path
			}
			resp = env.doRequest(t, method, endpoint, token, body)
			if resp.StatusCode != 400 {
				t.Fatalf("invalid range %v: %d", r, resp.StatusCode)
			}
			resp.Body.Close()
		}
	}
	body["min_age"] = 18
	body["max_age"] = 99
	body["age_group_ids"] = []string{"all"}
	resp = env.doRequest(t, http.MethodPost, "/api/events", token, body)
	if resp.StatusCode != 400 {
		t.Fatal("contradictory groups accepted")
	}
	resp.Body.Close()
	body["age_selection_mode"] = "unknown"
	delete(body, "age_group_ids")
	resp = env.doRequest(t, http.MethodPost, "/api/events", token, body)
	if resp.StatusCode != 400 {
		t.Fatal("unknown mode accepted")
	}
	resp.Body.Close()
}
