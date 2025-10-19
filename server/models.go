package main

import "time"

type Event struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	Title       string    `json:"title"`
	Location    string    `json:"location"`
	Time        string    `json:"time"`
	Description string    `json:"description"`
	Gender      string    `json:"gender"`
	MinAge      int       `json:"min_age"`
	MaxAge      int       `json:"max_age"`
	DateLabel   string    `json:"date_label"`
	HostName    string    `json:"host_name"`
	CreatedAt   time.Time `json:"created_at"`
}

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
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
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type ConversationEventMeta struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Location  string `json:"location"`
	Time      string `json:"time"`
	DateLabel string `json:"date_label"`
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
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	DecidedAt *time.Time `json:"decided_at,omitempty"`
	DecidedBy *int64     `json:"decided_by,omitempty"`
}

type CreateEventParams struct {
	Title       string `json:"title" binding:"required,min=1"`
	Location    string `json:"location" binding:"required,min=1"`
	Time        string `json:"time" binding:"required,min=1"`
	Description string `json:"description"`
	Gender      string `json:"gender" binding:"required,min=1"`
	MinAge      int    `json:"min_age" binding:"required,gte=0"`
	MaxAge      int    `json:"max_age" binding:"required,gte=0"`
	DateLabel   string `json:"date_label" binding:"required,oneof=Today Tmrw"`
	UserID      int64  `json:"user_id" binding:"required,gte=1"`
}

type UpdateEventParams struct {
	Title       string `json:"title" binding:"required,min=1"`
	Location    string `json:"location" binding:"required,min=1"`
	Time        string `json:"time" binding:"required,min=1"`
	Description string `json:"description"`
	Gender      string `json:"gender" binding:"required,min=1"`
	MinAge      int    `json:"min_age" binding:"required,gte=0"`
	MaxAge      int    `json:"max_age" binding:"required,gte=0"`
	DateLabel   string `json:"date_label" binding:"required,oneof=Today Tmrw"`
}
