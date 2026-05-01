package main

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestAdminAnalyticsSummaryEndpoint(t *testing.T) {
	env := setupAPITestEnv(t)

	noah, err := env.repo.GetUserByEmail(context.Background(), "noah@example.com")
	if err != nil {
		t.Fatalf("get requester user: %v", err)
	}

	avaToken := env.issueTokenForEmail(t, "ava@example.com")
	noahToken := env.issueTokenForEmail(t, "noah@example.com")
	today := time.Now().UTC().Format("2006-01-02")

	notFoundResp := env.doRequest(t, http.MethodGet, "/api/admin/analytics/missing", "", nil)
	if notFoundResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected missing analytics route to return 404, got %d", notFoundResp.StatusCode)
	}
	notFoundResp.Body.Close()

	createResp := env.doRequest(t, http.MethodPost, "/api/events", avaToken, CreateEventParams{
		Title:       "Backend Analytics Test",
		Location:    "Test Cafe",
		Time:        "18:30",
		EventDate:   today,
		Description: "Testing analytics summaries",
		Gender:      "anyone",
		MinAge:      20,
		MaxAge:      39,
		GroupType:   "Group",
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected event create status 201, got %d", createResp.StatusCode)
	}
	created := decodeJSON[createEventResponse](t, createResp)

	joinResp := env.doRequest(
		t,
		http.MethodPost,
		fmt.Sprintf("/api/events/%d/chat/requests", created.ID),
		noahToken,
		map[string]string{"message": "I can join"},
	)
	if joinResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected join request status 201, got %d", joinResp.StatusCode)
	}
	joinResp.Body.Close()

	approveResp := env.doRequest(
		t,
		http.MethodPost,
		fmt.Sprintf("/api/events/%d/chat/requests/%d/approve", created.ID, noah.ID),
		avaToken,
		nil,
	)
	if approveResp.StatusCode != http.StatusOK {
		t.Fatalf("expected approve status 200, got %d", approveResp.StatusCode)
	}
	approveResp.Body.Close()

	var conversationID int64
	if err := env.db.QueryRowContext(
		context.Background(),
		`SELECT id FROM conversations WHERE event_id = ? ORDER BY id ASC LIMIT 1`,
		created.ID,
	).Scan(&conversationID); err != nil {
		t.Fatalf("lookup event conversation: %v", err)
	}

	if _, err := env.repo.CreateMessage(context.Background(), CreateMessageParams{
		ConversationID: conversationID,
		SenderID:       noah.ID,
		Body:           "See you there",
		DeliveryStatus: "sent",
	}); err != nil {
		t.Fatalf("create event message: %v", err)
	}

	resp := env.doRequest(t, http.MethodGet, "/api/admin/analytics/summary?from="+today+"&to="+today, "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected analytics status 200, got %d", resp.StatusCode)
	}

	summary := decodeJSON[BackendAnalyticsSummary](t, resp)
	if summary.Events.Created < 1 {
		t.Fatalf("expected at least one created event, got %d", summary.Events.Created)
	}
	if summary.Joins.Approved < 1 {
		t.Fatalf("expected at least one approved join, got %d", summary.Joins.Approved)
	}
	if summary.Messages.TotalMessages < 1 {
		t.Fatalf("expected at least one event message, got %d", summary.Messages.TotalMessages)
	}
	if !summary.Joins.CancelledDeletedUnavailable {
		t.Fatal("expected cancelled/deleted join request counts to be marked unavailable")
	}
	if len(summary.APIRequestFailures) == 0 {
		t.Fatal("expected API failure stats to include the earlier missing-route request")
	}
}

func TestAdminAnalyticsSummaryDoesNotRequireAuthorization(t *testing.T) {
	env := setupAPITestEnv(t)

	resp := env.doRequest(t, http.MethodGet, "/api/admin/analytics/summary", "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}
