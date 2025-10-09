# Chat System – Stage 0 Deliverables

This document captures the groundwork required before building the staged chat feature. It aligns the temporary login flow with the eventual Google Sign-In rollout, sketches the shared data model, and defines environment configuration needed by the server and Expo clients.

## 1. Authentication Transition Plan

- **Current state**: `/api/login` accepts email/password pairs for three seeded demo users stored in `users` with plain-text passwords.
- **Interim token**: Issue short-lived signed tokens (HMAC SHA-256) once a user signs in. The token payload should include `user_id`, `email`, `issued_at`, and `expires_at`. Store the signing secret in a new env var `CHAT_SESSION_SECRET`. REST endpoints and the WebSocket upgrader will require this token via `Authorization: Bearer <token>`.
- **Mapping to Google Sign-In**:
  - When Google auth lands, persist each Google account by adding a `google_accounts` table containing `user_id`, `google_sub`, `email`, and `picture_url`.
  - Retain existing `users` rows by reusing the email address: during first Google login, either migrate the seeded row (matching email) or create a fresh user and mark the seeded ones as placeholders.
  - Replace `/api/login` with `/api/auth/google/exchange` that validates Google ID tokens and mints the same signed chat session token.
  - Tokens stay unchanged for clients; only the issuer backend logic swaps from password auth to Google ID-token validation.
- **Presence and session expiry**: choose a default TTL (e.g., 12 hours) for the session token. The presence service will treat a disconnected socket as “offline” immediately, but also expire presence when the token expires.

## 2. Chat Data Model Sketch

The chat schema will live in `event.sqlite` alongside existing tables. SQL draft:

```sql
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

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

CREATE INDEX messages_conversation_created_idx ON messages(conversation_id, created_at DESC);
```

### REST + WebSocket payloads

- **Conversation summary** (`GET /api/conversations`):
  ```json
  {
    "id": 42,
    "title": "Runner Buddies",
    "lastMessage": { "id": 1337, "body": "See you at 7!", "createdAt": "2025-10-06T18:42:00Z" },
    "unreadCount": 3,
    "members": [{ "id": 1, "name": "Ava" }, { "id": 2, "name": "Liam" }]
  }
  ```
- **WebSocket events**:
  - `message:new` – broadcast when a message persists.
  - `message:history` – server response to a client history request (`limit`, `before_id`).
  - `presence:update` – emitted when members go online/offline (Stage 3).
  - `system:error` – send explicit reason codes for auth failures or rate limits.
- **Client → server commands**:
  - `message:send` `{ "conversationId": 42, "tempId": "uuid", "body": "Hello" }`
  - `conversation:join` / `conversation:leave`
  - `typing:start` / `typing:stop` (Stage 3)

## 3. Environment Configuration Plan

| Name | Scope | Purpose |
| --- | --- | --- |
| `CHAT_SESSION_SECRET` | Server | HMAC secret for issuing & verifying chat tokens. |
| `CHAT_WS_PATH` (default `/api/ws`) | Server & Client | Keeps socket endpoint configurable for prod/staging. |
| `CHAT_MAX_CONNECTIONS` | Server | Optional guardrail to protect resources in MVP. |
| `EXPO_PUBLIC_API_BASE_URL` | Client | Already present; reused for chat REST calls. |
| `EXPO_PUBLIC_WS_BASE_URL` | Client | Base URL for WebSocket (e.g., `ws://localhost:8080`). |
| `EXPO_PUBLIC_CHAT_ENABLED` | Client | Feature flag to hide chat UI until Stage 1 is deployed. |

**Local development defaults**
- Server runs on port 8080 → websocket URL `ws://localhost:8080/api/ws`.
- Expo Go needs `EXPO_PUBLIC_WS_BASE_URL` pointing to `ws://<LAN IP>:8080` when testing on device.
- Document any differences in `README` once the MVP is ready.

---

### Next Steps
1. Add migration helpers in `EventRepository.Init` to create the chat tables from the SQL above.
2. Implement token issuing & middleware using `CHAT_SESSION_SECRET`.
3. Build the Stage 1 WebSocket hub and minimal React context leveraging the schema/payload contract.
