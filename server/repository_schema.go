package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

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

const createTableAdminUsers = `
CREATE TABLE IF NOT EXISTS admin_users (
    user_id INTEGER PRIMARY KEY,
    granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
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
    cover_key TEXT NOT NULL DEFAULT 'sports-badminton-1',
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
    kind TEXT NOT NULL DEFAULT 'user',
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
INSERT INTO events (user_id, title, location, time, event_date, description, gender, min_age, max_age, date_label, group_type, cover_key, scheduled_at, place_id, latitude, longitude)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`

const updateEvent = `
UPDATE events
SET title = ?, location = ?, time = ?, event_date = ?, description = ?, gender = ?, min_age = ?, max_age = ?, date_label = ?, group_type = ?, cover_key = COALESCE(NULLIF(?, ''), cover_key), scheduled_at = ?, place_id = ?, latitude = ?, longitude = ?
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
INSERT INTO messages (conversation_id, sender_id, body, attachment_url, delivery_status, kind)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING id, conversation_id, sender_id, body, attachment_url, delivery_status, kind, created_at;
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
       OR datetime(e.scheduled_at) > datetime('now')
       OR (e.scheduled_at IS NULL AND e.event_date >= date('now')))
ORDER BY c.created_at DESC;
`

const selectMembersForConversation = `
SELECT user_id
FROM conversation_members
WHERE conversation_id = ?;
`

const selectParticipantsForConversation = `
SELECT cm.user_id, u.name, u.avatar
FROM conversation_members cm
JOIN users u ON u.id = cm.user_id
WHERE cm.conversation_id = ?
ORDER BY cm.joined_at ASC;
`

const selectFormerMessageSenders = `
SELECT DISTINCT m.sender_id, u.name, u.avatar
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = ?
  AND m.sender_id NOT IN (
    SELECT user_id FROM conversation_members WHERE conversation_id = ?
  )
ORDER BY m.sender_id ASC;
`

const selectMessagesForConversation = `
SELECT id, conversation_id, sender_id, body, attachment_url, delivery_status, kind, created_at
FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?;
`

const selectLatestMessageForConversation = `
SELECT id, conversation_id, sender_id, body, attachment_url, delivery_status, kind, created_at
FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC, id DESC
LIMIT 1;
`

const checkConversationMembership = `
SELECT 1
FROM conversation_members
WHERE conversation_id = ? AND user_id = ?
LIMIT 1;
`

const selectEvents = `
SELECT e.id, e.user_id, e.title, e.location, e.time, e.event_date, e.description, e.gender, e.min_age, e.max_age, e.date_label, e.group_type, e.cover_key, e.scheduled_at, e.place_id, e.latitude, e.longitude, e.created_at, u.name AS host_name, u.avatar AS host_avatar
FROM events e
JOIN users u ON u.id = e.user_id
ORDER BY e.event_date ASC, e.time ASC, e.created_at DESC;
`

const selectEventByID = `
SELECT e.id, e.user_id, e.title, e.location, e.time, e.event_date, e.description, e.gender, e.min_age, e.max_age, e.date_label, e.group_type, e.cover_key, e.scheduled_at, e.place_id, e.latitude, e.longitude, e.created_at, u.name AS host_name, u.avatar AS host_avatar
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

const selectUserPastEvents = `
SELECT DISTINCT e.id, e.user_id, e.title, e.location, e.time, e.event_date,
       e.description, e.gender, e.min_age, e.max_age, e.date_label,
       e.group_type, e.cover_key, e.scheduled_at, e.place_id, e.latitude, e.longitude, e.created_at,
       u.name AS host_name, u.avatar AS host_avatar
FROM events e
JOIN users u ON u.id = e.user_id
LEFT JOIN conversations c ON c.event_id = e.id
LEFT JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE (e.user_id = ? OR cm.user_id = ?)
  AND (
    (e.scheduled_at IS NOT NULL AND datetime(e.scheduled_at) < datetime('now'))
    OR (e.scheduled_at IS NULL AND e.event_date < date('now'))
  )
ORDER BY COALESCE(e.scheduled_at, e.event_date) DESC, e.created_at DESC;
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

const createTableHelpSubmissions = `
CREATE TABLE IF NOT EXISTS help_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    submission_type TEXT NOT NULL CHECK(submission_type IN ('contact','feedback')),
    message TEXT NOT NULL,
    urgent_safety_issue INTEGER NOT NULL DEFAULT 0,
    wants_reply INTEGER NOT NULL DEFAULT 0,
    reply_email TEXT,
    status TEXT NOT NULL CHECK(status IN ('new','reviewed','closed')) DEFAULT 'new',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
`

const createHelpSubmissionsUserIndex = `
CREATE INDEX IF NOT EXISTS help_submissions_user_idx
ON help_submissions (user_id, created_at DESC);
`

const createHelpSubmissionsAdminIndex = `
CREATE INDEX IF NOT EXISTS help_submissions_admin_idx
ON help_submissions (status, urgent_safety_issue, created_at DESC, id DESC);
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

const markProfileComplete = `
UPDATE users
SET profile_complete = ?
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
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name, u.avatar
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = ? AND r.status = 'pending'
ORDER BY r.created_at ASC;
`

const selectPendingOrApprovedJoinRequestsForEvent = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name, u.avatar
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = ? AND r.status IN ('pending', 'approved')
ORDER BY r.created_at ASC;
`

const selectPendingJoinRequestsForUser = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name, u.avatar
FROM conversation_join_requests r
JOIN users u ON u.id = r.user_id
WHERE r.user_id = ? AND r.status = 'pending'
ORDER BY r.created_at DESC;
`

const selectPendingOrApprovedJoinRequestsForUser = `
SELECT r.id, r.event_id, r.user_id, r.status, r.message, r.created_at, r.decided_at, r.decided_by, u.name, u.avatar
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

const insertHelpSubmission = `
INSERT INTO help_submissions (user_id, submission_type, message, urgent_safety_issue, wants_reply, reply_email)
VALUES (?, ?, ?, ?, ?, ?);
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

const createTableNotifications = `
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    event_id INTEGER,
    conversation_id INTEGER,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    payload TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    action_state TEXT NOT NULL DEFAULT 'active' CHECK(action_state IN ('active','resolved','unavailable')),
    action_reason TEXT,
    action_resolved_at DATETIME,
    join_request_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

const createNotificationsUserCreatedIndex = `
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
ON notifications (user_id, created_at DESC, id DESC);
`

const createNotificationsUserReadIndex = `
CREATE INDEX IF NOT EXISTS notifications_user_read_idx
ON notifications (user_id, read);
`

const createNotificationsUserActionReadIndex = `
CREATE INDEX IF NOT EXISTS notifications_user_action_read_idx
ON notifications (user_id, action_state, read);
`

const createNotificationsEventActionIndex = `
CREATE INDEX IF NOT EXISTS notifications_event_action_idx
ON notifications (event_id, type, action_state);
`

const createNotificationsConversationActionIndex = `
CREATE INDEX IF NOT EXISTS notifications_conversation_action_idx
ON notifications (conversation_id, type, action_state);
`

const createNotificationsJoinRequestActionIndex = `
CREATE INDEX IF NOT EXISTS notifications_join_request_action_idx
ON notifications (join_request_id, type, action_state);
`

const insertNotification = `
INSERT INTO notifications (
    user_id, type, event_id, conversation_id, title, body, payload, read,
    action_state, action_reason, action_resolved_at, join_request_id
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING id, user_id, type, event_id, conversation_id, title, body, payload, read,
          action_state, action_reason, action_resolved_at, join_request_id, created_at;
`

const selectNotificationsForUser = `
SELECT id, user_id, type, event_id, conversation_id, title, body, payload, read,
       action_state, action_reason, action_resolved_at, join_request_id, created_at
FROM notifications
WHERE user_id = ?
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?;
`

const countUnreadNotificationsForUser = `
SELECT COUNT(1)
FROM notifications
WHERE user_id = ? AND read = 0 AND action_state = 'active';
`

const markNotificationReadForUser = `
UPDATE notifications
SET read = 1
WHERE id = ? AND user_id = ? AND read = 0;
`

const markAllNotificationsReadForUser = `
UPDATE notifications
SET read = 1
WHERE user_id = ? AND read = 0;
`

const deleteAllNotificationsForUser = `
DELETE FROM notifications
WHERE user_id = ?;
`

const selectConversationMemberIDs = `
SELECT user_id
FROM conversation_members
WHERE conversation_id = ?;
`

const selectEventGroupTypeForOwner = `
SELECT group_type
FROM events
WHERE id = ? AND user_id = ?
LIMIT 1;
`

const selectDistinctNonHostEventMemberIDs = `
SELECT DISTINCT cm.user_id
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE c.event_id = ? AND cm.user_id <> ?
ORDER BY cm.user_id ASC;
`

const selectEventConversationMembers = `
SELECT cm.conversation_id, cm.user_id
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE c.event_id = ?
ORDER BY cm.conversation_id ASC, cm.user_id ASC;
`

const selectEventMembers = `
WITH event_users AS (
	SELECT e.user_id, 0 AS sort_group, e.created_at AS joined_at
	FROM events e
	WHERE e.id = ?
	UNION ALL
	SELECT cm.user_id,
		CASE
			WHEN cm.user_id = (SELECT user_id FROM events WHERE id = ?) THEN 0
			ELSE 1
		END AS sort_group,
		cm.joined_at
	FROM conversations c
	JOIN conversation_members cm ON cm.conversation_id = c.id
	WHERE c.event_id = ?
)
SELECT u.id, u.name, u.avatar
FROM event_users eu
JOIN users u ON u.id = eu.user_id
GROUP BY u.id, u.name, u.avatar
ORDER BY MIN(eu.sort_group) ASC, MIN(eu.joined_at) ASC, u.name COLLATE NOCASE ASC;
`

const selectConversationIDsForEvent = `
SELECT id
FROM conversations
WHERE event_id = ?
ORDER BY id ASC;
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

const deleteConversationsByEventID = `
DELETE FROM conversations
WHERE event_id = ?;
`

const deleteJoinRequestForEvent = `
DELETE FROM conversation_join_requests
WHERE event_id = ? AND user_id = ?;
`

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
	if _, err := r.db.ExecContext(ctx, createTableAdminUsers); err != nil {
		return fmt.Errorf("create admin_users table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableEvents); err != nil {
		return fmt.Errorf("create events table: %w", err)
	}
	if err := r.ensureEventCoverKeyColumn(ctx); err != nil {
		return err
	}
	if err := r.ensureValidEventCoverKeys(ctx); err != nil {
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
	if err := r.ensureEventLocationMetaColumns(ctx); err != nil {
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
	if err := r.ensureMessageKindColumn(ctx); err != nil {
		return err
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
	if _, err := r.db.ExecContext(ctx, createTableHelpSubmissions); err != nil {
		return fmt.Errorf("create help_submissions table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createHelpSubmissionsUserIndex); err != nil {
		return fmt.Errorf("create help_submissions user index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createHelpSubmissionsAdminIndex); err != nil {
		return fmt.Errorf("create help_submissions admin index: %w", err)
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
	if _, err := r.db.ExecContext(ctx, createTableNotifications); err != nil {
		return fmt.Errorf("create notifications table: %w", err)
	}
	if err := r.ensureNotificationActionColumns(ctx); err != nil {
		return err
	}
	if err := r.backfillNotificationActionState(ctx); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, createNotificationsUserCreatedIndex); err != nil {
		return fmt.Errorf("create notifications user_created index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createNotificationsUserReadIndex); err != nil {
		return fmt.Errorf("create notifications user_read index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createNotificationsUserActionReadIndex); err != nil {
		return fmt.Errorf("create notifications user_action_read index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createNotificationsEventActionIndex); err != nil {
		return fmt.Errorf("create notifications event_action index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createNotificationsConversationActionIndex); err != nil {
		return fmt.Errorf("create notifications conversation_action index: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createNotificationsJoinRequestActionIndex); err != nil {
		return fmt.Errorf("create notifications join_request_action index: %w", err)
	}
	if err := r.cleanupDuplicateSingleEventConversations(ctx); err != nil {
		return err
	}
	if err := r.cleanupOrphanedSingleEventConversations(ctx); err != nil {
		return err
	}
	return nil
}

// ensureNotificationActionColumns upgrades pre-action-state databases in
// place. The PRAGMA cursor is explicitly closed before ALTER TABLE statements;
// keeping it open can leave SQLite's schema locked during startup.
func (r *EventRepository) ensureNotificationActionColumns(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(notifications);`)
	if err != nil {
		return fmt.Errorf("inspect notifications table: %w", err)
	}

	columns := make(map[string]bool)
	for rows.Next() {
		var (
			cid        int
			name       string
			columnType string
			notNull    int
			defaultVal sql.NullString
			primaryKey int
		)
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &primaryKey); err != nil {
			rows.Close()
			return fmt.Errorf("scan notifications schema: %w", err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("iterate notifications schema: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close notifications schema cursor: %w", err)
	}

	definitions := []struct {
		name string
		sql  string
	}{
		{"action_state", `ALTER TABLE notifications ADD COLUMN action_state TEXT NOT NULL DEFAULT 'active' CHECK(action_state IN ('active','resolved','unavailable'));`},
		{"action_reason", `ALTER TABLE notifications ADD COLUMN action_reason TEXT;`},
		{"action_resolved_at", `ALTER TABLE notifications ADD COLUMN action_resolved_at DATETIME;`},
		{"join_request_id", `ALTER TABLE notifications ADD COLUMN join_request_id INTEGER;`},
	}
	for _, definition := range definitions {
		if columns[definition.name] {
			continue
		}
		if _, err := r.db.ExecContext(ctx, definition.sql); err != nil {
			return fmt.Errorf("add notifications %s column: %w", definition.name, err)
		}
	}
	return nil
}

// backfillNotificationActionState safely classifies unambiguous legacy rows.
// Ambiguous request rows with any pending request remain active for the
// tap-time resolver introduced in the next implementation phase.
func (r *EventRepository) backfillNotificationActionState(ctx context.Context) error {
	statements := []struct {
		name string
		sql  string
	}{
		{
			"missing join-request event",
			`UPDATE notifications
			 SET action_state = 'unavailable', action_reason = 'event_deleted',
			     action_resolved_at = COALESCE(action_resolved_at, CURRENT_TIMESTAMP), read = 1
			 WHERE action_state = 'active' AND type = 'join_request.created'
			   AND (event_id IS NULL OR NOT EXISTS (SELECT 1 FROM events e WHERE e.id = notifications.event_id));`,
		},
		{
			"resolved legacy join request",
			`UPDATE notifications
			 SET action_state = 'resolved', action_reason = NULL,
			     action_resolved_at = COALESCE(action_resolved_at, CURRENT_TIMESTAMP), read = 1
			 WHERE action_state = 'active' AND type = 'join_request.created'
			   AND EXISTS (SELECT 1 FROM events e WHERE e.id = notifications.event_id AND e.user_id = notifications.user_id)
			   AND NOT EXISTS (
			       SELECT 1 FROM conversation_join_requests r
			       WHERE r.event_id = notifications.event_id AND r.status = 'pending'
			   );`,
		},
		{
			"missing conversation",
			`UPDATE notifications
			 SET action_state = 'unavailable', action_reason = 'conversation_deleted',
			     action_resolved_at = COALESCE(action_resolved_at, CURRENT_TIMESTAMP), read = 1
			 WHERE action_state = 'active' AND type IN ('chat.message', 'join_request.approved')
			   AND (conversation_id IS NULL OR NOT EXISTS (
			       SELECT 1 FROM conversations c WHERE c.id = notifications.conversation_id
			   ));`,
		},
	}
	for _, statement := range statements {
		if _, err := r.db.ExecContext(ctx, statement.sql); err != nil {
			return fmt.Errorf("backfill notification action state (%s): %w", statement.name, err)
		}
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

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN cover_key TEXT NOT NULL DEFAULT 'sports-badminton-1';`); err != nil {
		return fmt.Errorf("add cover_key column: %w", err)
	}
	return nil
}

func (r *EventRepository) ensureValidEventCoverKeys(ctx context.Context) error {
	options := listCoverOptions()
	if len(options) == 0 {
		return nil
	}

	placeholders := make([]string, len(options))
	args := make([]any, 0, len(options)+1)
	args = append(args, defaultCoverKey)
	for i, option := range options {
		placeholders[i] = "?"
		args = append(args, option.Key)
	}

	query := fmt.Sprintf(
		`UPDATE events SET cover_key = ? WHERE TRIM(cover_key) = '' OR cover_key NOT IN (%s);`,
		strings.Join(placeholders, ","),
	)
	if _, err := r.db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("backfill invalid cover_key values: %w", err)
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

// ensureMessageKindColumn adds the `kind` column to messages for distinguishing
// user-authored messages ('user') from system-generated messages ('system'),
// such as join announcements ("X joined the plan") and event-update notices
// ("Updated Event Detail" historically, now "Plan details updated"). The column defaults to
// 'user', and existing system
// rows are backfilled so the unread-count exclusion (see countUnreadMessages)
// applies retroactively — clearing phantom badges left over from before the
// migration.
//
// The backfill runs ONCE, immediately after the ALTER. On subsequent starts
// the column exists and we early-return; that's safe because each row already
// has its correct kind (system rows got 'system' on the first migration, and
// new rows get the right value at insert time). We must call rows.Close()
// before any subsequent ExecContext on this db — the rows iterator holds a
// connection, and SQLite serialises writes on the same DB, so an in-flight
// rows cursor over a PRAGMA result blocks the follow-up ALTER/UPDATE. See
// the matching pattern in ensureEventGroupTypeColumn.
func (r *EventRepository) ensureMessageKindColumn(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(messages);`)
	if err != nil {
		return fmt.Errorf("inspect messages table: %w", err)
	}

	hasKind := false
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
			rows.Close()
			return fmt.Errorf("scan messages schema: %w", err)
		}
		if name == "kind" {
			hasKind = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("iterate messages schema: %w", err)
	}
	rows.Close()

	if hasKind {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'user';`); err != nil {
		return fmt.Errorf("add kind column: %w", err)
	}

	// Backfill existing system rows now that every row has kind='user' (the
	// column default). Both patterns are server-authored constants (no
	// user-controllable path produces these bodies), so pattern matching is
	// safe. Both event-update bodies are exact-matched fixed server constants;
	// Join announcements used "<Name> joined the chat" historically and now use
	// "<Name> joined the plan". Preserve both patterns for upgraded databases.
	if _, err := r.db.ExecContext(ctx, `
UPDATE messages SET kind = 'system'
WHERE kind = 'user'
  AND (
    body IN ('Updated Event Detail', 'Plan details updated')
    OR body LIKE '% joined the chat'
    OR body LIKE '% joined the plan'
  );
`); err != nil {
		return fmt.Errorf("backfill system message kinds: %w", err)
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

func (r *EventRepository) ensureEventLocationMetaColumns(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(events);`)
	if err != nil {
		return fmt.Errorf("inspect events table: %w", err)
	}
	defer rows.Close()

	hasPlaceID := false
	hasLatitude := false
	hasLongitude := false
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
		switch name {
		case "place_id":
			hasPlaceID = true
		case "latitude":
			hasLatitude = true
		case "longitude":
			hasLongitude = true
		}
		if hasPlaceID && hasLatitude && hasLongitude {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate events schema: %w", err)
	}

	if !hasPlaceID {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN place_id TEXT;`); err != nil {
			return fmt.Errorf("add place_id column: %w", err)
		}
	}
	if !hasLatitude {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN latitude REAL;`); err != nil {
			return fmt.Errorf("add latitude column: %w", err)
		}
	}
	if !hasLongitude {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN longitude REAL;`); err != nil {
			return fmt.Errorf("add longitude column: %w", err)
		}
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
