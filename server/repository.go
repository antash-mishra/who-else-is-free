package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrUserNotFound = errors.New("user not found")
var ErrEventNotFound = errors.New("event not found")
var ErrConversationNotFound = errors.New("conversation not found")
var ErrAlreadyConversationMember = errors.New("user already a conversation member")
var ErrJoinRequestExists = errors.New("join request already pending")
var ErrJoinRequestNotFound = errors.New("join request not found")
var ErrNotEventHost = errors.New("user is not the event host")
var ErrCannotRemoveHost = errors.New("event host cannot be removed from the conversation")
var ErrNotConversationMember = errors.New("user is not a conversation member")
var ErrReportAlreadyExists = errors.New("report already exists for this event")

type rowQuery interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

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
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    event_date TEXT NOT NULL,
    description TEXT,
    gender TEXT NOT NULL,
    min_age INTEGER NOT NULL,
    max_age INTEGER NOT NULL,
    date_label TEXT NOT NULL CHECK(date_label IN ('Today', 'Tmrw')),
    group_type TEXT NOT NULL DEFAULT 'Single',
    cover_key TEXT NOT NULL DEFAULT 'cover_01',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
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
    event_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
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

// Unique index for event reports (event_id, user_id) when reported_user_id is NULL
// and (event_id, user_id, reported_user_id) when reported_user_id is NOT NULL
const createEventReportsUniqueIndex = `
CREATE UNIQUE INDEX IF NOT EXISTS event_reports_unique_idx
ON event_reports (event_id, user_id) WHERE reported_user_id IS NULL;
`

const createMemberReportsUniqueIndex = `
CREATE UNIQUE INDEX IF NOT EXISTS member_reports_unique_idx
ON event_reports (event_id, user_id, reported_user_id) WHERE reported_user_id IS NOT NULL;
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
INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`

const updateEvent = `
UPDATE events
SET title = ?, location = ?, time = ?, event_date = ?, description = ?, gender = ?, min_age = ?, max_age = ?, date_label = ?, group_type = ?, cover_key = COALESCE(NULLIF(?, ''), cover_key), scheduled_at = ?
WHERE id = ? AND user_id = ?;
`

const insertUser = `
INSERT INTO users (name, email, password)
VALUES (?, ?, ?);
`

const insertConversation = `
INSERT INTO conversations (title, created_by, event_id)
VALUES (?, ?, ?);
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
SELECT c.id, c.title, c.created_by, c.created_at, c.event_id
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
SELECT e.id, e.user_id, e.title, e.location, e.time, e.event_date, e.description, e.gender, e.min_age, e.max_age, e.date_label, e.group_type, e.cover_key, e.scheduled_at, e.created_at, u.name AS host_name
FROM events e
JOIN users u ON u.id = e.user_id
ORDER BY e.event_date ASC, e.time ASC, e.created_at DESC;
`

const selectEventByID = `
SELECT e.id, e.user_id, e.title, e.location, e.time, e.event_date, e.description, e.gender, e.min_age, e.max_age, e.date_label, e.group_type, e.cover_key, e.scheduled_at, e.created_at, u.name AS host_name
FROM events e
JOIN users u ON u.id = e.user_id
WHERE e.id = ?
LIMIT 1;
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

const selectConversationByEventID = `
SELECT id, title, created_by, created_at, event_id
FROM conversations
WHERE event_id = ?
LIMIT 1;
`

const selectConversationByTitle = `
SELECT id
FROM conversations
WHERE title = ?
LIMIT 1;
`

const selectConversationsForEvent = `
SELECT c.id, c.title, c.created_by, c.created_at, c.event_id
FROM conversations c
WHERE c.event_id = ?
ORDER BY c.created_at DESC;
`

const createTableConversationJoinRequests = `
CREATE TABLE IF NOT EXISTS conversation_join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending','approved','denied')) DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,
    decided_by INTEGER,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (decided_by) REFERENCES users(id)
);
`

const createTableEventReports = `
CREATE TABLE IF NOT EXISTS event_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reported_user_id INTEGER,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','reviewed','dismissed')) DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by INTEGER,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reported_user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
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

const selectUserByID = `
SELECT id, name, email, password, created_at
FROM users
WHERE id = ?;
`

const selectPendingJoinRequest = `
SELECT id, event_id, user_id, status, message, created_at, decided_at, decided_by
FROM conversation_join_requests
WHERE event_id = ? AND user_id = ? AND status = 'pending'
LIMIT 1;
`

const selectApprovedJoinRequest = `
SELECT id, event_id, user_id, status, message, created_at, decided_at, decided_by
FROM conversation_join_requests
WHERE event_id = ? AND user_id = ? AND status = 'approved'
LIMIT 1;
`

const selectJoinRequestByID = `
SELECT id, event_id, user_id, status, message, created_at, decided_at, decided_by
FROM conversation_join_requests
WHERE id = ?;
`

const insertJoinRequest = `
INSERT INTO conversation_join_requests (event_id, user_id, message, status)
VALUES (?, ?, ?, 'pending');
`

const updateJoinRequestStatus = `
UPDATE conversation_join_requests
SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?
WHERE id = ?;
`

const selectPendingJoinRequestsForEvent = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = ? AND r.status = 'pending'
ORDER BY r.created_at ASC;
`

// For 1:1 events, we also show approved requests (they are auto-approved)
const selectApprovedJoinRequestsForEvent = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = ? AND r.status = 'approved'
ORDER BY r.created_at ASC;
`

const selectPendingJoinRequestsForUser = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.user_id = ? AND r.status = 'pending'
ORDER BY r.created_at DESC;
`

const cancelJoinRequestByUser = `
DELETE FROM conversation_join_requests
WHERE event_id = ? AND user_id = ? AND status = 'pending';
`

const insertEventReport = `
INSERT INTO event_reports (event_id, user_id, reason, status)
VALUES (?, ?, ?, 'pending');
`

const insertMemberReport = `
INSERT INTO event_reports (event_id, user_id, reported_user_id, reason, status)
VALUES (?, ?, ?, ?, 'pending');
`

const deleteConversationMember = `
DELETE FROM conversation_members
WHERE conversation_id = ? AND user_id = ?;
`

const deleteConversationReadState = `
DELETE FROM conversation_read_state
WHERE conversation_id = ? AND user_id = ?;
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
	if err := r.ensureEventCoverKeyColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureEventDateColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureEventGroupTypeColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureScheduledAtColumn(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createTableConversations); err != nil {
		return fmt.Errorf("create conversations table: %w", err)
	}
	if err := r.ensureConversationEventColumn(ctx); err != nil {
		return err
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
	if _, err := r.db.ExecContext(ctx, createTableConversationJoinRequests); err != nil {
		return fmt.Errorf("create conversation join requests table: %w", err)
	}
	if err := r.ensureJoinRequestMessageColumn(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createTableEventReports); err != nil {
		return fmt.Errorf("create event_reports table: %w", err)
	}
	if err := r.ensureReportedUserIDColumn(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createEventReportsUniqueIndex); err != nil {
		return fmt.Errorf("create event_reports unique index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createMemberReportsUniqueIndex); err != nil {
		return fmt.Errorf("create member_reports unique index: %w", err)
	}
	if err := r.cleanupDuplicateSingleEventConversations(ctx); err != nil {
		return err
	}
	return nil
}

func (r *EventRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	if err := r.db.QueryRowContext(ctx, selectUserByEmail, email).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.Password,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("lookup user: %w", err)
	}
	return &user, nil
}

func (r *EventRepository) CreateUserWithPassword(ctx context.Context, name, email, password string) (*User, error) {
	if _, err := r.db.ExecContext(ctx, insertUser, name, email, password); err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return r.GetUserByEmail(ctx, email)
}

func (r *EventRepository) ensureEventsUserIDColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(events);`)
	if err != nil {
		return fmt.Errorf("inspect events table: %w", err)
	}
	defer rows.Close()

	hasUserID := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan events schema: %w", err)
		}
		_ = cid
		_ = colType
		_ = notNull
		_ = defaultVal
		_ = pk
		if name == "user_id" {
			hasUserID = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate events schema: %w", err)
	}
	if hasUserID {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id);`); err != nil {
		return fmt.Errorf("add user_id column: %w", err)
	}

	var fallbackUserID int64
	if err := r.db.QueryRowContext(ctx, `SELECT id FROM users ORDER BY id ASC LIMIT 1`).Scan(&fallbackUserID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Users will be seeded shortly; existing rows carry the default until then.
			return nil
		}
		return fmt.Errorf("lookup fallback user: %w", err)
	}

	if _, err := r.db.ExecContext(ctx, `UPDATE events SET user_id = ? WHERE user_id = 1;`, fallbackUserID); err != nil {
		return fmt.Errorf("backfill event owners: %w", err)
	}

	return nil
}

func (r *EventRepository) ensureEventCoverKeyColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(events);`)
	if err != nil {
		return fmt.Errorf("inspect events table: %w", err)
	}
	defer rows.Close()

	hasCoverKey := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan events schema: %w", err)
		}
		if name == "cover_key" {
			hasCoverKey = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate events schema: %w", err)
	}
	if hasCoverKey {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN cover_key TEXT NOT NULL DEFAULT 'cover_01';`); err != nil {
		return fmt.Errorf("add cover_key column: %w", err)
	}
	return nil
}

func (r *EventRepository) ensureEventDateColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(events);`)
	if err != nil {
		return fmt.Errorf("inspect events table: %w", err)
	}
	defer rows.Close()

	hasEventDate := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan events schema: %w", err)
		}
		if name == "event_date" {
			hasEventDate = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate events schema: %w", err)
	}
	if hasEventDate {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN event_date TEXT NOT NULL DEFAULT '1970-01-01';`); err != nil {
		return fmt.Errorf("add event_date column: %w", err)
	}
	today := time.Now().Format("2006-01-02")
	if _, err := r.db.ExecContext(ctx, `UPDATE events SET event_date = ? WHERE event_date = '1970-01-01';`, today); err != nil {
		return fmt.Errorf("backfill event_date: %w", err)
	}
	return nil
}

func (r *EventRepository) ensureEventGroupTypeColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(events);`)
	if err != nil {
		return fmt.Errorf("inspect events table: %w", err)
	}
	defer rows.Close()

	hasGroupType := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan events schema: %w", err)
		}
		if name == "group_type" {
			hasGroupType = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate events schema: %w", err)
	}
	if hasGroupType {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN group_type TEXT NOT NULL DEFAULT 'Single';`); err != nil {
		return fmt.Errorf("add group_type column: %w", err)
	}
	return nil
}

func (r *EventRepository) ensureJoinRequestMessageColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(conversation_join_requests);`)
	if err != nil {
		return fmt.Errorf("inspect conversation_join_requests table: %w", err)
	}
	defer rows.Close()

	hasMessage := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan join requests schema: %w", err)
		}
		if name == "message" {
			hasMessage = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate join requests schema: %w", err)
	}
	if hasMessage {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE conversation_join_requests ADD COLUMN message TEXT;`); err != nil {
		return fmt.Errorf("add message column to join requests: %w", err)
	}
	return nil
}

func (r *EventRepository) ensureReportedUserIDColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(event_reports);`)
	if err != nil {
		return fmt.Errorf("inspect event_reports table: %w", err)
	}
	defer rows.Close()

	hasReportedUserID := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan event_reports schema: %w", err)
		}
		if name == "reported_user_id" {
			hasReportedUserID = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate event_reports schema: %w", err)
	}
	if hasReportedUserID {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE event_reports ADD COLUMN reported_user_id INTEGER REFERENCES users(id);`); err != nil {
		return fmt.Errorf("add reported_user_id column: %w", err)
	}
	return nil
}

func (r *EventRepository) ensureScheduledAtColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(events);`)
	if err != nil {
		return fmt.Errorf("inspect events table: %w", err)
	}
	defer rows.Close()

	hasScheduledAt := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan events schema: %w", err)
		}
		if name == "scheduled_at" {
			hasScheduledAt = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate events schema: %w", err)
	}
	if hasScheduledAt {
		return nil
	}

	// Add the scheduled_at column
	if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN scheduled_at TEXT;`); err != nil {
		return fmt.Errorf("add scheduled_at column: %w", err)
	}

	// Backfill existing rows by combining event_date + time (assume server timezone for legacy data)
	// This constructs an ISO 8601 UTC timestamp from existing date/time fields
	backfillQuery := `
		UPDATE events
		SET scheduled_at = datetime(event_date || 'T' || time || ':00', 'utc')
		WHERE scheduled_at IS NULL AND event_date IS NOT NULL AND time IS NOT NULL AND time != '';
	`
	if _, err := r.db.ExecContext(ctx, backfillQuery); err != nil {
		return fmt.Errorf("backfill scheduled_at: %w", err)
	}

	return nil
}

func (r *EventRepository) ensureConversationEventColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(conversations);`)
	if err != nil {
		return fmt.Errorf("inspect conversations table: %w", err)
	}
	defer rows.Close()

	hasEventID := false
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan conversations schema: %w", err)
		}
		_ = cid
		_ = colType
		_ = notNull
		_ = defaultVal
		_ = pk
		if name == "event_id" {
			hasEventID = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate conversations schema: %w", err)
	}
	if hasEventID {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE conversations ADD COLUMN event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;`); err != nil {
		return fmt.Errorf("add conversation event_id column: %w", err)
	}
	return nil
}

// cleanupDuplicateSingleEventConversations removes empty conversations for 1:1 events
// that were created before the fix to skip initial conversation creation.
// It deletes conversations where:
// 1. The event is a Single (1:1) type
// 2. The conversation has only 1 member (the host)
// 3. The conversation has no messages
// 4. There exists another conversation for the same event (with actual members)
func (r *EventRepository) cleanupDuplicateSingleEventConversations(ctx context.Context) error {
	const cleanupQuery = `
		DELETE FROM conversations
		WHERE id IN (
			SELECT c.id
			FROM conversations c
			JOIN events e ON e.id = c.event_id
			WHERE e.group_type = 'Single'
			AND (
				SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id
			) = 1
			AND (
				SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
			) = 0
			AND EXISTS (
				SELECT 1 FROM conversations c2
				WHERE c2.event_id = c.event_id AND c2.id != c.id
			)
		);
	`
	if _, err := r.db.ExecContext(ctx, cleanupQuery); err != nil {
		return fmt.Errorf("cleanup duplicate single event conversations: %w", err)
	}
	return nil
}

func (r *EventRepository) Create(ctx context.Context, params CreateEventParams) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin event tx: %w", err)
	}

	params.EventDate = strings.TrimSpace(params.EventDate)
	coverKey := strings.TrimSpace(params.CoverKey)
	if coverKey == "" {
		coverKey = defaultCoverKey
	}
	if strings.TrimSpace(params.GroupType) == "" {
		params.GroupType = "Single"
	}
	if strings.TrimSpace(params.DateLabel) == "" {
		params.DateLabel = deriveDateLabel(params.EventDate, time.Now())
	}

	// Handle scheduled_at - store as nullable string
	var scheduledAtStr sql.NullString
	if params.ScheduledAt != "" {
		scheduledAtStr = sql.NullString{String: params.ScheduledAt, Valid: true}
	}

	res, err := tx.ExecContext(ctx, insertEvent,
		params.UserID,
		params.Title,
		params.Location,
		params.Time,
		params.EventDate,
		params.Description,
		params.Gender,
		params.MinAge,
		params.MaxAge,
		params.DateLabel,
		params.GroupType,
		coverKey,
		scheduledAtStr,
	)
	if err != nil {
		tx.Rollback()
		return 0, fmt.Errorf("insert event: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		tx.Rollback()
		return 0, fmt.Errorf("fetch event id: %w", err)
	}

	// Only create initial conversation for Group events
	// For Single (1:1) events, conversations are created when requesters join
	if params.GroupType != "Single" {
		nullableTitle := sql.NullString{String: params.Title, Valid: len(strings.TrimSpace(params.Title)) > 0}
		nullableEventID := sql.NullInt64{Int64: id, Valid: true}

		convoRes, err := tx.ExecContext(ctx, insertConversation, nullableTitle, params.UserID, nullableEventID)
		if err != nil {
			tx.Rollback()
			return 0, fmt.Errorf("insert event conversation: %w", err)
		}

		convoID, err := convoRes.LastInsertId()
		if err != nil {
			tx.Rollback()
			return 0, fmt.Errorf("fetch event conversation id: %w", err)
		}

		if _, err := tx.ExecContext(ctx, insertConversationMember, convoID, params.UserID, "owner"); err != nil {
			tx.Rollback()
			return 0, fmt.Errorf("insert event conversation owner: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit event: %w", err)
	}

	return id, nil
}

func (r *EventRepository) Update(ctx context.Context, id int64, userID int64, params UpdateEventParams) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin event update tx: %w", err)
	}

	params.EventDate = strings.TrimSpace(params.EventDate)
	coverKeyParam := ""
	if params.CoverKey != nil {
		value := strings.TrimSpace(*params.CoverKey)
		if value == "" {
			value = defaultCoverKey
		}
		coverKeyParam = value
	}
	if strings.TrimSpace(params.GroupType) == "" {
		params.GroupType = "Single"
	}
	if strings.TrimSpace(params.DateLabel) == "" {
		params.DateLabel = deriveDateLabel(params.EventDate, time.Now())
	}

	// Handle scheduled_at - store as nullable string
	var scheduledAtStr sql.NullString
	if params.ScheduledAt != "" {
		scheduledAtStr = sql.NullString{String: params.ScheduledAt, Valid: true}
	}

	result, err := tx.ExecContext(ctx, updateEvent,
		params.Title,
		params.Location,
		params.Time,
		params.EventDate,
		params.Description,
		params.Gender,
		params.MinAge,
		params.MaxAge,
		params.DateLabel,
		params.GroupType,
		coverKeyParam,
		scheduledAtStr,
		id,
		userID,
	)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("update event: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("check rows affected: %w", err)
	}

	if rowsAffected == 0 {
		tx.Rollback()
		return ErrEventNotFound
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit event update: %w", err)
	}

	return nil
}

func (r *EventRepository) Delete(ctx context.Context, id int64, userID int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM events WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return fmt.Errorf("delete event: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check delete rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrEventNotFound
	}

	return nil
}

func (r *EventRepository) List(ctx context.Context) ([]Event, error) {
	rows, err := r.db.QueryContext(ctx, selectEvents)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	var events []Event
	now := time.Now()

	for rows.Next() {
		var evt Event
		var scheduledAtStr sql.NullString
		if err := rows.Scan(
			&evt.ID,
			&evt.UserID,
			&evt.Title,
			&evt.Location,
			&evt.Time,
			&evt.EventDate,
			&evt.Description,
			&evt.Gender,
			&evt.MinAge,
			&evt.MaxAge,
			&evt.DateLabel,
			&evt.GroupType,
			&evt.CoverKey,
			&scheduledAtStr,
			&evt.CreatedAt,
			&evt.HostName,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}

		// Parse scheduled_at if present
		if scheduledAtStr.Valid && scheduledAtStr.String != "" {
			if parsed, err := time.Parse(time.RFC3339, scheduledAtStr.String); err == nil {
				evt.ScheduledAt = &parsed
			} else if parsed, err := time.Parse("2006-01-02 15:04:05", scheduledAtStr.String); err == nil {
				// Handle SQLite datetime format
				utc := parsed.UTC()
				evt.ScheduledAt = &utc
			}
		}

		// Filter out past events using scheduled_at (UTC comparison)
		if evt.ScheduledAt != nil {
			if evt.ScheduledAt.Before(now.UTC()) {
				continue // Skip past events
			}
		}

		events = append(events, evt)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	// Update date labels based on current time
	for i := range events {
		events[i].DateLabel = deriveDateLabel(events[i].EventDate, now)
	}

	sort.Slice(events, func(i, j int) bool {
		// Sort by scheduled_at if both have it
		if events[i].ScheduledAt != nil && events[j].ScheduledAt != nil {
			if events[i].ScheduledAt.Equal(*events[j].ScheduledAt) {
				return events[i].CreatedAt.After(events[j].CreatedAt)
			}
			return events[i].ScheduledAt.Before(*events[j].ScheduledAt)
		}
		// Fall back to legacy sorting
		if events[i].EventDate == events[j].EventDate {
			leftMinutes, _ := parseEventTimeLabel(events[i].Time)
			rightMinutes, _ := parseEventTimeLabel(events[j].Time)
			if leftMinutes == rightMinutes {
				return events[i].CreatedAt.After(events[j].CreatedAt)
			}
			return leftMinutes < rightMinutes
		}
		return events[i].EventDate < events[j].EventDate
	})

	return events, nil
}

// CreateConversation creates a new conversation and ensures the creator is a member.
func (r *EventRepository) CreateConversation(ctx context.Context, title *string, createdBy int64, memberIDs []int64, eventID *int64) (*Conversation, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin conversation tx: %w", err)
	}

	role := "owner"
	var nullableTitle sql.NullString
	if title != nil {
		nullableTitle = sql.NullString{String: *title, Valid: true}
	}
	var nullableEventID sql.NullInt64
	if eventID != nil {
		nullableEventID = sql.NullInt64{Int64: *eventID, Valid: true}
	}

	res, err := tx.ExecContext(ctx, insertConversation, nullableTitle, createdBy, nullableEventID)
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
	if nullableEventID.Valid {
		value := nullableEventID.Int64
		conversation.EventID = &value
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
		var eventID sql.NullInt64
		if err := rows.Scan(&convo.ID, &title, &convo.CreatedBy, &convo.CreatedAt, &eventID); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan conversation: %w", err)
		}
		if title.Valid {
			value := title.String
			convo.Title = &value
		}
		if eventID.Valid {
			value := eventID.Int64
			convo.EventID = &value
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
			if errors.Is(err, ErrEventNotFound) {
				// Skip conversations whose backing event has been deleted.
				continue
			}
			return nil, err
		}
		summaries = append(summaries, summary)
	}

	return summaries, nil
}

// ListConversationsForEvent returns all conversations linked to an event.
// Used for 1:1 events to list all host-requester private conversations.
func (r *EventRepository) ListConversationsForEvent(ctx context.Context, eventID, viewerID int64) ([]ConversationSummary, error) {
	rows, err := r.db.QueryContext(ctx, selectConversationsForEvent, eventID)
	if err != nil {
		return nil, fmt.Errorf("list conversations for event: %w", err)
	}

	var conversations []Conversation
	for rows.Next() {
		var convo Conversation
		var title sql.NullString
		var eventIDValue sql.NullInt64
		if err := rows.Scan(&convo.ID, &title, &convo.CreatedBy, &convo.CreatedAt, &eventIDValue); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan conversation: %w", err)
		}
		if title.Valid {
			value := title.String
			convo.Title = &value
		}
		if eventIDValue.Valid {
			value := eventIDValue.Int64
			convo.EventID = &value
		}
		conversations = append(conversations, convo)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterate conversations for event: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close conversations rows: %w", err)
	}

	summaries := make([]ConversationSummary, 0, len(conversations))
	for _, convo := range conversations {
		summary, err := r.hydrateConversationSummary(ctx, convo, viewerID)
		if err != nil {
			if errors.Is(err, ErrEventNotFound) {
				continue
			}
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

func scanJoinRequest(row *sql.Row) (*ConversationJoinRequest, error) {
	var req ConversationJoinRequest
	var decidedAt sql.NullTime
	var decidedBy sql.NullInt64
	var message sql.NullString
	if err := row.Scan(&req.ID, &req.EventID, &req.UserID, &req.Status, &message, &req.CreatedAt, &decidedAt, &decidedBy); err != nil {
		return nil, err
	}
	if message.Valid {
		req.Message = message.String
	}
	if decidedAt.Valid {
		t := decidedAt.Time
		req.DecidedAt = &t
	}
	if decidedBy.Valid {
		id := decidedBy.Int64
		req.DecidedBy = &id
	}
	return &req, nil
}

func fetchJoinRequestByID(ctx context.Context, q rowQuery, id int64) (*ConversationJoinRequest, error) {
	req, err := scanJoinRequest(q.QueryRowContext(ctx, selectJoinRequestByID, id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrJoinRequestNotFound
		}
		return nil, fmt.Errorf("fetch join request: %w", err)
	}
	return req, nil
}

func fetchConversationByEventID(ctx context.Context, q rowQuery, eventID int64) (*Conversation, error) {
	row := q.QueryRowContext(ctx, selectConversationByEventID, eventID)
	var convo Conversation
	var title sql.NullString
	var eventIDValue sql.NullInt64
	if err := row.Scan(&convo.ID, &title, &convo.CreatedBy, &convo.CreatedAt, &eventIDValue); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, fmt.Errorf("fetch conversation by event: %w", err)
	}
	if title.Valid {
		value := title.String
		convo.Title = &value
	}
	if eventIDValue.Valid {
		value := eventIDValue.Int64
		convo.EventID = &value
	}
	return &convo, nil
}

func (r *EventRepository) GetEventByID(ctx context.Context, eventID int64) (*Event, error) {
	row := r.db.QueryRowContext(ctx, selectEventByID, eventID)
	var evt Event
	var scheduledAtStr sql.NullString
	if err := row.Scan(
		&evt.ID,
		&evt.UserID,
		&evt.Title,
		&evt.Location,
		&evt.Time,
		&evt.EventDate,
		&evt.Description,
		&evt.Gender,
		&evt.MinAge,
		&evt.MaxAge,
		&evt.DateLabel,
		&evt.GroupType,
		&evt.CoverKey,
		&scheduledAtStr,
		&evt.CreatedAt,
		&evt.HostName,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrEventNotFound
		}
		return nil, fmt.Errorf("fetch event: %w", err)
	}

	// Parse scheduled_at if present
	if scheduledAtStr.Valid && scheduledAtStr.String != "" {
		if parsed, err := time.Parse(time.RFC3339, scheduledAtStr.String); err == nil {
			evt.ScheduledAt = &parsed
		} else if parsed, err := time.Parse("2006-01-02 15:04:05", scheduledAtStr.String); err == nil {
			// Handle SQLite datetime format
			utc := parsed.UTC()
			evt.ScheduledAt = &utc
		}
	}

	now := time.Now()
	if parsedDate, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(evt.EventDate), now.Location()); err == nil {
		today := startOfDay(now)
		eventDay := startOfDay(parsedDate)
		if eventDay.Equal(today) {
			evt.DateLabel = "Today"
		} else if eventDay.Equal(today.AddDate(0, 0, 1)) {
			evt.DateLabel = "Tmrw"
		}
	}
	return &evt, nil
}

func (r *EventRepository) GetConversationByEventID(ctx context.Context, eventID int64) (*Conversation, error) {
	return fetchConversationByEventID(ctx, r.db, eventID)
}

func (r *EventRepository) CreateJoinRequest(ctx context.Context, eventID, userID int64, message string) (*ConversationJoinRequest, error) {
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.UserID == userID {
		return nil, ErrAlreadyConversationMember
	}

	// For Group events, check if user is already a member of the main conversation
	if event.GroupType == "Group" {
		convo, err := r.GetConversationByEventID(ctx, eventID)
		if err != nil {
			return nil, err
		}

		isMember, err := r.IsConversationMember(ctx, convo.ID, userID)
		if err != nil {
			return nil, err
		}
		if isMember {
			return nil, ErrAlreadyConversationMember
		}
	}

	// Check for existing pending request
	if _, err := scanJoinRequest(r.db.QueryRowContext(ctx, selectPendingJoinRequest, eventID, userID)); err == nil {
		return nil, ErrJoinRequestExists
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check pending join request: %w", err)
	}

	// For 1:1 (Single) events, create a private conversation and auto-approve
	if event.GroupType == "Single" {
		return r.createSingleEventJoinRequest(ctx, event, userID, message)
	}

	// For Group events, create a pending request (existing behavior)
	res, err := r.db.ExecContext(ctx, insertJoinRequest, eventID, userID, message)
	if err != nil {
		return nil, fmt.Errorf("insert join request: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("fetch join request id: %w", err)
	}
	return fetchJoinRequestByID(ctx, r.db, id)
}

// createSingleEventJoinRequest handles join requests for 1:1 events by creating
// a new private conversation between host and requester, inserting the intro message,
// and auto-approving the request.
func (r *EventRepository) createSingleEventJoinRequest(ctx context.Context, event *Event, userID int64, message string) (*ConversationJoinRequest, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin single join request tx: %w", err)
	}

	// Create a new conversation linked to this event (title = event title)
	nullableTitle := sql.NullString{String: event.Title, Valid: len(strings.TrimSpace(event.Title)) > 0}
	nullableEventID := sql.NullInt64{Int64: event.ID, Valid: true}

	convoRes, err := tx.ExecContext(ctx, insertConversation, nullableTitle, event.UserID, nullableEventID)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert single event conversation: %w", err)
	}

	convoID, err := convoRes.LastInsertId()
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("fetch single event conversation id: %w", err)
	}

	// Add host as "owner"
	if _, err := tx.ExecContext(ctx, insertConversationMember, convoID, event.UserID, "owner"); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert single event conversation owner: %w", err)
	}

	// Add requester as "member"
	if _, err := tx.ExecContext(ctx, insertConversationMember, convoID, userID, "member"); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert single event conversation member: %w", err)
	}

	// Insert the intro message as first message from requester
	var msg Message
	var attachmentOut sql.NullString
	row := tx.QueryRowContext(ctx, insertMessage, convoID, userID, message, sql.NullString{}, "sent")
	if err := row.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &attachmentOut, &msg.DeliveryStatus, &msg.CreatedAt); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert single event intro message: %w", err)
	}

	// Create join request with status "approved" immediately
	const insertApprovedJoinRequest = `
		INSERT INTO conversation_join_requests (event_id, user_id, message, status, decided_at, decided_by)
		VALUES (?, ?, ?, 'approved', CURRENT_TIMESTAMP, ?);
	`
	reqRes, err := tx.ExecContext(ctx, insertApprovedJoinRequest, event.ID, userID, message, event.UserID)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert approved join request: %w", err)
	}

	reqID, err := reqRes.LastInsertId()
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("fetch join request id: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit single join request: %w", err)
	}

	return fetchJoinRequestByID(ctx, r.db, reqID)
}

func (r *EventRepository) ApproveJoinRequest(ctx context.Context, eventID, userID, approverID int64) (*ConversationJoinRequest, error) {
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.UserID != approverID {
		return nil, ErrNotEventHost
	}

	convo, err := r.GetConversationByEventID(ctx, eventID)
	if err != nil {
		return nil, err
	}

	isMember, err := r.IsConversationMember(ctx, convo.ID, userID)
	if err != nil {
		return nil, err
	}
	if isMember {
		return nil, ErrAlreadyConversationMember
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin approve join tx: %w", err)
	}

	req, err := scanJoinRequest(tx.QueryRowContext(ctx, selectPendingJoinRequest, eventID, userID))
	if err != nil {
		tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrJoinRequestNotFound
		}
		return nil, fmt.Errorf("fetch pending join request: %w", err)
	}

	if _, err := tx.ExecContext(ctx, updateJoinRequestStatus, "approved", approverID, req.ID); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("approve join request: %w", err)
	}
	if _, err := tx.ExecContext(ctx, insertConversationMember, convo.ID, userID, "member"); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("add conversation member: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit join approval: %w", err)
	}

	return fetchJoinRequestByID(ctx, r.db, req.ID)
}

func (r *EventRepository) DenyJoinRequest(ctx context.Context, eventID, userID, approverID int64) (*ConversationJoinRequest, error) {
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.UserID != approverID {
		return nil, ErrNotEventHost
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin deny join tx: %w", err)
	}

	// For 1:1 events, find approved requests; for Group events, find pending requests
	var req *ConversationJoinRequest
	if event.GroupType == "Single" {
		// For 1:1 events, requests are auto-approved, so look for approved status
		req, err = scanJoinRequest(tx.QueryRowContext(ctx, selectApprovedJoinRequest, eventID, userID))
	} else {
		req, err = scanJoinRequest(tx.QueryRowContext(ctx, selectPendingJoinRequest, eventID, userID))
	}
	if err != nil {
		tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrJoinRequestNotFound
		}
		return nil, fmt.Errorf("fetch join request: %w", err)
	}

	if _, err := tx.ExecContext(ctx, updateJoinRequestStatus, "denied", approverID, req.ID); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("deny join request: %w", err)
	}

	// For 1:1 events, also remove the requester from their private conversation
	if event.GroupType == "Single" {
		// Find the conversation where event_id = eventID and userID is a member
		convo, err := r.findUserConversationForEvent(ctx, tx, eventID, userID)
		if err == nil && convo != nil {
			// Remove the member from conversation_members table
			if _, err := tx.ExecContext(ctx, deleteConversationMember, convo.ID, userID); err != nil {
				tx.Rollback()
				return nil, fmt.Errorf("remove member from single event conversation: %w", err)
			}
			// Also remove their read state
			if _, err := tx.ExecContext(ctx, deleteConversationReadState, convo.ID, userID); err != nil {
				tx.Rollback()
				return nil, fmt.Errorf("delete conversation read state: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit join denial: %w", err)
	}

	return fetchJoinRequestByID(ctx, r.db, req.ID)
}

// findUserConversationForEvent finds a conversation linked to an event where
// the given user is a member. Used for 1:1 events to find the private conversation.
func (r *EventRepository) findUserConversationForEvent(ctx context.Context, tx *sql.Tx, eventID, userID int64) (*Conversation, error) {
	const query = `
		SELECT c.id, c.title, c.created_by, c.created_at, c.event_id
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id
		WHERE c.event_id = ? AND cm.user_id = ?
		LIMIT 1;
	`
	var convo Conversation
	var title sql.NullString
	var eventIDValue sql.NullInt64
	var row *sql.Row
	if tx != nil {
		row = tx.QueryRowContext(ctx, query, eventID, userID)
	} else {
		row = r.db.QueryRowContext(ctx, query, eventID, userID)
	}
	if err := row.Scan(&convo.ID, &title, &convo.CreatedBy, &convo.CreatedAt, &eventIDValue); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, fmt.Errorf("find user conversation for event: %w", err)
	}
	if title.Valid {
		value := title.String
		convo.Title = &value
	}
	if eventIDValue.Valid {
		value := eventIDValue.Int64
		convo.EventID = &value
	}
	return &convo, nil
}

func (r *EventRepository) RemoveEventMember(ctx context.Context, eventID, userID int64) error {
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return err
	}
	if event.UserID == userID {
		return ErrCannotRemoveHost
	}

	convo, err := r.GetConversationByEventID(ctx, eventID)
	if err != nil {
		return err
	}

	isMember, err := r.IsConversationMember(ctx, convo.ID, userID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrNotConversationMember
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin remove member tx: %w", err)
	}

	if _, err := tx.ExecContext(ctx, deleteConversationMember, convo.ID, userID); err != nil {
		tx.Rollback()
		return fmt.Errorf("delete conversation member: %w", err)
	}

	if _, err := tx.ExecContext(ctx, deleteConversationReadState, convo.ID, userID); err != nil {
		tx.Rollback()
		return fmt.Errorf("delete conversation read state: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit remove member: %w", err)
	}

	return nil
}

func (r *EventRepository) ListJoinRequests(ctx context.Context, eventID int64) ([]JoinRequestView, error) {
	// First, get the event to check its type
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return nil, err
	}

	// Choose the right query based on event type
	var query string
	isSingleEvent := event.GroupType == "Single"
	if isSingleEvent {
		// For 1:1 events, list approved requests (they are auto-approved)
		query = selectApprovedJoinRequestsForEvent
	} else {
		// For Group events, list pending requests
		query = selectPendingJoinRequestsForEvent
	}

	rows, err := r.db.QueryContext(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("list join requests: %w", err)
	}
	defer rows.Close()

	var requests []JoinRequestView
	for rows.Next() {
		var req JoinRequestView
		var message sql.NullString
		var decidedAt sql.NullTime
		var decidedBy sql.NullInt64
		var requesterName string
		if err := rows.Scan(
			&req.ID,
			&req.EventID,
			&req.UserID,
			&req.Status,
			&message,
			&req.CreatedAt,
			&decidedAt,
			&decidedBy,
			&requesterName,
		); err != nil {
			return nil, fmt.Errorf("scan join request: %w", err)
		}
		if message.Valid {
			req.Message = message.String
		}
		if decidedAt.Valid {
			t := decidedAt.Time
			req.DecidedAt = &t
		}
		if decidedBy.Valid {
			id := decidedBy.Int64
			req.DecidedBy = &id
		}
		req.Requester = ConversationParticipant{
			ID:   req.UserID,
			Name: requesterName,
		}

		requests = append(requests, req)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate join requests: %w", err)
	}

	// For 1:1 events, populate the conversation IDs after closing rows
	// (SQLite single-connection doesn't support nested queries while rows are open)
	if isSingleEvent {
		for i := range requests {
			convo, err := r.findUserConversationForEvent(ctx, nil, eventID, requests[i].UserID)
			if err == nil && convo != nil {
				requests[i].ConversationID = &convo.ID
			}
		}
	}

	return requests, nil
}

func (r *EventRepository) ListJoinRequestsByUser(ctx context.Context, userID int64) ([]JoinRequestView, error) {
	rows, err := r.db.QueryContext(ctx, selectPendingJoinRequestsForUser, userID)
	if err != nil {
		return nil, fmt.Errorf("list user join requests: %w", err)
	}
	defer rows.Close()

	var requests []JoinRequestView
	for rows.Next() {
		var req JoinRequestView
		var message sql.NullString
		var decidedAt sql.NullTime
		var decidedBy sql.NullInt64
		var requesterName string
		if err := rows.Scan(
			&req.ID,
			&req.EventID,
			&req.UserID,
			&req.Status,
			&message,
			&req.CreatedAt,
			&decidedAt,
			&decidedBy,
			&requesterName,
		); err != nil {
			return nil, fmt.Errorf("scan user join request: %w", err)
		}
		if message.Valid {
			req.Message = message.String
		}
		if decidedAt.Valid {
			t := decidedAt.Time
			req.DecidedAt = &t
		}
		if decidedBy.Valid {
			id := decidedBy.Int64
			req.DecidedBy = &id
		}
		req.Requester = ConversationParticipant{
			ID:   req.UserID,
			Name: requesterName,
		}
		requests = append(requests, req)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user join requests: %w", err)
	}
	return requests, nil
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

	var eventMeta *ConversationEventMeta
	if convo.EventID != nil {
		evt, err := r.GetEventByID(ctx, *convo.EventID)
		if err != nil {
			if errors.Is(err, ErrEventNotFound) {
				return ConversationSummary{}, ErrEventNotFound
			}
			return ConversationSummary{}, err
		}
		eventMeta = &ConversationEventMeta{
			ID:        evt.ID,
			Title:     evt.Title,
			Location:  evt.Location,
			Time:      evt.Time,
			EventDate: evt.EventDate,
			DateLabel: evt.DateLabel,
			GroupType: evt.GroupType,
			CoverKey:  evt.CoverKey,
		}
	}

	summary := ConversationSummary{
		Conversation: convo,
		MemberIDs:    memberIDs,
		Participants: participants,
		Event:        eventMeta,
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
		UserID:      1,
		Title:       "Running Buddy",
		Location:    "Phoenix Park",
		Time:        "09:00",
		Description: "Morning run followed by coffee.",
		Gender:      "Any",
		MinAge:      20,
		MaxAge:      30,
		DateLabel:   "Today",
		GroupType:   "Single",
		CoverKey:    "cover_01",
	},
	{
		UserID:      2,
		Title:       "Live Music Night",
		Location:    "Workmans Club",
		Time:        "20:00",
		Description: "Indie bands and craft beers.",
		Gender:      "Female",
		MinAge:      22,
		MaxAge:      32,
		DateLabel:   "Today",
		GroupType:   "Group",
		CoverKey:    "cover_02",
	},
	{
		UserID:      3,
		Title:       "Trail Hike",
		Location:    "Howth Cliffs",
		Time:        "10:00",
		Description: "Scenic hike with lunch after.",
		Gender:      "Any",
		MinAge:      18,
		MaxAge:      40,
		DateLabel:   "Tmrw",
		GroupType:   "Group",
		CoverKey:    "cover_03",
	},
	{
		UserID:      1,
		Title:       "Community Potluck",
		Location:    "Docklands Hub",
		Time:        "19:00",
		Description: "Bring a dish and meet new neighbours.",
		Gender:      "Any",
		MinAge:      21,
		MaxAge:      45,
		DateLabel:   "Tmrw",
		GroupType:   "Group",
		CoverKey:    "cover_04",
	},
	{
		UserID:      2,
		Title:       "Indie Film Screening",
		Location:    "Lightbox Cinema",
		Time:        "21:30",
		Description: "Private screening of festival favourites.",
		Gender:      "Any",
		MinAge:      23,
		MaxAge:      38,
		DateLabel:   "Today",
		GroupType:   "Group",
		CoverKey:    "cover_05",
	},
}

func (r *EventRepository) EnsureSeedData(ctx context.Context) error {
	if err := r.ensureSeedUsers(ctx); err != nil {
		return err
	}
	if err := r.ensureEventsUserIDColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureEventCoverKeyColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureEventDateColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureEventGroupTypeColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureSeedEvents(ctx); err != nil {
		return err
	}
	if err := r.ensureSeedConversations(ctx); err != nil {
		return err
	}
	return r.ensureSeedEventGroupChat(ctx)
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
	{
		Name:     "Noah Smith",
		Email:    "noah@example.com",
		Password: "sunset123",
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

	today := startOfDay(time.Now())
	todayStr := today.Format("2006-01-02")
	tomorrowStr := today.AddDate(0, 0, 1).Format("2006-01-02")

	for _, evt := range seedEvents {
		if strings.TrimSpace(evt.EventDate) == "" {
			if evt.DateLabel == "Tmrw" {
				evt.EventDate = tomorrowStr
			} else {
				evt.EventDate = todayStr
			}
		}
		if strings.TrimSpace(evt.GroupType) == "" {
			evt.GroupType = "Single"
		}
		parsedDate, err := time.Parse("2006-01-02", evt.EventDate)
		if err != nil {
			parsedDate = today
		}
		dayDiff := int(startOfDay(parsedDate).Sub(today).Hours() / 24)
		if dayDiff == 1 {
			evt.DateLabel = "Tmrw"
		} else {
			evt.DateLabel = "Today"
		}
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

	alreadySeeded := count > 0

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

	if !alreadySeeded {
		sampleMessages := []string{
			"Hey there! Want to sync up later?",
			"Looking forward to catching up soon.",
			"Should we plan something fun tonight?",
		}

		msgIndex := 0
		for i := 0; i < len(users); i++ {
			for j := i + 1; j < len(users); j++ {
				pair := []int64{users[i].ID, users[j].ID}
				convo, err := r.CreateConversation(ctx, nil, users[i].ID, pair, nil)
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
	}

	if len(users) >= 3 {
		groupTitle := "Planning Crew"
		var existingID int64
		err := r.db.QueryRowContext(ctx, selectConversationByTitle, groupTitle).Scan(&existingID)
		if err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("check existing group conversation: %w", err)
			}

			members := []int64{users[0].ID, users[1].ID, users[2].ID}
			convo, err := r.CreateConversation(ctx, &groupTitle, users[0].ID, members, nil)
			if err != nil {
				return fmt.Errorf("seed group conversation: %w", err)
			}

			seedGroupMessages := []struct {
				sender int64
				body   string
			}{
				{sender: users[0].ID, body: "Team, let's sync here about weekend ideas."},
				{sender: users[1].ID, body: "Love it. How about a hike followed by brunch?"},
				{sender: users[2].ID, body: "Count me in! I can book a table if we pick a spot."},
			}

			var lastMsgID int64
			for _, msg := range seedGroupMessages {
				created, err := r.CreateMessage(ctx, CreateMessageParams{
					ConversationID: convo.ID,
					SenderID:       msg.sender,
					Body:           msg.body,
					DeliveryStatus: "sent",
				})
				if err != nil {
					return fmt.Errorf("seed group conversation message: %w", err)
				}
				if created != nil {
					lastMsgID = created.ID
				}
			}

			if lastMsgID > 0 {
				for _, member := range members {
					if err := r.UpdateReadState(ctx, convo.ID, member, lastMsgID); err != nil {
						return fmt.Errorf("seed group conversation read state: %w", err)
					}
				}
			}
		}
	}

	return nil
}

func (r *EventRepository) ensureSeedEventGroupChat(ctx context.Context) error {
	convo, err := r.GetConversationByEventID(ctx, 1)
	if err != nil {
		if errors.Is(err, ErrConversationNotFound) || errors.Is(err, ErrEventNotFound) {
			return nil
		}
		return err
	}

	_, memberIDs, err := r.fetchConversationParticipants(ctx, convo.ID)
	if err != nil {
		return err
	}
	if len(memberIDs) >= 4 {
		return nil
	}

	memberSet := make(map[int64]struct{}, len(memberIDs))
	for _, id := range memberIDs {
		memberSet[id] = struct{}{}
	}

	additionalMembers := []int64{2, 3, 4}
	for _, userID := range additionalMembers {
		if _, ok := memberSet[userID]; ok {
			continue
		}
		if _, err := r.db.ExecContext(ctx, insertConversationMember, convo.ID, userID, "member"); err != nil {
			return fmt.Errorf("seed event group member %d: %w", userID, err)
		}
	}

	sampleMessages := []struct {
		sender int64
		body   string
	}{
		{sender: convo.CreatedBy, body: "Hey everyone! Use this chat to coordinate before the event."},
		{sender: 2, body: "Thanks for adding me—looking forward to it."},
		{sender: 3, body: "I'll bring snacks. Any allergy concerns?"},
		{sender: 4, body: "I’m good with anything. See you all there!"},
	}

	var lastMessageID int64
	for _, msg := range sampleMessages {
		created, err := r.CreateMessage(ctx, CreateMessageParams{
			ConversationID: convo.ID,
			SenderID:       msg.sender,
			Body:           msg.body,
			DeliveryStatus: "sent",
		})
		if err != nil {
			return fmt.Errorf("seed event group message: %w", err)
		}
		if created != nil {
			lastMessageID = created.ID
		}
	}

	if lastMessageID > 0 {
		if err := r.UpdateReadState(ctx, convo.ID, convo.CreatedBy, lastMessageID); err != nil {
			return fmt.Errorf("seed event group read state: %w", err)
		}
	}

	return nil
}

func (r *EventRepository) AuthenticateUser(ctx context.Context, email, password string) (*User, error) {
	user, err := r.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if user.Password != password {
		return nil, ErrInvalidCredentials
	}

	return user, nil
}

func (r *EventRepository) GetUserByID(ctx context.Context, id int64) (*User, error) {
	var user User
	if err := r.db.QueryRowContext(ctx, selectUserByID, id).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.Password,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("lookup user by id: %w", err)
	}
	return &user, nil
}

func (r *EventRepository) CancelJoinRequest(ctx context.Context, eventID, userID int64) error {
	result, err := r.db.ExecContext(ctx, cancelJoinRequestByUser, eventID, userID)
	if err != nil {
		return fmt.Errorf("cancel join request: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check cancel rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrJoinRequestNotFound
	}
	return nil
}

func (r *EventRepository) CreateEventReport(ctx context.Context, eventID, userID int64, reason string) (*EventReport, error) {
	res, err := r.db.ExecContext(ctx, insertEventReport, eventID, userID, reason)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, ErrReportAlreadyExists
		}
		return nil, fmt.Errorf("insert event report: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("fetch event report id: %w", err)
	}
	return &EventReport{
		ID:        id,
		EventID:   eventID,
		UserID:    userID,
		Reason:    reason,
		Status:    "pending",
		CreatedAt: time.Now(),
	}, nil
}

// CreateMemberReport creates a report for a specific member of an event.
// The reporter_id is the user submitting the report, reported_user_id is the target.
func (r *EventRepository) CreateMemberReport(ctx context.Context, eventID, reporterID, reportedUserID int64, reason string) (*EventReport, error) {
	res, err := r.db.ExecContext(ctx, insertMemberReport, eventID, reporterID, reportedUserID, reason)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, ErrReportAlreadyExists
		}
		return nil, fmt.Errorf("insert member report: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("fetch member report id: %w", err)
	}
	return &EventReport{
		ID:             id,
		EventID:        eventID,
		UserID:         reporterID,
		ReportedUserID: &reportedUserID,
		Reason:         reason,
		Status:         "pending",
		CreatedAt:      time.Now(),
	}, nil
}

// findUserConversationForEventPublic is a public wrapper around findUserConversationForEvent
// that doesn't require a transaction.
func (r *EventRepository) findUserConversationForEventPublic(ctx context.Context, eventID, userID int64) (*Conversation, error) {
	return r.findUserConversationForEvent(ctx, nil, eventID, userID)
}
