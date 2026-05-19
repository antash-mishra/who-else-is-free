package main

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type HelpHandler struct {
	repo   *EventRepository
	signer *tokenSigner
}

func NewHelpHandler(repo *EventRepository, signer *tokenSigner) *HelpHandler {
	return &HelpHandler{repo: repo, signer: signer}
}

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

	var replyEmail *string
	if req.ReplyEmail != nil {
		trimmed := strings.TrimSpace(*req.ReplyEmail)
		if trimmed != "" {
			replyEmail = &trimmed
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
