package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

const createTableUsers = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

const createTableEvents = `
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    description TEXT,
    gender TEXT NOT NULL,
    min_age INTEGER NOT NULL,
    max_age INTEGER NOT NULL,
    date_label TEXT NOT NULL CHECK(date_label IN ('Today', 'Tmrw')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (min_age >= 0),
    CHECK (max_age >= min_age)
);
`

// Schema migrations are kept inline so startup handles SQLite setup.
const createTableConversations = `
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
`

const createTableConversationMembers = `
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`

const createTableMessages = `
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    attachment_url TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'sent',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
);
`

const createMessagesIndex = `
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
ON messages (conversation_id, created_at DESC);
`

const createTableConversationReadState = `
CREATE TABLE IF NOT EXISTS conversation_read_state (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_message_id INTEGER NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`

const insertEvent = `
INSERT INTO events (title, location, time, description, gender, min_age, max_age, date_label)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`

const insertUser = `
INSERT INTO users (name, email, password)
VALUES (?, ?, ?);
`

const insertConversation = `
INSERT INTO conversations (title, created_by)
VALUES (?, ?);
`

const insertConversationMember = `
INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role)
VALUES (?, ?, ?);
`

const insertMessage = `
INSERT INTO messages (conversation_id, sender_id, body, attachment_url, delivery_status)
VALUES (?, ?, ?, ?, ?)
RETURNING id, conversation_id, sender_id, body, attachment_url, delivery_status, created_at;
`

const upsertReadState = `
INSERT INTO conversation_read_state (conversation_id, user_id, last_read_message_id, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(conversation_id, user_id)
DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = CURRENT_TIMESTAMP;
`

const selectConversationsForUser = `
SELECT c.id, c.title, c.created_by, c.created_at
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE cm.user_id = ?
ORDER BY c.created_at DESC;
`

const selectMembersForConversation = `
SELECT user_id
FROM conversation_members
WHERE conversation_id = ?;
`

const selectParticipantsForConversation = `
SELECT cm.user_id, u.name
FROM conversation_members cm
JOIN users u ON u.id = cm.user_id
WHERE cm.conversation_id = ?
ORDER BY cm.joined_at ASC;
`

const selectMessagesForConversation = `
SELECT id, conversation_id, sender_id, body, attachment_url, delivery_status, created_at
FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?;
`

const selectLatestMessageForConversation = `
SELECT id, conversation_id, sender_id, body, attachment_url, delivery_status, created_at
FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC
LIMIT 1;
`

const checkConversationMembership = `
SELECT 1
FROM conversation_members
WHERE conversation_id = ? AND user_id = ?
LIMIT 1;
`

const selectEvents = `
SELECT id, title, location, time, description, gender, min_age, max_age, date_label, created_at
FROM events
ORDER BY created_at DESC;
`

const countEvents = `
SELECT COUNT(1)
FROM events;
`

const countUsers = `
SELECT COUNT(1)
FROM users;
`

const countConversations = `
SELECT COUNT(1)
FROM conversations;
`

const selectAllUsers = `
SELECT id, name
FROM users;
`

const selectUserByEmail = `
SELECT id, name, email, password, created_at
FROM users
WHERE email = ?;
`

type EventRepository struct {
	db *sql.DB
}

func NewEventRepository(db *sql.DB) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) Init(ctx context.Context) error {
    // Run idempotent migrations on startup so the server can launch without external tooling.
	if _, err := r.db.ExecContext(ctx, createTableUsers); err != nil {
		return fmt.Errorf("create users table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableEvents); err != nil {
		return fmt.Errorf("create events table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableConversations); err != nil {
		return fmt.Errorf("create conversations table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableConversationMembers); err != nil {
		return fmt.Errorf("create conversation members table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableMessages); err != nil {
		return fmt.Errorf("create messages table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createMessagesIndex); err != nil {
		return fmt.Errorf("create messages index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableConversationReadState); err != nil {
		return fmt.Errorf("create conversation read state table: %w", err)
	}
	return nil
}

func (r *EventRepository) Create(ctx context.Context, params CreateEventParams) (int64, error) {
	res, err := r.db.ExecContext(ctx, insertEvent,
		params.Title,
		params.Location,
		params.Time,
		params.Description,
		params.Gender,
		params.MinAge,
		params.MaxAge,
		params.DateLabel,
	)
	if err != nil {
		return 0, fmt.Errorf("insert event: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("fetch event id: %w", err)
	}

	return id, nil
}

func (r *EventRepository) List(ctx context.Context) ([]Event, error) {
	rows, err := r.db.QueryContext(ctx, selectEvents)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	var events []Event

	for rows.Next() {
		var evt Event
		if err := rows.Scan(
			&evt.ID,
			&evt.Title,
			&evt.Location,
			&evt.Time,
			&evt.Description,
			&evt.Gender,
			&evt.MinAge,
			&evt.MaxAge,
			&evt.DateLabel,
			&evt.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, evt)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	return events, nil
}

// CreateConversation creates a new conversation and ensures the creator is a member.
func (r *EventRepository) CreateConversation(ctx context.Context, title *string, createdBy int64, memberIDs []int64) (*Conversation, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin conversation tx: %w", err)
	}

	role := "owner"
	var nullableTitle sql.NullString
	if title != nil {
		nullableTitle = sql.NullString{String: *title, Valid: true}
	}

	res, err := tx.ExecContext(ctx, insertConversation, nullableTitle, createdBy)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert conversation: %w", err)
	}

	convoID, err := res.LastInsertId()
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("fetch conversation id: %w", err)
	}

	// ensure creator is in the member list
	creatorIncluded := false
	for _, memberID := range memberIDs {
		if memberID == createdBy {
			creatorIncluded = true
			break
		}
	}
	if !creatorIncluded {
		memberIDs = append(memberIDs, createdBy)
	}

	for _, memberID := range memberIDs {
		memberRole := "member"
		if memberID == createdBy {
			memberRole = role
		}
		if _, err := tx.ExecContext(ctx, insertConversationMember, convoID, memberID, memberRole); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("insert conversation member: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit conversation: %w", err)
	}

	conversation := &Conversation{ID: convoID, CreatedBy: createdBy}
	if nullableTitle.Valid {
		value := nullableTitle.String
		conversation.Title = &value
	}

	row := r.db.QueryRowContext(ctx, "SELECT created_at FROM conversations WHERE id = ?", convoID)
	if err := row.Scan(&conversation.CreatedAt); err != nil {
		return nil, fmt.Errorf("fetch conversation created_at: %w", err)
	}

	return conversation, nil
}

// ListConversations returns all conversations visible to the user, hydrated with participants and unread counts.
func (r *EventRepository) ListConversations(ctx context.Context, userID int64) ([]ConversationSummary, error) {
	rows, err := r.db.QueryContext(ctx, selectConversationsForUser, userID)
	if err != nil {
		return nil, fmt.Errorf("list conversations: %w", err)
	}

	var conversations []Conversation
	for rows.Next() {
		var convo Conversation
		var title sql.NullString
		if err := rows.Scan(&convo.ID, &title, &convo.CreatedBy, &convo.CreatedAt); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan conversation: %w", err)
		}
		if title.Valid {
			value := title.String
			convo.Title = &value
		}
		conversations = append(conversations, convo)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterate conversations: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close conversations rows: %w", err)
	}

	summaries := make([]ConversationSummary, 0, len(conversations))
	for _, convo := range conversations {
		summary, err := r.hydrateConversationSummary(ctx, convo, userID)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, summary)
	}

	return summaries, nil
}

// ListMessages paginates messages for a given conversation.
func (r *EventRepository) ListMessages(ctx context.Context, conversationID int64, limit, offset int) ([]Message, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := r.db.QueryContext(ctx, selectMessagesForConversation, conversationID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		var attachment sql.NullString
		if err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &attachment, &msg.DeliveryStatus, &msg.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		if attachment.Valid {
			msg.AttachmentURL = &attachment.String
		}
		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate messages: %w", err)
	}

	return messages, nil
}

// CreateMessage stores a new message and returns the saved row for broadcasting.
func (r *EventRepository) CreateMessage(ctx context.Context, params CreateMessageParams) (*Message, error) {
	attachment := sql.NullString{}
	if params.AttachmentURL != nil {
		attachment = sql.NullString{String: *params.AttachmentURL, Valid: true}
	}

	var msg Message
	row := r.db.QueryRowContext(ctx, insertMessage, params.ConversationID, params.SenderID, params.Body, attachment, params.DeliveryStatus)
	var attachmentOut sql.NullString
	if err := row.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &attachmentOut, &msg.DeliveryStatus, &msg.CreatedAt); err != nil {
		return nil, fmt.Errorf("insert message: %w", err)
	}
	if attachmentOut.Valid {
		msg.AttachmentURL = &attachmentOut.String
	}
	return &msg, nil
}

// hydrateConversationSummary enriches a conversation with participant info and unread counts for the viewer.
func (r *EventRepository) hydrateConversationSummary(ctx context.Context, convo Conversation, viewerID int64) (ConversationSummary, error) {
	participants, memberIDs, err := r.fetchConversationParticipants(ctx, convo.ID)
	if err != nil {
		return ConversationSummary{}, err
	}

	lastMessage, err := r.fetchLatestMessage(ctx, convo.ID)
	if err != nil {
		return ConversationSummary{}, err
	}

	unreadCount, err := r.countUnreadMessages(ctx, convo.ID, viewerID, lastMessage)
	if err != nil {
		return ConversationSummary{}, err
	}

	summary := ConversationSummary{
		Conversation: convo,
		MemberIDs:    memberIDs,
		Participants: participants,
		UnreadCount:  unreadCount,
	}
	if lastMessage != nil {
		summary.LastMessage = lastMessage
	}
	return summary, nil
}

// fetchConversationParticipants returns the members of a conversation plus their IDs for fast lookup.
func (r *EventRepository) fetchConversationParticipants(ctx context.Context, conversationID int64) ([]ConversationParticipant, []int64, error) {
	rows, err := r.db.QueryContext(ctx, selectParticipantsForConversation, conversationID)
	if err != nil {
		return nil, nil, fmt.Errorf("list conversation participants: %w", err)
	}
	defer rows.Close()

	var participants []ConversationParticipant
	var memberIDs []int64
	for rows.Next() {
		var participant ConversationParticipant
		if err := rows.Scan(&participant.ID, &participant.Name); err != nil {
			return nil, nil, fmt.Errorf("scan conversation participant: %w", err)
		}
		participants = append(participants, participant)
		memberIDs = append(memberIDs, participant.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate conversation participants: %w", err)
	}

	return participants, memberIDs, nil
}

// fetchLatestMessage grabs the newest message so we can show previews/unread counts.
func (r *EventRepository) fetchLatestMessage(ctx context.Context, conversationID int64) (*MessageSummary, error) {
	row := r.db.QueryRowContext(ctx, selectLatestMessageForConversation, conversationID)

	var msg Message
	var attachment sql.NullString
	if err := row.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &attachment, &msg.DeliveryStatus, &msg.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("fetch latest message: %w", err)
	}

	summary := &MessageSummary{
		ID:        msg.ID,
		SenderID:  msg.SenderID,
		Body:      msg.Body,
		CreatedAt: msg.CreatedAt,
	}

	return summary, nil
}

// countUnreadMessages uses the stored read cursor to compute unread totals.
func (r *EventRepository) countUnreadMessages(ctx context.Context, conversationID, userID int64, lastMessage *MessageSummary) (int, error) {
	if lastMessage == nil {
		return 0, nil
	}

	var lastReadID sql.NullInt64
	err := r.db.QueryRowContext(ctx, "SELECT last_read_message_id FROM conversation_read_state WHERE conversation_id = ? AND user_id = ?", conversationID, userID).Scan(&lastReadID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("fetch read cursor: %w", err)
	}

	if lastReadID.Valid && lastReadID.Int64 >= lastMessage.ID {
		return 0, nil
	}

	var count int
	query := "SELECT COUNT(1) FROM messages WHERE conversation_id = ? AND id > ?"
	threshold := int64(0)
	if lastReadID.Valid {
		threshold = lastReadID.Int64
	}
	if err := r.db.QueryRowContext(ctx, query, conversationID, threshold).Scan(&count); err != nil {
		return 0, fmt.Errorf("count unread messages: %w", err)
	}

	return count, nil
}

// UpdateReadState advances a user's read cursor for a conversation.
func (r *EventRepository) UpdateReadState(ctx context.Context, conversationID, userID, lastReadMessageID int64) error {
	if lastReadMessageID <= 0 {
		return nil
	}
	if _, err := r.db.ExecContext(ctx, upsertReadState, conversationID, userID, lastReadMessageID); err != nil {
		return fmt.Errorf("update read state: %w", err)
	}
	return nil
}

func (r *EventRepository) IsConversationMember(ctx context.Context, conversationID, userID int64) (bool, error) {
	var exists int
	if err := r.db.QueryRowContext(ctx, checkConversationMembership, conversationID, userID).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("check conversation membership: %w", err)
	}
	return true, nil
}

var seedEvents = []CreateEventParams{
	{
		Title:       "Running Buddy",
		Location:    "Phoenix Park",
		Time:        "09:00",
		Description: "Morning run followed by coffee.",
		Gender:      "Any",
		MinAge:      20,
		MaxAge:      30,
		DateLabel:   "Today",
	},
	{
		Title:       "Live Music Night",
		Location:    "Workmans Club",
		Time:        "20:00",
		Description: "Indie bands and craft beers.",
		Gender:      "Female",
		MinAge:      22,
		MaxAge:      32,
		DateLabel:   "Today",
	},
	{
		Title:       "Trail Hike",
		Location:    "Howth Cliffs",
		Time:        "10:00",
		Description: "Scenic hike with lunch after.",
		Gender:      "Any",
		MinAge:      18,
		MaxAge:      40,
		DateLabel:   "Tmrw",
	},
}

func (r *EventRepository) EnsureSeedData(ctx context.Context) error {
	if err := r.ensureSeedUsers(ctx); err != nil {
		return err
	}
	if err := r.ensureSeedEvents(ctx); err != nil {
		return err
	}
	return r.ensureSeedConversations(ctx)
}

type seedUser struct {
	Name     string
	Email    string
	Password string
}

var seedUsers = []seedUser{
	{
		Name:     "Ava Johnson",
		Email:    "ava@example.com",
		Password: "password123",
	},
	{
		Name:     "Liam Patel",
		Email:    "liam@example.com",
		Password: "welcome123",
	},
	{
		Name:     "Sophia Chen",
		Email:    "sophia@example.com",
		Password: "secret123",
	},
}

func (r *EventRepository) ensureSeedUsers(ctx context.Context) error {
	var count int
	if err := r.db.QueryRowContext(ctx, countUsers).Scan(&count); err != nil {
		return fmt.Errorf("count users: %w", err)
	}

	if count > 0 {
		return nil
	}

	for _, user := range seedUsers {
		if _, err := r.db.ExecContext(ctx, insertUser, user.Name, user.Email, user.Password); err != nil {
			return fmt.Errorf("seed user %q: %w", user.Email, err)
		}
	}

	return nil
}

func (r *EventRepository) ensureSeedEvents(ctx context.Context) error {
	var count int
	if err := r.db.QueryRowContext(ctx, countEvents).Scan(&count); err != nil {
		return fmt.Errorf("count events: %w", err)
	}

	if count > 0 {
		return nil
	}

	for _, evt := range seedEvents {
		if _, err := r.Create(ctx, evt); err != nil {
			return fmt.Errorf("seed event %q: %w", evt.Title, err)
		}
	}

	return nil
}

func (r *EventRepository) ensureSeedConversations(ctx context.Context) error {
	var count int
	if err := r.db.QueryRowContext(ctx, countConversations).Scan(&count); err != nil {
		return fmt.Errorf("count conversations: %w", err)
	}

	if count > 0 {
		return nil
	}

	rows, err := r.db.QueryContext(ctx, selectAllUsers)
	if err != nil {
		return fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	type seedUserRecord struct {
		ID   int64
		Name string
	}

	var users []seedUserRecord
	for rows.Next() {
		var record seedUserRecord
		if err := rows.Scan(&record.ID, &record.Name); err != nil {
			return fmt.Errorf("scan user: %w", err)
		}
		users = append(users, record)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate users: %w", err)
	}

	if len(users) < 2 {
		return nil
	}

	sampleMessages := []string{
		"Hey there! Want to sync up later?",
		"Looking forward to catching up soon.",
		"Should we plan something fun tonight?",
	}

	msgIndex := 0
	for i := 0; i < len(users); i++ {
		for j := i + 1; j < len(users); j++ {
			pair := []int64{users[i].ID, users[j].ID}
			convo, err := r.CreateConversation(ctx, nil, users[i].ID, pair)
			if err != nil {
				return fmt.Errorf("seed direct conversation: %w", err)
			}

			intro := sampleMessages[msgIndex%len(sampleMessages)]
			msgIndex++
			if _, err = r.CreateMessage(ctx, CreateMessageParams{
				ConversationID: convo.ID,
				SenderID:       users[i].ID,
				Body:           intro,
				DeliveryStatus: "sent",
			}); err != nil {
				return fmt.Errorf("seed conversation message: %w", err)
			}

			reply := fmt.Sprintf("Hi %s! Count me in.", users[i].Name)
			replyMsg, err := r.CreateMessage(ctx, CreateMessageParams{
				ConversationID: convo.ID,
				SenderID:       users[j].ID,
				Body:           reply,
				DeliveryStatus: "sent",
			})
			if err != nil {
				return fmt.Errorf("seed conversation reply: %w", err)
			}

			if err := r.UpdateReadState(ctx, convo.ID, users[i].ID, replyMsg.ID); err != nil {
				return fmt.Errorf("seed read state sender: %w", err)
			}
			if err := r.UpdateReadState(ctx, convo.ID, users[j].ID, replyMsg.ID); err != nil {
				return fmt.Errorf("seed read state recipient: %w", err)
			}
		}
	}

	return nil
}

func (r *EventRepository) AuthenticateUser(ctx context.Context, email, password string) (*User, error) {
	var user User
	var storedPassword string
	if err := r.db.QueryRowContext(ctx, selectUserByEmail, email).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&storedPassword,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	if storedPassword != password {
		return nil, ErrInvalidCredentials
	}

	return &user, nil
}
