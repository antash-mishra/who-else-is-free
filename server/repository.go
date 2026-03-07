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
var ErrReportAlreadyExists = errors.New("report already exists")
var ErrUsersBlocked = errors.New("users are blocked")
var ErrAppleAccountLinkedToDifferentUser = errors.New("apple account is already linked to a different user")

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

const createTableAppleAccounts = `
CREATE TABLE IF NOT EXISTS apple_accounts (
    apple_sub TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    email TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

const createAppleAccountsUserIDIndex = `
CREATE INDEX IF NOT EXISTS apple_accounts_user_idx
ON apple_accounts (user_id);
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

const dropEventReportsUniqueIndex = `
DROP INDEX IF EXISTS event_reports_unique_idx;
`

const createMemberReportsUniqueIndex = `
CREATE UNIQUE INDEX IF NOT EXISTS member_reports_unique_idx
ON event_reports (event_id, user_id, reported_user_id) WHERE reported_user_id IS NOT NULL;
`

const createEventReportsEventUserUniqueIndex = `
CREATE UNIQUE INDEX IF NOT EXISTS event_reports_event_user_unique_idx
ON event_reports (event_id, user_id) WHERE reported_user_id IS NULL;
`

const createTableUserBlocks = `
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_user_id INTEGER NOT NULL,
    blocked_user_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK (blocker_user_id != blocked_user_id)
);
`

const createUserBlocksBlockedIndex = `
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
ON user_blocks (blocked_user_id);
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
INSERT INTO users (name, email, password, profile_complete)
VALUES (?, ?, ?, 0);
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
LEFT JOIN events e ON e.id = c.event_id
WHERE cm.user_id = ?
  AND (c.event_id IS NULL
       OR datetime(e.scheduled_at) > datetime('now', '-1 day')
       OR (e.scheduled_at IS NULL AND e.event_date >= date('now', '-1 day')))
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

const selectFormerMessageSenders = `
SELECT DISTINCT m.sender_id, u.name
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = ?
  AND m.sender_id NOT IN (
    SELECT user_id FROM conversation_members WHERE conversation_id = ?
  )
ORDER BY m.sender_id ASC;
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
SELECT id, name, email, password, gender, age, avatar, profile_complete, created_at
FROM users
WHERE email = ?;
`

const selectUserByID = `
SELECT id, name, email, password, gender, age, avatar, profile_complete, created_at
FROM users
WHERE id = ?;
`

const selectUserByAppleSubject = `
SELECT u.id, u.name, u.email, u.password, u.gender, u.age, u.avatar, u.profile_complete, u.created_at
FROM users u
JOIN apple_accounts a ON a.user_id = u.id
WHERE a.apple_sub = ?
LIMIT 1;
`

const selectAppleAccountBySubject = `
SELECT user_id, email
FROM apple_accounts
WHERE apple_sub = ?
LIMIT 1;
`

const insertAppleAccount = `
INSERT INTO apple_accounts (apple_sub, user_id, email)
VALUES (?, ?, ?);
`

const updateAppleAccountEmailBySubject = `
UPDATE apple_accounts
SET email = ?
WHERE apple_sub = ?;
`

const updateUserProfile = `
UPDATE users
SET name = ?, gender = ?, age = ?, avatar = ?, profile_complete = ?
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

const selectPendingOrApprovedJoinRequestsForEvent = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = ? AND r.status IN ('pending', 'approved')
ORDER BY r.created_at ASC;
`

const selectPendingJoinRequestsForUser = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.user_id = ? AND r.status = 'pending'
ORDER BY r.created_at DESC;
`

const selectPendingOrApprovedJoinRequestsForUser = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.user_id = ? AND r.status IN ('pending', 'approved')
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

const insertUserBlock = `
INSERT OR IGNORE INTO user_blocks (blocker_user_id, blocked_user_id)
VALUES (?, ?);
`

const deleteUserBlock = `
DELETE FROM user_blocks
WHERE blocker_user_id = ? AND blocked_user_id = ?;
`

const selectBlockedUserIDsForUser = `
SELECT blocked_user_id
FROM user_blocks
WHERE blocker_user_id = ?;
`

const selectUserBlockRelationship = `
SELECT 1
FROM user_blocks
WHERE blocker_user_id = ? AND blocked_user_id = ?
LIMIT 1;
`

const deleteMemberReportByEventAndUsers = `
DELETE FROM event_reports
WHERE event_id = ? AND user_id = ? AND reported_user_id = ?;
`

const selectMemberReportRelationship = `
SELECT 1
FROM event_reports
WHERE event_id = ? AND user_id = ? AND reported_user_id = ?
LIMIT 1;
`

const selectHostEventIDsForMember = `
SELECT DISTINCT c.event_id
FROM conversations c
JOIN events e ON e.id = c.event_id
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE e.user_id = ? AND cm.user_id = ? AND c.event_id IS NOT NULL
ORDER BY c.event_id ASC;
`

const createTablePushTokens = `
CREATE TABLE IF NOT EXISTS push_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    device_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('android','ios')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

const createPushTokensUserIndex = `
CREATE INDEX IF NOT EXISTS push_tokens_user_idx
ON push_tokens (user_id);
`

const createPushTokensTokenUniqueIndex = `
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique_idx
ON push_tokens (token);
`

const upsertPushToken = `
INSERT INTO push_tokens (user_id, token, device_id, platform, updated_at)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(token)
DO UPDATE SET user_id = excluded.user_id, device_id = excluded.device_id, platform = excluded.platform, updated_at = CURRENT_TIMESTAMP;
`

const deletePushTokenByValue = `
DELETE FROM push_tokens
WHERE user_id = ? AND token = ?;
`

const selectPushTokensByUserID = `
SELECT id, user_id, token, device_id, platform, created_at, updated_at
FROM push_tokens
WHERE user_id = ?;
`

const selectPushTokensByUserIDs = `
SELECT id, user_id, token, device_id, platform, created_at, updated_at
FROM push_tokens
WHERE user_id IN (%s);
`

const selectConversationMemberIDs = `
SELECT user_id
FROM conversation_members
WHERE conversation_id = ?;
`

const selectEventConversationMembers = `
SELECT cm.conversation_id, cm.user_id
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE c.event_id = ?
ORDER BY cm.conversation_id ASC, cm.user_id ASC;
`

const deleteConversationMember = `
DELETE FROM conversation_members
WHERE conversation_id = ? AND user_id = ?;
`

const deleteConversationReadState = `
DELETE FROM conversation_read_state
WHERE conversation_id = ? AND user_id = ?;
`

const deleteConversationByID = `
DELETE FROM conversations
WHERE id = ?;
`

const deleteJoinRequestForEvent = `
DELETE FROM conversation_join_requests
WHERE event_id = ? AND user_id = ?;
`

type EventRepository struct {
	db *sql.DB
}

type EventConversationMember struct {
	ConversationID int64
	UserID         int64
}

func NewEventRepository(db *sql.DB) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) Init(ctx context.Context) error {
	// Run idempotent migrations on startup so the server can launch without external tooling.
	if _, err := r.db.ExecContext(ctx, createTableUsers); err != nil {
		return fmt.Errorf("create users table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableAppleAccounts); err != nil {
		return fmt.Errorf("create apple_accounts table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createAppleAccountsUserIDIndex); err != nil {
		return fmt.Errorf("create apple_accounts user index: %w", err)
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
	if err := r.cleanupOrphanedEventReferences(ctx); err != nil {
		return err
	}
	if err := r.ensureUserProfileColumns(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, dropEventReportsUniqueIndex); err != nil {
		return fmt.Errorf("drop event_reports unique index: %w", err)
	}
	if err := r.cleanupDuplicateEventReports(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createEventReportsEventUserUniqueIndex); err != nil {
		return fmt.Errorf("create event_reports event/user unique index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createMemberReportsUniqueIndex); err != nil {
		return fmt.Errorf("create member_reports unique index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableUserBlocks); err != nil {
		return fmt.Errorf("create user_blocks table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createUserBlocksBlockedIndex); err != nil {
		return fmt.Errorf("create user_blocks blocked index: %w", err)
	}
	if err := r.backfillUserBlocksFromMemberReports(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createTablePushTokens); err != nil {
		return fmt.Errorf("create push_tokens table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createPushTokensUserIndex); err != nil {
		return fmt.Errorf("create push_tokens user index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createPushTokensTokenUniqueIndex); err != nil {
		return fmt.Errorf("create push_tokens token unique index: %w", err)
	}
	if err := r.cleanupDuplicateSingleEventConversations(ctx); err != nil {
		return err
	}
	if err := r.cleanupOrphanedSingleEventConversations(ctx); err != nil {
		return err
	}
	return nil
}

func (r *EventRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	var profileComplete int
	if err := r.db.QueryRowContext(ctx, selectUserByEmail, email).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.Password,
		&user.Gender,
		&user.Age,
		&user.Avatar,
		&profileComplete,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("lookup user: %w", err)
	}
	user.ProfileComplete = profileComplete == 1
	return &user, nil
}

func (r *EventRepository) CreateUserWithPassword(ctx context.Context, name, email, password string) (*User, error) {
	if _, err := r.db.ExecContext(ctx, insertUser, name, email, password); err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return r.GetUserByEmail(ctx, email)
}

func (r *EventRepository) GetUserByAppleSubject(ctx context.Context, subject string) (*User, error) {
	var user User
	var profileComplete int

	if err := r.db.QueryRowContext(ctx, selectUserByAppleSubject, strings.TrimSpace(subject)).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.Password,
		&user.Gender,
		&user.Age,
		&user.Avatar,
		&profileComplete,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("lookup user by apple subject: %w", err)
	}

	user.ProfileComplete = profileComplete == 1
	return &user, nil
}

func (r *EventRepository) LinkAppleAccount(ctx context.Context, subject string, userID int64, email string) error {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return fmt.Errorf("link apple account: subject is required")
	}

	trimmedEmail := strings.TrimSpace(email)
	var existingUserID int64
	var existingEmail sql.NullString

	err := r.db.QueryRowContext(ctx, selectAppleAccountBySubject, subject).Scan(&existingUserID, &existingEmail)
	if err == nil {
		if existingUserID != userID {
			return ErrAppleAccountLinkedToDifferentUser
		}
		if trimmedEmail != "" && (!existingEmail.Valid || existingEmail.String != trimmedEmail) {
			if _, updateErr := r.db.ExecContext(ctx, updateAppleAccountEmailBySubject, trimmedEmail, subject); updateErr != nil {
				return fmt.Errorf("update apple account email: %w", updateErr)
			}
		}
		return nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("lookup apple account: %w", err)
	}

	var emailValue any
	if trimmedEmail != "" {
		emailValue = trimmedEmail
	}

	if _, err := r.db.ExecContext(ctx, insertAppleAccount, subject, userID, emailValue); err != nil {
		return fmt.Errorf("insert apple account: %w", err)
	}
	return nil
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

func (r *EventRepository) ensureUserProfileColumns(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(users);`)
	if err != nil {
		return fmt.Errorf("inspect users table: %w", err)
	}
	defer rows.Close()

	hasGender := false
	hasAge := false
	hasAvatar := false
	hasProfileComplete := false
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
			return fmt.Errorf("scan users schema: %w", err)
		}
		switch name {
		case "gender":
			hasGender = true
		case "age":
			hasAge = true
		case "avatar":
			hasAvatar = true
		case "profile_complete":
			hasProfileComplete = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate users schema: %w", err)
	}

	if !hasGender {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN gender TEXT;`); err != nil {
			return fmt.Errorf("add gender column: %w", err)
		}
	}
	if !hasAge {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN age INTEGER;`); err != nil {
			return fmt.Errorf("add age column: %w", err)
		}
	}
	if !hasAvatar {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN avatar TEXT;`); err != nil {
			return fmt.Errorf("add avatar column: %w", err)
		}
	}
	if !hasProfileComplete {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN profile_complete INTEGER NOT NULL DEFAULT 0;`); err != nil {
			return fmt.Errorf("add profile_complete column: %w", err)
		}
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

// cleanupOrphanedSingleEventConversations removes legacy 1:1 conversations where
// only the host remains but old messages are still present. These rows can leave
// stale unread previews in Messages after a requester has already left.
func (r *EventRepository) cleanupOrphanedSingleEventConversations(ctx context.Context) error {
	const cleanupQuery = `
		DELETE FROM conversations
		WHERE id IN (
			SELECT c.id
			FROM conversations c
			JOIN events e ON e.id = c.event_id
			WHERE e.group_type = 'Single'
			AND (
				SELECT COUNT(*) FROM conversation_members cm
				WHERE cm.conversation_id = c.id
			) = 1
			AND EXISTS (
				SELECT 1 FROM conversation_members cm
				WHERE cm.conversation_id = c.id AND cm.user_id = e.user_id
			)
			AND EXISTS (
				SELECT 1 FROM messages m
				WHERE m.conversation_id = c.id
				AND m.sender_id != e.user_id
			)
		);
	`
	if _, err := r.db.ExecContext(ctx, cleanupQuery); err != nil {
		return fmt.Errorf("cleanup orphaned single event conversations: %w", err)
	}
	return nil
}

// cleanupOrphanedEventReferences removes legacy rows that still point to
// deleted events from periods where foreign key enforcement was not active.
func (r *EventRepository) cleanupOrphanedEventReferences(ctx context.Context) error {
	const deleteOrphanedConversations = `
		DELETE FROM conversations
		WHERE event_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM events e
			WHERE e.id = conversations.event_id
		);
	`
	if _, err := r.db.ExecContext(ctx, deleteOrphanedConversations); err != nil {
		return fmt.Errorf("cleanup orphaned conversations: %w", err)
	}

	const deleteOrphanedJoinRequests = `
		DELETE FROM conversation_join_requests
		WHERE NOT EXISTS (
			SELECT 1
			FROM events e
			WHERE e.id = conversation_join_requests.event_id
		);
	`
	if _, err := r.db.ExecContext(ctx, deleteOrphanedJoinRequests); err != nil {
		return fmt.Errorf("cleanup orphaned join requests: %w", err)
	}

	const deleteOrphanedEventReports = `
		DELETE FROM event_reports
		WHERE NOT EXISTS (
			SELECT 1
			FROM events e
			WHERE e.id = event_reports.event_id
		);
	`
	if _, err := r.db.ExecContext(ctx, deleteOrphanedEventReports); err != nil {
		return fmt.Errorf("cleanup orphaned event reports: %w", err)
	}

	return nil
}

// cleanupDuplicateEventReports keeps the first event-level report per user/event
// so we can safely enforce uniqueness for future inserts.
func (r *EventRepository) cleanupDuplicateEventReports(ctx context.Context) error {
	const dedupeQuery = `
		DELETE FROM event_reports
		WHERE reported_user_id IS NULL
		AND id NOT IN (
			SELECT MIN(id)
			FROM event_reports
			WHERE reported_user_id IS NULL
			GROUP BY event_id, user_id
		);
	`
	if _, err := r.db.ExecContext(ctx, dedupeQuery); err != nil {
		return fmt.Errorf("cleanup duplicate event reports: %w", err)
	}
	return nil
}

func (r *EventRepository) backfillUserBlocksFromMemberReports(ctx context.Context) error {
	const backfillQuery = `
		INSERT OR IGNORE INTO user_blocks (blocker_user_id, blocked_user_id)
		SELECT user_id, reported_user_id
		FROM event_reports
		WHERE reported_user_id IS NOT NULL
		UNION
		SELECT reported_user_id, user_id
		FROM event_reports
		WHERE reported_user_id IS NOT NULL;
	`
	if _, err := r.db.ExecContext(ctx, backfillQuery); err != nil {
		return fmt.Errorf("backfill user blocks from member reports: %w", err)
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

// ListForViewer returns visible events for a specific viewer, excluding events
// hosted by users this viewer has blocked.
func (r *EventRepository) ListForViewer(ctx context.Context, viewerUserID int64) ([]Event, error) {
	events, err := r.List(ctx)
	if err != nil {
		return nil, err
	}
	if viewerUserID <= 0 {
		return events, nil
	}

	blockedIDs, err := r.ListBlockedUserIDs(ctx, viewerUserID)
	if err != nil {
		return nil, err
	}
	if len(blockedIDs) == 0 {
		return events, nil
	}

	blockedSet := make(map[int64]struct{}, len(blockedIDs))
	for _, id := range blockedIDs {
		blockedSet[id] = struct{}{}
	}

	filtered := make([]Event, 0, len(events))
	for _, evt := range events {
		if _, blocked := blockedSet[evt.UserID]; blocked {
			continue
		}
		filtered = append(filtered, evt)
	}
	return filtered, nil
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
	blocked, err := r.AreUsersBlocked(ctx, event.UserID, userID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, ErrUsersBlocked
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

	// For 1:1 events, ensure the user does not already have an active private
	// conversation for this event before creating another request.
	if event.GroupType == "Single" {
		convo, err := r.findUserConversationForEvent(ctx, nil, eventID, userID)
		if err == nil && convo != nil {
			return nil, ErrAlreadyConversationMember
		}
		if err != nil && !errors.Is(err, ErrConversationNotFound) {
			return nil, err
		}
	}

	// Check for existing pending request
	if _, err := scanJoinRequest(r.db.QueryRowContext(ctx, selectPendingJoinRequest, eventID, userID)); err == nil {
		return nil, ErrJoinRequestExists
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check pending join request: %w", err)
	}

	// Create a pending join request for both Group and 1:1 events.
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

func (r *EventRepository) approveSingleJoinRequest(ctx context.Context, event *Event, userID, approverID int64) (*ConversationJoinRequest, error) {
	if convo, err := r.findUserConversationForEvent(ctx, nil, event.ID, userID); err == nil && convo != nil {
		return nil, ErrAlreadyConversationMember
	} else if err != nil && !errors.Is(err, ErrConversationNotFound) {
		return nil, err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin approve single join tx: %w", err)
	}

	req, err := scanJoinRequest(tx.QueryRowContext(ctx, selectPendingJoinRequest, event.ID, userID))
	if err != nil {
		tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrJoinRequestNotFound
		}
		return nil, fmt.Errorf("fetch pending single join request: %w", err)
	}

	// Create a new conversation linked to this event (title = event title)
	nullableTitle := sql.NullString{String: event.Title, Valid: len(strings.TrimSpace(event.Title)) > 0}
	nullableEventID := sql.NullInt64{Int64: event.ID, Valid: true}

	convoRes, err := tx.ExecContext(ctx, insertConversation, nullableTitle, event.UserID, nullableEventID)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert approved single conversation: %w", err)
	}

	convoID, err := convoRes.LastInsertId()
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("fetch approved single conversation id: %w", err)
	}

	// Add host as "owner"
	if _, err := tx.ExecContext(ctx, insertConversationMember, convoID, event.UserID, "owner"); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert approved single conversation owner: %w", err)
	}

	// Add requester as "member"
	if _, err := tx.ExecContext(ctx, insertConversationMember, convoID, userID, "member"); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("insert approved single conversation member: %w", err)
	}

	trimmedMessage := strings.TrimSpace(req.Message)
	if trimmedMessage != "" {
		// Persist the request intro as the first message in the approved private chat.
		var msg Message
		var attachmentOut sql.NullString
		row := tx.QueryRowContext(ctx, insertMessage, convoID, userID, trimmedMessage, sql.NullString{}, "sent")
		if err := row.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &attachmentOut, &msg.DeliveryStatus, &msg.CreatedAt); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("insert approved single intro message: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, updateJoinRequestStatus, "approved", approverID, req.ID); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("approve single join request: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit approve single join: %w", err)
	}

	return fetchJoinRequestByID(ctx, r.db, req.ID)
}

func (r *EventRepository) ApproveJoinRequest(ctx context.Context, eventID, userID, approverID int64) (*ConversationJoinRequest, error) {
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.UserID != approverID {
		return nil, ErrNotEventHost
	}

	if event.GroupType == "Single" {
		return r.approveSingleJoinRequest(ctx, event, userID, approverID)
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

	trimmedMessage := strings.TrimSpace(req.Message)
	if trimmedMessage != "" {
		// Persist requester intro into the group chat when approval happens.
		var msg Message
		var attachmentOut sql.NullString
		row := tx.QueryRowContext(ctx, insertMessage, convo.ID, userID, trimmedMessage, sql.NullString{}, "sent")
		if err := row.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &attachmentOut, &msg.DeliveryStatus, &msg.CreatedAt); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("insert approved group intro message: %w", err)
		}
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

	req, err := scanJoinRequest(tx.QueryRowContext(ctx, selectPendingJoinRequest, eventID, userID))
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
		ORDER BY c.created_at DESC, c.id DESC
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

	// Use findUserConversationForEvent to find the specific conversation where
	// the user is a member. This is important for 1:1 events where multiple
	// private conversations can exist per event (one for each joiner).
	convo, err := r.findUserConversationForEvent(ctx, nil, eventID, userID)
	if err != nil {
		if errors.Is(err, ErrConversationNotFound) {
			return ErrNotConversationMember
		}
		return err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin remove member tx: %w", err)
	}

	if event.GroupType == "Single" {
		// In 1:1 events, close the private conversation entirely so the host
		// no longer sees stale unread or last-message previews after leave.
		if _, err := tx.ExecContext(ctx, deleteConversationByID, convo.ID); err != nil {
			tx.Rollback()
			return fmt.Errorf("delete single event conversation: %w", err)
		}
	} else {
		// Group events keep the shared conversation and only remove this member.
		if _, err := tx.ExecContext(ctx, deleteConversationMember, convo.ID, userID); err != nil {
			tx.Rollback()
			return fmt.Errorf("delete conversation member: %w", err)
		}
		if _, err := tx.ExecContext(ctx, deleteConversationReadState, convo.ID, userID); err != nil {
			tx.Rollback()
			return fmt.Errorf("delete conversation read state: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, deleteJoinRequestForEvent, eventID, userID); err != nil {
		tx.Rollback()
		return fmt.Errorf("delete join request: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit remove member: %w", err)
	}

	return nil
}

func (r *EventRepository) ListJoinRequests(ctx context.Context, eventID int64, includeApproved bool) ([]JoinRequestView, error) {
	event, err := r.GetEventByID(ctx, eventID)
	if err != nil {
		return nil, err
	}

	query := selectPendingJoinRequestsForEvent
	if includeApproved {
		query = selectPendingOrApprovedJoinRequestsForEvent
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

	// Populate conversation IDs for approved 1:1 requests after closing rows
	// (SQLite single-connection doesn't support nested queries while rows are open)
	if event.GroupType == "Single" {
		for i := range requests {
			if requests[i].Status != "approved" {
				continue
			}
			convo, err := r.findUserConversationForEvent(ctx, nil, eventID, requests[i].UserID)
			if err == nil && convo != nil {
				requests[i].ConversationID = &convo.ID
			}
		}
	}

	return requests, nil
}

func (r *EventRepository) ListJoinRequestsByUser(ctx context.Context, userID int64, includeApproved bool) ([]JoinRequestView, error) {
	query := selectPendingJoinRequestsForUser
	if includeApproved {
		query = selectPendingOrApprovedJoinRequestsForUser
	}

	rows, err := r.db.QueryContext(ctx, query, userID)
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
			UserID:    evt.UserID,
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

	// Append former message senders to participants only (not memberIDs)
	rows2, err := r.db.QueryContext(ctx, selectFormerMessageSenders, conversationID, conversationID)
	if err != nil {
		return nil, nil, fmt.Errorf("list former message senders: %w", err)
	}
	defer rows2.Close()
	for rows2.Next() {
		var p ConversationParticipant
		if err := rows2.Scan(&p.ID, &p.Name); err != nil {
			return nil, nil, fmt.Errorf("scan former message sender: %w", err)
		}
		participants = append(participants, p)
	}
	if err := rows2.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate former message senders: %w", err)
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

// Seed events disabled - no longer creating dummy data on startup
var seedEvents = []CreateEventParams{}

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
	var profileComplete int
	if err := r.db.QueryRowContext(ctx, selectUserByID, id).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.Password,
		&user.Gender,
		&user.Age,
		&user.Avatar,
		&profileComplete,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("lookup user by id: %w", err)
	}
	user.ProfileComplete = profileComplete == 1
	return &user, nil
}

type UpdateProfileParams struct {
	Name   string
	Gender *string
	Age    *int
	Avatar *string
}

func (r *EventRepository) UpdateUserProfile(ctx context.Context, userID int64, params UpdateProfileParams) (*User, error) {
	profileComplete := 1
	if _, err := r.db.ExecContext(ctx, updateUserProfile, params.Name, params.Gender, params.Age, params.Avatar, profileComplete, userID); err != nil {
		return nil, fmt.Errorf("update user profile: %w", err)
	}
	return r.GetUserByID(ctx, userID)
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

// CreateMutualBlock stores a bidirectional block relation between two users.
// The operation is idempotent.
func (r *EventRepository) CreateMutualBlock(ctx context.Context, userA, userB int64) error {
	if userA <= 0 || userB <= 0 {
		return fmt.Errorf("create mutual block: invalid user ids")
	}
	if userA == userB {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin mutual block tx: %w", err)
	}

	if _, err := tx.ExecContext(ctx, insertUserBlock, userA, userB); err != nil {
		tx.Rollback()
		return fmt.Errorf("insert block %d->%d: %w", userA, userB, err)
	}
	if _, err := tx.ExecContext(ctx, insertUserBlock, userB, userA); err != nil {
		tx.Rollback()
		return fmt.Errorf("insert block %d->%d: %w", userB, userA, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit mutual block: %w", err)
	}
	return nil
}

// DeleteMutualBlock removes both user->user block rows and reports whether
// either direction existed before deletion.
func (r *EventRepository) DeleteMutualBlock(ctx context.Context, userA, userB int64) (bool, error) {
	if userA <= 0 || userB <= 0 {
		return false, fmt.Errorf("delete mutual block: invalid user ids")
	}
	if userA == userB {
		return false, nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin delete mutual block tx: %w", err)
	}

	deletedAny := false

	resA, err := tx.ExecContext(ctx, deleteUserBlock, userA, userB)
	if err != nil {
		tx.Rollback()
		return false, fmt.Errorf("delete block %d->%d: %w", userA, userB, err)
	}
	rowsA, err := resA.RowsAffected()
	if err != nil {
		tx.Rollback()
		return false, fmt.Errorf("rows affected for delete block %d->%d: %w", userA, userB, err)
	}
	if rowsA > 0 {
		deletedAny = true
	}

	resB, err := tx.ExecContext(ctx, deleteUserBlock, userB, userA)
	if err != nil {
		tx.Rollback()
		return false, fmt.Errorf("delete block %d->%d: %w", userB, userA, err)
	}
	rowsB, err := resB.RowsAffected()
	if err != nil {
		tx.Rollback()
		return false, fmt.Errorf("rows affected for delete block %d->%d: %w", userB, userA, err)
	}
	if rowsB > 0 {
		deletedAny = true
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit delete mutual block: %w", err)
	}

	return deletedAny, nil
}

// HasMemberReport returns whether a host previously submitted a member report
// for the target user within the given event.
func (r *EventRepository) HasMemberReport(ctx context.Context, eventID, hostUserID, memberUserID int64) (bool, error) {
	var exists int
	err := r.db.QueryRowContext(
		ctx,
		selectMemberReportRelationship,
		eventID,
		hostUserID,
		memberUserID,
	).Scan(&exists)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("check member report relationship: %w", err)
	}
	return true, nil
}

func (r *EventRepository) DeleteMemberReport(ctx context.Context, eventID, reporterUserID, reportedUserID int64) error {
	_, err := r.db.ExecContext(ctx, deleteMemberReportByEventAndUsers, eventID, reporterUserID, reportedUserID)
	if err != nil {
		return fmt.Errorf("delete member report: %w", err)
	}
	return nil
}

// ListHostEventIDsForMember returns event IDs owned by hostUserID where
// memberUserID is currently an accepted participant (conversation member).
func (r *EventRepository) ListHostEventIDsForMember(ctx context.Context, hostUserID, memberUserID int64) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, selectHostEventIDsForMember, hostUserID, memberUserID)
	if err != nil {
		return nil, fmt.Errorf("list host event ids for member: %w", err)
	}
	defer rows.Close()

	eventIDs := make([]int64, 0)
	for rows.Next() {
		var eventID int64
		if err := rows.Scan(&eventID); err != nil {
			return nil, fmt.Errorf("scan host event id for member: %w", err)
		}
		eventIDs = append(eventIDs, eventID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate host event ids for member: %w", err)
	}
	return eventIDs, nil
}

// ListBlockedUserIDs returns all users blocked by blockerUserID.
func (r *EventRepository) ListBlockedUserIDs(ctx context.Context, blockerUserID int64) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, selectBlockedUserIDsForUser, blockerUserID)
	if err != nil {
		return nil, fmt.Errorf("list blocked users: %w", err)
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan blocked user id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate blocked users: %w", err)
	}
	return ids, nil
}

// IsUserBlocked reports whether blockerUserID blocks blockedUserID.
func (r *EventRepository) IsUserBlocked(ctx context.Context, blockerUserID, blockedUserID int64) (bool, error) {
	var exists int
	err := r.db.QueryRowContext(ctx, selectUserBlockRelationship, blockerUserID, blockedUserID).Scan(&exists)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("check block relationship: %w", err)
	}
	return true, nil
}

// AreUsersBlocked reports whether either user has blocked the other.
func (r *EventRepository) AreUsersBlocked(ctx context.Context, userA, userB int64) (bool, error) {
	if userA <= 0 || userB <= 0 || userA == userB {
		return false, nil
	}

	aBlocksB, err := r.IsUserBlocked(ctx, userA, userB)
	if err != nil {
		return false, err
	}
	if aBlocksB {
		return true, nil
	}

	bBlocksA, err := r.IsUserBlocked(ctx, userB, userA)
	if err != nil {
		return false, err
	}
	return bBlocksA, nil
}

// findUserConversationForEventPublic is a public wrapper around findUserConversationForEvent
// that doesn't require a transaction.
func (r *EventRepository) findUserConversationForEventPublic(ctx context.Context, eventID, userID int64) (*Conversation, error) {
	return r.findUserConversationForEvent(ctx, nil, eventID, userID)
}

// UpsertPushToken inserts or updates a push token for a user/device pair.
func (r *EventRepository) UpsertPushToken(ctx context.Context, userID int64, token, deviceID, platform string) error {
	_, err := r.db.ExecContext(ctx, upsertPushToken, userID, token, deviceID, platform)
	if err != nil {
		return fmt.Errorf("upsert push token: %w", err)
	}
	return nil
}

// DeletePushToken removes a specific push token for a user.
func (r *EventRepository) DeletePushToken(ctx context.Context, userID int64, token string) error {
	result, err := r.db.ExecContext(ctx, deletePushTokenByValue, userID, token)
	if err != nil {
		return fmt.Errorf("delete push token: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("push token not found")
	}
	return nil
}

// ListPushTokensByUser returns all push tokens for a user.
func (r *EventRepository) ListPushTokensByUser(ctx context.Context, userID int64) ([]PushToken, error) {
	rows, err := r.db.QueryContext(ctx, selectPushTokensByUserID, userID)
	if err != nil {
		return nil, fmt.Errorf("list push tokens: %w", err)
	}
	defer rows.Close()
	var tokens []PushToken
	for rows.Next() {
		var t PushToken
		if err := rows.Scan(&t.ID, &t.UserID, &t.Token, &t.DeviceID, &t.Platform, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan push token: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// ListPushTokensByUserIDs returns all push tokens for a set of user IDs.
func (r *EventRepository) ListPushTokensByUserIDs(ctx context.Context, userIDs []int64) ([]PushToken, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(userIDs))
	args := make([]any, len(userIDs))
	for i, id := range userIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	query := fmt.Sprintf(selectPushTokensByUserIDs, strings.Join(placeholders, ","))
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list push tokens by user ids: %w", err)
	}
	defer rows.Close()
	var tokens []PushToken
	for rows.Next() {
		var t PushToken
		if err := rows.Scan(&t.ID, &t.UserID, &t.Token, &t.DeviceID, &t.Platform, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan push token: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// ListConversationMemberIDs returns all user IDs that are members of a conversation.
func (r *EventRepository) ListConversationMemberIDs(ctx context.Context, conversationID int64) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, selectConversationMemberIDs, conversationID)
	if err != nil {
		return nil, fmt.Errorf("list conversation member ids: %w", err)
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan member id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListEventConversationMembers returns conversation-member pairs for every
// conversation linked to an event. This captures approved participants for both
// group events (single shared conversation) and 1:1 events (private per-user
// conversations).
func (r *EventRepository) ListEventConversationMembers(ctx context.Context, eventID int64) ([]EventConversationMember, error) {
	rows, err := r.db.QueryContext(ctx, selectEventConversationMembers, eventID)
	if err != nil {
		return nil, fmt.Errorf("list event conversation members: %w", err)
	}
	defer rows.Close()

	var members []EventConversationMember
	for rows.Next() {
		var member EventConversationMember
		if err := rows.Scan(&member.ConversationID, &member.UserID); err != nil {
			return nil, fmt.Errorf("scan event conversation member: %w", err)
		}
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate event conversation members: %w", err)
	}
	return members, nil
}
