package main

import (
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

type HelpHandler struct {
	repo    *EventRepository
	signer  *tokenSigner
	limiter *anonymousHelpRateLimiter
	now     func() time.Time
}

func NewHelpHandler(repo *EventRepository, signer *tokenSigner) *HelpHandler {
	return &HelpHandler{
		repo:    repo,
		signer:  signer,
		limiter: newAnonymousHelpRateLimiter(5, 10*time.Minute),
		now:     time.Now,
	}
}

const (
	maxHelpMessageLength = 4000
	maxReplyEmailLength  = 254
)

type createHelpSubmissionRequest struct {
	Type              string  `json:"type" binding:"required,oneof=contact feedback"`
	Message           string  `json:"message" binding:"required"`
	UrgentSafetyIssue bool    `json:"urgent_safety_issue"`
	WantsReply        bool    `json:"wants_reply"`
	ReplyEmail        *string `json:"reply_email"`
}

func (h *HelpHandler) RegisterRoutes(api *gin.RouterGroup) {
	api.POST("/help-submissions", h.createHelpSubmission)
}

func (h *HelpHandler) createHelpSubmission(c *gin.Context) {
	var req createHelpSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	message := strings.TrimSpace(req.Message)
	if message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	if utf8.RuneCountInString(message) > maxHelpMessageLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message must be 4000 characters or fewer"})
		return
	}

	var replyEmail *string
	if req.ReplyEmail != nil {
		trimmed := strings.TrimSpace(*req.ReplyEmail)
		if trimmed != "" {
			if len(trimmed) > maxReplyEmailLength {
				c.JSON(http.StatusBadRequest, gin.H{"error": "reply_email is too long"})
				return
			}
			parsed, parseErr := mail.ParseAddress(trimmed)
			if parseErr != nil || parsed.Address != trimmed {
				c.JSON(http.StatusBadRequest, gin.H{"error": "reply_email must be a valid email address"})
				return
			}
			replyEmail = &parsed.Address
		}
	}
	if req.WantsReply && replyEmail == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reply_email is required when wants_reply is true"})
		return
	}

	userID, err := h.optionalUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	if userID == nil && !h.limiter.Allow(c.ClientIP(), h.now()) {
		c.Header("Retry-After", "600")
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many submissions, please try again later"})
		return
	}

	submission, err := h.repo.CreateHelpSubmission(c.Request.Context(), CreateHelpSubmissionParams{
		UserID:            userID,
		SubmissionType:    req.Type,
		Message:           message,
		UrgentSafetyIssue: req.Type == "contact" && req.UrgentSafetyIssue,
		WantsReply:        req.Type == "contact" && req.WantsReply,
		ReplyEmail:        replyEmail,
	})
	if err != nil {
		log.Printf("help submission: failed to create submission: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit help request"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"submission": submission})
}

func (h *HelpHandler) optionalUserID(c *gin.Context) (*int64, error) {
	token := bearerTokenFromHeader(c.GetHeader("Authorization"))
	if token == "" {
		return nil, nil
	}

	claims, err := h.signer.verify(token)
	if err != nil {
		return nil, errors.New("invalid or expired token")
	}

	if _, err := h.repo.GetUserByID(c.Request.Context(), claims.UserID); err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, errors.New("session expired, please sign in again")
		}
		log.Printf("help submission: failed to validate user %d: %v", claims.UserID, err)
		return nil, errors.New("failed to validate session")
	}

	return &claims.UserID, nil
}
