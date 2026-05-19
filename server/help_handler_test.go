package main

import (
	"context"
	"database/sql"
	"net/http"
	"testing"
)

type helpSubmissionResponse struct {
	Submission HelpSubmission `json:"submission"`
}

func TestCreateHelpSubmission(t *testing.T) {
	env := setupAPITestEnv(t)

	t.Run("creates authenticated contact submission", func(t *testing.T) {
		token := env.issueTokenForEmail(t, "ava@example.com")
		user, err := env.repo.GetUserByEmail(context.Background(), "ava@example.com")
		if err != nil {
			t.Fatalf("get user: %v", err)
		}

		resp := env.doRequest(t, http.MethodPost, "/api/help-submissions", token, map[string]any{
			"type":                "contact",
			"message":             "I need help with my account.",
			"urgent_safety_issue": true,
			"wants_reply":         true,
			"reply_email":         "ava@example.com",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}

		payload := decodeJSON[helpSubmissionResponse](t, resp)
		if payload.Submission.UserID == nil || *payload.Submission.UserID != user.ID {
			t.Fatalf("expected user_id %d, got %#v", user.ID, payload.Submission.UserID)
		}
		if payload.Submission.SubmissionType != "contact" {
			t.Fatalf("expected contact submission, got %q", payload.Submission.SubmissionType)
		}
		if !payload.Submission.UrgentSafetyIssue || !payload.Submission.WantsReply {
			t.Fatalf("expected contact flags to be persisted: %#v", payload.Submission)
		}
		if payload.Submission.ReplyEmail == nil || *payload.Submission.ReplyEmail != "ava@example.com" {
			t.Fatalf("expected reply email, got %#v", payload.Submission.ReplyEmail)
		}

		var storedEmail sql.NullString
		var urgent, wantsReply int
		if err := env.db.QueryRowContext(
			context.Background(),
			`SELECT reply_email, urgent_safety_issue, wants_reply FROM help_submissions WHERE id = ?`,
			payload.Submission.ID,
		).Scan(&storedEmail, &urgent, &wantsReply); err != nil {
			t.Fatalf("query stored help submission: %v", err)
		}
		if !storedEmail.Valid || storedEmail.String != "ava@example.com" || urgent != 1 || wantsReply != 1 {
			t.Fatalf("unexpected stored values email=%#v urgent=%d wants_reply=%d", storedEmail, urgent, wantsReply)
		}
	})

	t.Run("creates anonymous feedback submission", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodPost, "/api/help-submissions", "", map[string]any{
			"type":    "feedback",
			"message": "Add calendar sync.",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}

		payload := decodeJSON[helpSubmissionResponse](t, resp)
		if payload.Submission.UserID != nil {
			t.Fatalf("expected anonymous submission, got user_id %#v", payload.Submission.UserID)
		}
		if payload.Submission.SubmissionType != "feedback" {
			t.Fatalf("expected feedback submission, got %q", payload.Submission.SubmissionType)
		}
	})

	t.Run("requires reply email when reply requested", func(t *testing.T) {
		resp := env.doRequest(t, http.MethodPost, "/api/help-submissions", "", map[string]any{
			"type":        "contact",
			"message":     "Please reply.",
			"wants_reply": true,
		})
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})
}
