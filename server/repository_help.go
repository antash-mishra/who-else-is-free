package main

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type CreateHelpSubmissionParams struct {
	UserID            *int64
	SubmissionType    string
	Message           string
	UrgentSafetyIssue bool
	WantsReply        bool
	ReplyEmail        *string
}

func (r *EventRepository) CreateHelpSubmission(ctx context.Context, params CreateHelpSubmissionParams) (*HelpSubmission, error) {
	var userID any
	if params.UserID != nil {
		userID = *params.UserID
	} else {
		userID = nil
	}

	var replyEmail sql.NullString
	if params.ReplyEmail != nil {
		replyEmail = sql.NullString{String: *params.ReplyEmail, Valid: true}
	}

	res, err := r.db.ExecContext(
		ctx,
		insertHelpSubmission,
		userID,
		params.SubmissionType,
		params.Message,
		boolToInt(params.UrgentSafetyIssue),
		boolToInt(params.WantsReply),
		replyEmail,
	)
	if err != nil {
		return nil, fmt.Errorf("insert help submission: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("fetch help submission id: %w", err)
	}

	return &HelpSubmission{
		ID:                id,
		UserID:            params.UserID,
		SubmissionType:    params.SubmissionType,
		Message:           params.Message,
		UrgentSafetyIssue: params.UrgentSafetyIssue,
		WantsReply:        params.WantsReply,
		ReplyEmail:        params.ReplyEmail,
		Status:            "new",
		CreatedAt:         time.Now(),
	}, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
