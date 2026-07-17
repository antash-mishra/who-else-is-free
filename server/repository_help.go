package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

const adminHelpPriorityExpression = `CASE
    WHEN hs.status = 'new' AND hs.urgent_safety_issue = 1 THEN 0
    WHEN hs.status = 'new' THEN 1
    ELSE 2
END`

type AdminHelpSubmitter struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type AdminHelpSubmission struct {
	HelpSubmission
	Submitter *AdminHelpSubmitter `json:"submitter,omitempty"`
	SortRank  int                 `json:"-"`
}

type AdminHelpCursor struct {
	SortRank      int
	CreatedAtUnix int64
	ID            int64
}

type AdminHelpFilters struct {
	SubmissionType *string
	Status         *string
	Urgent         *bool
	Limit          int
	Cursor         *AdminHelpCursor
}

type AdminHelpPage struct {
	Submissions []AdminHelpSubmission
	NextCursor  *AdminHelpCursor
}

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

func (r *EventRepository) ListAdminHelpSubmissions(ctx context.Context, filters AdminHelpFilters) (AdminHelpPage, error) {
	limit := filters.Limit
	if limit <= 0 {
		limit = 25
	}

	var query strings.Builder
	query.WriteString(`
SELECT hs.id, hs.user_id, hs.submission_type, hs.message,
       hs.urgent_safety_issue, hs.wants_reply, hs.reply_email, hs.status, hs.created_at,
       u.id, u.name, u.email,
       ` + adminHelpPriorityExpression + ` AS sort_rank
FROM help_submissions hs
LEFT JOIN users u ON u.id = hs.user_id
WHERE 1 = 1`)

	args := make([]any, 0, 9)
	if filters.SubmissionType != nil {
		query.WriteString(" AND hs.submission_type = ?")
		args = append(args, *filters.SubmissionType)
	}
	if filters.Status != nil {
		query.WriteString(" AND hs.status = ?")
		args = append(args, *filters.Status)
	}
	if filters.Urgent != nil {
		query.WriteString(" AND hs.urgent_safety_issue = ?")
		args = append(args, boolToInt(*filters.Urgent))
	}
	if filters.Cursor != nil {
		query.WriteString(` AND (
            ` + adminHelpPriorityExpression + ` > ?
            OR (` + adminHelpPriorityExpression + ` = ? AND CAST(strftime('%s', hs.created_at) AS INTEGER) < ?)
            OR (` + adminHelpPriorityExpression + ` = ? AND CAST(strftime('%s', hs.created_at) AS INTEGER) = ? AND hs.id < ?)
        )`)
		args = append(
			args,
			filters.Cursor.SortRank,
			filters.Cursor.SortRank,
			filters.Cursor.CreatedAtUnix,
			filters.Cursor.SortRank,
			filters.Cursor.CreatedAtUnix,
			filters.Cursor.ID,
		)
	}
	query.WriteString(" ORDER BY sort_rank ASC, hs.created_at DESC, hs.id DESC LIMIT ?")
	args = append(args, limit+1)

	rows, err := r.db.QueryContext(ctx, query.String(), args...)
	if err != nil {
		return AdminHelpPage{}, fmt.Errorf("list admin help submissions: %w", err)
	}
	defer rows.Close()

	items := make([]AdminHelpSubmission, 0, limit+1)
	for rows.Next() {
		item, err := scanAdminHelpSubmission(rows)
		if err != nil {
			return AdminHelpPage{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return AdminHelpPage{}, fmt.Errorf("list admin help submissions rows: %w", err)
	}

	var next *AdminHelpCursor
	if len(items) > limit {
		lastVisible := items[limit-1]
		next = &AdminHelpCursor{
			SortRank:      lastVisible.SortRank,
			CreatedAtUnix: lastVisible.CreatedAt.Unix(),
			ID:            lastVisible.ID,
		}
		items = items[:limit]
	}
	return AdminHelpPage{Submissions: items, NextCursor: next}, nil
}

func (r *EventRepository) GetAdminHelpSubmission(ctx context.Context, id int64) (*AdminHelpSubmission, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT hs.id, hs.user_id, hs.submission_type, hs.message,
       hs.urgent_safety_issue, hs.wants_reply, hs.reply_email, hs.status, hs.created_at,
       u.id, u.name, u.email,
       `+adminHelpPriorityExpression+` AS sort_rank
FROM help_submissions hs
LEFT JOIN users u ON u.id = hs.user_id
WHERE hs.id = ?`, id)
	item, err := scanAdminHelpSubmission(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrHelpSubmissionNotFound
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *EventRepository) UpdateHelpSubmissionStatus(ctx context.Context, id int64, status string) (*AdminHelpSubmission, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE help_submissions SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return nil, fmt.Errorf("update help submission status: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("read help submission update result: %w", err)
	}
	if rowsAffected == 0 {
		return nil, ErrHelpSubmissionNotFound
	}
	return r.GetAdminHelpSubmission(ctx, id)
}

func scanAdminHelpSubmission(scanner interface{ Scan(dest ...any) error }) (AdminHelpSubmission, error) {
	var (
		item           AdminHelpSubmission
		userID         sql.NullInt64
		replyEmail     sql.NullString
		submitterID    sql.NullInt64
		submitterName  sql.NullString
		submitterEmail sql.NullString
		urgent         int
		wantsReply     int
	)
	if err := scanner.Scan(
		&item.ID,
		&userID,
		&item.SubmissionType,
		&item.Message,
		&urgent,
		&wantsReply,
		&replyEmail,
		&item.Status,
		&item.CreatedAt,
		&submitterID,
		&submitterName,
		&submitterEmail,
		&item.SortRank,
	); err != nil {
		return AdminHelpSubmission{}, err
	}
	if userID.Valid {
		value := userID.Int64
		item.UserID = &value
	}
	if replyEmail.Valid {
		value := replyEmail.String
		item.ReplyEmail = &value
	}
	item.UrgentSafetyIssue = urgent == 1
	item.WantsReply = wantsReply == 1
	if submitterID.Valid {
		item.Submitter = &AdminHelpSubmitter{
			ID:    submitterID.Int64,
			Name:  submitterName.String,
			Email: submitterEmail.String,
		}
	}
	return item, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
