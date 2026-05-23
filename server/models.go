package main

import "time"

const defaultCoverKey = "badminton"

type Event struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	Title       string     `json:"title"`
	Location    string     `json:"location"`
	Time        string     `json:"time"`
	EventDate   string     `json:"event_date"`
	Description string     `json:"description"`
	Gender      string     `json:"gender"`
	MinAge      int        `json:"min_age"`
	MaxAge      int        `json:"max_age"`
	DateLabel   string     `json:"date_label"`
	GroupType   string     `json:"group_type"`
	CoverKey    string     `json:"cover_key"`
	HostName    string     `json:"host_name"`
	HostAvatar  *string    `json:"host_avatar,omitempty"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
	PlaceID     *string    `json:"place_id,omitempty"`
	Latitude    *float64   `json:"latitude,omitempty"`
	Longitude   *float64   `json:"longitude,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type User struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	Email           string    `json:"email"`
	Password        string    `json:"-"`
	Gender          *string   `json:"gender,omitempty"`
	Age             *int      `json:"age,omitempty"`
	Avatar          *string   `json:"avatar,omitempty"`
	ProfileComplete bool      `json:"profile_complete"`
	CreatedAt       time.Time `json:"created_at"`
}

type Conversation struct {
	ID        int64     `json:"id"`
	Title     *string   `json:"title,omitempty"`
	CreatedBy int64     `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	EventID   *int64    `json:"event_id,omitempty"`
}

type ConversationMember struct {
	ConversationID int64     `json:"conversation_id"`
	UserID         int64     `json:"user_id"`
	JoinedAt       time.Time `json:"joined_at"`
	Role           string    `json:"role"`
}

type Message struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversation_id"`
	SenderID       int64     `json:"sender_id"`
	Body           string    `json:"body"`
	AttachmentURL  *string   `json:"attachment_url,omitempty"`
	DeliveryStatus string    `json:"delivery_status"`
	CreatedAt      time.Time `json:"created_at"`
}

type ConversationSummary struct {
	Conversation
	MemberIDs    []int64                   `json:"member_ids"`
	Participants []ConversationParticipant `json:"participants"`
	Event        *ConversationEventMeta    `json:"event,omitempty"`
	LastMessage  *MessageSummary           `json:"last_message,omitempty"`
	UnreadCount  int                       `json:"unread_count"`
}

type CreateMessageParams struct {
	ConversationID int64
	SenderID       int64
	Body           string
	AttachmentURL  *string
	DeliveryStatus string
}

type ConversationParticipant struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	Avatar *string `json:"avatar,omitempty"`
}

type ConversationEventMeta struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	Title       string     `json:"title"`
	Location    string     `json:"location"`
	Time        string     `json:"time"`
	EventDate   string     `json:"event_date"`
	DateLabel   string     `json:"date_label"`
	GroupType   string     `json:"group_type"`
	CoverKey    string     `json:"cover_key"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
}

type MessageSummary struct {
	ID        int64     `json:"id"`
	SenderID  int64     `json:"sender_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

type ConversationJoinRequest struct {
	ID        int64      `json:"id"`
	EventID   int64      `json:"event_id"`
	UserID    int64      `json:"user_id"`
	Message   string     `json:"message"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	DecidedAt *time.Time `json:"decided_at,omitempty"`
	DecidedBy *int64     `json:"decided_by,omitempty"`
}

type JoinRequestView struct {
	ConversationJoinRequest
	Requester      ConversationParticipant `json:"requester"`
	ConversationID *int64                  `json:"conversation_id,omitempty"`
}

type EventReport struct {
	ID             int64      `json:"id"`
	EventID        int64      `json:"event_id"`
	UserID         int64      `json:"user_id"`
	ReportedUserID *int64     `json:"reported_user_id,omitempty"`
	Reason         string     `json:"reason"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	ReviewedAt     *time.Time `json:"reviewed_at,omitempty"`
	ReviewedBy     *int64     `json:"reviewed_by,omitempty"`
}

type HelpSubmission struct {
	ID                int64     `json:"id"`
	UserID            *int64    `json:"user_id,omitempty"`
	SubmissionType    string    `json:"submission_type"`
	Message           string    `json:"message"`
	UrgentSafetyIssue bool      `json:"urgent_safety_issue"`
	WantsReply        bool      `json:"wants_reply"`
	ReplyEmail        *string   `json:"reply_email,omitempty"`
	Status            string    `json:"status"`
	CreatedAt         time.Time `json:"created_at"`
}

type PushToken struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Token     string    `json:"token"`
	DeviceID  string    `json:"device_id"`
	Platform  string    `json:"platform"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateEventParams struct {
	Title       string  `json:"title" binding:"required,min=1"`
	Location    string  `json:"location" binding:"required,min=1"`
	Time        string  `json:"time" binding:"required,min=1"`
	EventDate   string  `json:"event_date" binding:"required,min=10"`
	Description string  `json:"description"`
	Gender      string  `json:"gender" binding:"required,min=1"`
	MinAge      int     `json:"min_age" binding:"required,gte=0"`
	MaxAge      int     `json:"max_age" binding:"required,gte=0"`
	DateLabel   string  `json:"date_label"` // accepted for backward compatibility, ignored by server
	GroupType   string  `json:"group_type" binding:"required,oneof=Single Group"`
	CoverKey    string  `json:"cover_key" binding:"omitempty,min=1"`
	ScheduledAt string  `json:"scheduled_at"` // ISO 8601 UTC timestamp
	PlaceID     string  `json:"place_id"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	UserID      int64   `json:"-"`
}

type UpdateEventParams struct {
	Title       string  `json:"title" binding:"required,min=1"`
	Location    string  `json:"location" binding:"required,min=1"`
	Time        string  `json:"time" binding:"required,min=1"`
	EventDate   string  `json:"event_date" binding:"required,min=10"`
	Description string  `json:"description"`
	Gender      string  `json:"gender" binding:"required,min=1"`
	MinAge      int     `json:"min_age" binding:"required,gte=0"`
	MaxAge      int     `json:"max_age" binding:"required,gte=0"`
	DateLabel   string  `json:"date_label"` // accepted for backward compatibility, ignored by server
	GroupType   string  `json:"group_type" binding:"required,oneof=Single Group"`
	CoverKey    *string `json:"cover_key" binding:"omitempty,min=1"`
	ScheduledAt string  `json:"scheduled_at"` // ISO 8601 UTC timestamp
	PlaceID     string  `json:"place_id"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
}
