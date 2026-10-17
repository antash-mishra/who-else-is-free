package main

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// The app marks a plan as requested only for "request_exists"; for
// "already_member" it refreshes membership instead (issue #217).
func TestJoinRequestConflictCodes(t *testing.T) {
	env := setupAPITestEnv(t)

	avaToken := env.issueTokenForEmail(t, "ava@example.com")
	noahToken := env.issueTokenForEmail(t, "noah@example.com")
	noah, err := env.repo.GetUserByEmail(context.Background(), "noah@example.com")
	if err != nil {
		t.Fatalf("get requester user: %v", err)
	}
	today := time.Now().UTC().Format("2006-01-02")

	createEvent := func(t *testing.T, groupType string) int64 {
		t.Helper()
		resp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, CreateEventParams{
			Title:       "Conflict codes " + groupType,
			Location:    "Test Cafe",
			Time:        "18:30",
			EventDate:   today,
			Description: "Testing join request conflicts",
			Gender:      "anyone",
			MinAge:      20,
			MaxAge:      39,
			GroupType:   groupType,
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected event create status 201, got %d", resp.StatusCode)
		}
		return decodeJSON[createEventResponse](t, resp).ID
	}

	requestJoin := func(t *testing.T, eventID int64, token string) *http.Response {
		t.Helper()
		return env.doRequest(
			t,
			http.MethodPost,
			fmt.Sprintf("/api/events/%d/chat/requests", eventID),
			token,
			map[string]string{"message": "Can I join?"},
		)
	}

	expectConflict := func(t *testing.T, resp *http.Response, wantCode string) {
		t.Helper()
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("expected 409, got %d", resp.StatusCode)
		}
		body := decodeJSON[map[string]string](t, resp)
		if body["code"] != wantCode {
			t.Fatalf("expected code %q, got %q (error %q)", wantCode, body["code"], body["error"])
		}
	}

	singleEventID := createEvent(t, "Single")
	groupEventID := createEvent(t, "Group")

	t.Run("host requesting their own plan is already a member", func(t *testing.T) {
		expectConflict(t, requestJoin(t, singleEventID, avaToken), "already_member")
		expectConflict(t, requestJoin(t, groupEventID, avaToken), "already_member")
	})

	t.Run("second request while one is pending already exists", func(t *testing.T) {
		resp := requestJoin(t, singleEventID, noahToken)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected first request status 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()
		expectConflict(t, requestJoin(t, singleEventID, noahToken), "request_exists")
	})

	t.Run("approved group member requesting again is already a member", func(t *testing.T) {
		resp := requestJoin(t, groupEventID, noahToken)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected request status 201, got %d", resp.StatusCode)
		}
		resp.Body.Close()

		approveResp := env.doRequest(
			t,
			http.MethodPost,
			fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", groupEventID, noah.ID),
			avaToken,
			nil,
		)
		if approveResp.StatusCode != http.StatusOK {
			t.Fatalf("expected approve status 200, got %d", approveResp.StatusCode)
		}
		approveResp.Body.Close()

		expectConflict(t, requestJoin(t, groupEventID, noahToken), "already_member")
	})
}
