package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const (
	defaultAdminHelpLimit = 25
	maxAdminHelpLimit     = 100
	adminHelpPreviewRunes = 180
)

type AdminHelpHandler struct {
	repo *EventRepository
}

func NewAdminHelpHandler(repo *EventRepository) *AdminHelpHandler {
	return &AdminHelpHandler{repo: repo}
}

func (h *AdminHelpHandler) RegisterRoutes(admin *gin.RouterGroup) {
	admin.GET("/help-submissions", h.list)
	admin.GET("/help-submissions/:id", h.detail)
	admin.PUT("/help-submissions/:id/status", h.updateStatus)
}

type adminHelpSubmitterView struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type adminHelpSubmissionView struct {
	ID                int64                   `json:"id"`
	SubmissionType    string                  `json:"submission_type"`
	Message           string                  `json:"message,omitempty"`
	MessagePreview    string                  `json:"message_preview,omitempty"`
	UrgentSafetyIssue bool                    `json:"urgent_safety_issue"`
	WantsReply        bool                    `json:"wants_reply"`
	ReplyEmail        *string                 `json:"reply_email,omitempty"`
	Status            string                  `json:"status"`
	CreatedAt         string                  `json:"created_at"`
	Submitter         *adminHelpSubmitterView `json:"submitter,omitempty"`
}

type listAdminHelpResponse struct {
	Submissions []adminHelpSubmissionView `json:"submissions"`
	NextCursor  *string                   `json:"next_cursor"`
}

type adminHelpDetailResponse struct {
	Submission adminHelpSubmissionView `json:"submission"`
}

type updateAdminHelpStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

func (h *AdminHelpHandler) list(c *gin.Context) {
	filters, err := parseAdminHelpFilters(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	page, err := h.repo.ListAdminHelpSubmissions(ctx, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list help submissions"})
		return
	}

	views := make([]adminHelpSubmissionView, 0, len(page.Submissions))
	for _, submission := range page.Submissions {
		views = append(views, toAdminHelpSubmissionView(submission, false))
	}
	var nextCursor *string
	if page.NextCursor != nil {
		encoded, err := encodeAdminHelpCursor(*page.NextCursor)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to paginate help submissions"})
			return
		}
		nextCursor = &encoded
	}
	c.JSON(http.StatusOK, listAdminHelpResponse{Submissions: views, NextCursor: nextCursor})
}

func (h *AdminHelpHandler) detail(c *gin.Context) {
	id, ok := parseHelpSubmissionID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	submission, err := h.repo.GetAdminHelpSubmission(ctx, id)
	if errors.Is(err, ErrHelpSubmissionNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "help submission not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load help submission"})
		return
	}
	c.JSON(http.StatusOK, adminHelpDetailResponse{Submission: toAdminHelpSubmissionView(*submission, true)})
}

func (h *AdminHelpHandler) updateStatus(c *gin.Context) {
	id, ok := parseHelpSubmissionID(c)
	if !ok {
		return
	}
	var req updateAdminHelpStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}
	status := strings.TrimSpace(req.Status)
	if !isHelpSubmissionStatus(status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be new, reviewed, or closed"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	submission, err := h.repo.UpdateHelpSubmissionStatus(ctx, id, status)
	if errors.Is(err, ErrHelpSubmissionNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "help submission not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update help submission"})
		return
	}
	c.JSON(http.StatusOK, adminHelpDetailResponse{Submission: toAdminHelpSubmissionView(*submission, true)})
}

func parseAdminHelpFilters(c *gin.Context) (AdminHelpFilters, error) {
	filters := AdminHelpFilters{Limit: defaultAdminHelpLimit}
	if value := strings.TrimSpace(c.Query("type")); value != "" {
		if value != "contact" && value != "feedback" {
			return filters, errors.New("type must be contact or feedback")
		}
		filters.SubmissionType = &value
	}
	if value := strings.TrimSpace(c.Query("status")); value != "" {
		if !isHelpSubmissionStatus(value) {
			return filters, errors.New("status must be new, reviewed, or closed")
		}
		filters.Status = &value
	}
	if value := strings.TrimSpace(c.Query("urgent")); value != "" {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return filters, errors.New("urgent must be true or false")
		}
		filters.Urgent = &parsed
	}
	if value := strings.TrimSpace(c.Query("limit")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			return filters, errors.New("limit must be a positive integer")
		}
		if parsed > maxAdminHelpLimit {
			parsed = maxAdminHelpLimit
		}
		filters.Limit = parsed
	}
	if value := strings.TrimSpace(c.Query("cursor")); value != "" {
		cursor, err := decodeAdminHelpCursor(value)
		if err != nil {
			return filters, errors.New("invalid cursor")
		}
		filters.Cursor = &cursor
	}
	return filters, nil
}

func parseHelpSubmissionID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid help submission id"})
		return 0, false
	}
	return id, true
}

func isHelpSubmissionStatus(status string) bool {
	return status == "new" || status == "reviewed" || status == "closed"
}

func toAdminHelpSubmissionView(submission AdminHelpSubmission, includeMessage bool) adminHelpSubmissionView {
	view := adminHelpSubmissionView{
		ID:                submission.ID,
		SubmissionType:    submission.SubmissionType,
		UrgentSafetyIssue: submission.UrgentSafetyIssue,
		WantsReply:        submission.WantsReply,
		ReplyEmail:        submission.ReplyEmail,
		Status:            submission.Status,
		CreatedAt:         submission.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if includeMessage {
		view.Message = submission.Message
	} else {
		view.MessagePreview = truncateRunes(submission.Message, adminHelpPreviewRunes)
	}
	if submission.Submitter != nil {
		view.Submitter = &adminHelpSubmitterView{
			ID:    submission.Submitter.ID,
			Name:  submission.Submitter.Name,
			Email: submission.Submitter.Email,
		}
	}
	return view
}

func truncateRunes(value string, max int) string {
	if utf8.RuneCountInString(value) <= max {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:max])) + "…"
}

func encodeAdminHelpCursor(cursor AdminHelpCursor) (string, error) {
	payload, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func decodeAdminHelpCursor(value string) (AdminHelpCursor, error) {
	var cursor AdminHelpCursor
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return cursor, err
	}
	if err := json.Unmarshal(payload, &cursor); err != nil {
		return cursor, err
	}
	if cursor.SortRank < 0 || cursor.SortRank > 2 || cursor.CreatedAtUnix <= 0 || cursor.ID <= 0 {
		return cursor, errors.New("invalid cursor values")
	}
	return cursor, nil
}
