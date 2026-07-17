package main

import (
	"context"
	"net/http"
	"strconv"
	"testing"
)

func TestAdminAccessAndHelpSubmissions(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()

	admin, err := env.repo.GetUserByEmail(ctx, "ava@example.com")
	if err != nil {
		t.Fatalf("get admin user: %v", err)
	}
	nonAdmin, err := env.repo.GetUserByEmail(ctx, "noah@example.com")
	if err != nil {
		t.Fatalf("get non-admin user: %v", err)
	}
	if err := env.repo.GrantAdmin(ctx, admin.ID, nil); err != nil {
		t.Fatalf("grant admin: %v", err)
	}

	adminToken := env.issueTokenForEmail(t, admin.Email)
	nonAdminToken := env.issueTokenForEmail(t, nonAdmin.Email)

	unauthorized := env.doRequest(t, http.MethodGet, "/api/admin/help-submissions", "", nil)
	if unauthorized.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated list to return 401, got %d", unauthorized.StatusCode)
	}
	unauthorized.Body.Close()

	forbidden := env.doRequest(t, http.MethodGet, "/api/admin/help-submissions", nonAdminToken, nil)
	if forbidden.StatusCode != http.StatusForbidden {
		t.Fatalf("expected non-admin list to return 403, got %d", forbidden.StatusCode)
	}
	forbidden.Body.Close()

	nonAdminAccess := env.doRequest(t, http.MethodGet, "/api/admin-access", nonAdminToken, nil)
	nonAdminPayload := decodeJSON[struct {
		IsAdmin bool `json:"is_admin"`
	}](t, nonAdminAccess)
	if nonAdminPayload.IsAdmin {
		t.Fatal("expected non-admin access response to be false")
	}

	adminAccess := env.doRequest(t, http.MethodGet, "/api/admin-access", adminToken, nil)
	adminPayload := decodeJSON[struct {
		IsAdmin bool `json:"is_admin"`
	}](t, adminAccess)
	if !adminPayload.IsAdmin {
		t.Fatal("expected admin access response to be true")
	}

	feedback, err := env.repo.CreateHelpSubmission(ctx, CreateHelpSubmissionParams{
		SubmissionType: "feedback",
		Message:        "Please add calendar sync.",
	})
	if err != nil {
		t.Fatalf("create feedback: %v", err)
	}
	replyEmail := "noah@example.com"
	contact, err := env.repo.CreateHelpSubmission(ctx, CreateHelpSubmissionParams{
		UserID:            &nonAdmin.ID,
		SubmissionType:    "contact",
		Message:           "I need urgent account help.",
		UrgentSafetyIssue: true,
		WantsReply:        true,
		ReplyEmail:        &replyEmail,
	})
	if err != nil {
		t.Fatalf("create contact: %v", err)
	}

	listResp := env.doRequest(t, http.MethodGet, "/api/admin/help-submissions?limit=1", adminToken, nil)
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("expected list 200, got %d", listResp.StatusCode)
	}
	firstPage := decodeJSON[listAdminHelpResponse](t, listResp)
	if len(firstPage.Submissions) != 1 || firstPage.Submissions[0].ID != contact.ID {
		t.Fatalf("expected urgent contact first, got %#v", firstPage.Submissions)
	}
	if firstPage.Submissions[0].Submitter == nil || firstPage.Submissions[0].Submitter.Email != nonAdmin.Email {
		t.Fatalf("expected submitter identity, got %#v", firstPage.Submissions[0].Submitter)
	}
	if firstPage.NextCursor == nil {
		t.Fatal("expected next cursor")
	}

	secondResp := env.doRequest(t, http.MethodGet, "/api/admin/help-submissions?limit=1&cursor="+*firstPage.NextCursor, adminToken, nil)
	secondPage := decodeJSON[listAdminHelpResponse](t, secondResp)
	if len(secondPage.Submissions) != 1 || secondPage.Submissions[0].ID != feedback.ID {
		t.Fatalf("expected feedback on second page, got %#v", secondPage.Submissions)
	}
	if secondPage.Submissions[0].Submitter != nil {
		t.Fatalf("expected anonymous feedback submitter to be nil, got %#v", secondPage.Submissions[0].Submitter)
	}

	detailResp := env.doRequest(t, http.MethodGet, "/api/admin/help-submissions/"+formatInt64(contact.ID), adminToken, nil)
	detail := decodeJSON[adminHelpDetailResponse](t, detailResp)
	if detail.Submission.Message != "I need urgent account help." {
		t.Fatalf("unexpected detail message %q", detail.Submission.Message)
	}

	updateResp := env.doRequest(t, http.MethodPut, "/api/admin/help-submissions/"+formatInt64(contact.ID)+"/status", adminToken, map[string]string{"status": "reviewed"})
	updated := decodeJSON[adminHelpDetailResponse](t, updateResp)
	if updated.Submission.Status != "reviewed" {
		t.Fatalf("expected reviewed status, got %q", updated.Submission.Status)
	}

	filterResp := env.doRequest(t, http.MethodGet, "/api/admin/help-submissions?type=feedback&status=new", adminToken, nil)
	filtered := decodeJSON[listAdminHelpResponse](t, filterResp)
	if len(filtered.Submissions) != 1 || filtered.Submissions[0].ID != feedback.ID {
		t.Fatalf("unexpected filtered submissions: %#v", filtered.Submissions)
	}
}

func TestBootstrapAdminsPersistsUserIDGrant(t *testing.T) {
	env := setupAPITestEnv(t)
	ctx := context.Background()
	user, err := env.repo.GetUserByEmail(ctx, "ava@example.com")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}

	granted, err := env.repo.BootstrapAdmins(ctx, []string{"ava@example.com", "missing@example.com"})
	if err != nil {
		t.Fatalf("bootstrap admins: %v", err)
	}
	if granted != 1 {
		t.Fatalf("expected one new grant, got %d", granted)
	}
	isAdmin, err := env.repo.IsAdmin(ctx, user.ID)
	if err != nil {
		t.Fatalf("check admin: %v", err)
	}
	if !isAdmin {
		t.Fatal("expected persisted user ID grant")
	}
}

func formatInt64(value int64) string {
	return strconv.FormatInt(value, 10)
}
