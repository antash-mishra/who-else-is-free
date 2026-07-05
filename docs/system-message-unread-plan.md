# Plan: Stop badging system messages as unread (long-term)

## Problem

System-generated chat rows — `"X joined the chat"` (join approval) and `"Updated Event Detail"` (event edit) — are persisted as ordinary `messages` with no kind/type field. They flow through `message:new` and the server's `countUnreadMessages` exactly like real user messages, so they bump `unreadCount` and trigger the red dot + bold unread styling on every conversation row. This is wrong: these aren't messages the recipient needs to "read."

## Root cause

The `messages` schema and `Message`/`ChatMessage` types have **no concept of a message kind**. Everything is treated as a user-authored message. Two call sites produce system content but can't be distinguished from real chat:

1. `server/chat_hub.go:1438` `postJoinAnnouncement` → `"X joined the chat"`
2. `server/handler.go:428` `emitEventUpdateChatMessages` → `"Updated Event Detail"`

Both call `CreateMessage` + `emitChatMessage`, which broadcasts `message:new`. The client (`src/context/ChatContext.tsx:543`) bumps `unreadCount` for any incoming `message:new` not from self / not on the active conversation. The server (`repository_chat.go:962` `countUnreadMessages`) counts every non-self message past the read cursor — so a `refreshConversations` re-adds the badge even if we fix the live WS path.

## Goal

A first-class **message kind** taxonomy so system messages are distinguishable end-to-end, and unread badge/push logic is anchored on kind rather than sender heuristics. This is the foundation for any future system-message rendering (italic, centered, no avatar) and other kinds (e.g. `announcement`).

- **DB:** `messages.kind` column, default `'user'`, values `'user' | 'system'`.
- **Server:** `CreateMessageParams.Kind`, payload `kind`, exclude `system` from unread count.
- **Client:** `ChatMessage.kind`, skip unread bump for `system` in the `message:new` handler.
- **Migration:** backfill existing system rows; existing phantom badged conversations clear on next refresh.

## Non-goals (out of scope, but enabled by this)

- Distinct rendering of system messages in `ChatThreadScreen` (keep current inline rendering).
- Changing `lastMessage` preview (system messages still appear as preview — acceptable and informative).
- The event-recency filter in `selectConversationsForUser` (separate issue).

---

## Step 1 — Schema: add `messages.kind`

**`server/repository_schema.go`**

1. `createMessagesTable`: add column
   ```sql
   kind TEXT NOT NULL DEFAULT 'user'
   ```
2. `insertMessage`: add `kind` to the INSERT + RETURNING.
3. `selectMessagesForConversation`, `selectLatestMessageForConversation`: add `kind` to SELECT.
4. New migration helper: `ensureMessageKindColumn` (follow the `ensureEventGroupTypeColumn` pattern at `repository_schema.go:948`). ALTER TABLE add column, then **backfill existing system rows**:
   ```sql
   UPDATE messages SET kind = 'system'
   WHERE body = 'Updated Event Detail'
      OR body LIKE '% joined the chat';
   ```
   (Exact-match `Updated Event Detail` since it's a constant; `LIKE '% joined the chat'` for join announcements. Both are server-authored constants, so pattern matching is safe — no user can type these as their message body through any code path.)
5. Wire it into the migration sequence near `repository_schema.go:697` alongside the other `ensure*Column` calls.

Add a Go-side constant set in `server/models.go`:
```go
type MessageKind string
const (
    MessageKindUser   MessageKind = "user"
    MessageKindSystem MessageKind = "system"
)
```

## Step 2 — Server models

**`server/models.go`**
- `Message`: add `Kind MessageKind \`json:"kind"\`` (default serialized; old clients ignore unknown field).
- `MessageSummary`: add `Kind MessageKind`.
- `CreateMessageParams`: add `Kind MessageKind` (callers that omit default via `MessageKindUser`).

## Step 3 — Server repository

**`server/repository_chat.go`**
- `CreateMessage`: read `params.Kind`, insert it, scan it back.
- `ListMessages`: scan `kind` into `Message.Kind`.
- `fetchLatestMessage`: scan `kind` into `MessageSummary.Kind`.
- **`countUnreadMessages`**: change the count query to exclude system messages:
  ```sql
  SELECT COUNT(1) FROM messages
  WHERE conversation_id = ? AND id > ? AND sender_id <> ? AND kind <> 'system'
  ```
  This is the server-side fix that survives `refreshConversations`.

Use a tolerant scan (default to `'user'` if column missing) only if needed for the migration window — but since `ensureMessageKindColumn` runs before any reads in `Init`, a hard scan is fine. Match the existing scan style.

## Step 4 — Server system-message producers

Tag the two system-message creators with `Kind: MessageKindSystem`:

- **`server/handler.go:428`** `emitEventUpdateChatMessages` — `CreateMessageParams{ ..., Kind: MessageKindSystem }`.
- **`server/chat_hub.go:1438`** `postJoinAnnouncement` — same.

Keep `emitApprovedIntroMessage` as `user` (it replays the requester's real intro — genuine user content). Looking at the code: `emitApprovedIntroMessage` calls `ListMessages` and re-emits the latest persisted message if it matches the intro. It doesn't create a new row — it broadcasts an existing `user` message. So no change needed there. The joiner's intro remains a `user` message with `senderID = joiner`, correctly unread for the host. **Decision: leave as `user`.**

## Step 5 — Server WS payload

**`server/chat_hub.go:113`** `messagePayload`: add `Kind string \`json:"kind"\``.
**`server/chat_hub.go:1252`** `emitChatMessage`: set `Kind: string(msg.Kind)`.

## Step 6 — Client types + mapper

**`src/api/mappers/chat.ts`**
- `ChatMessage`: add `kind: 'user' | 'system'`.
- `mapServerMessage`: read `kind` from the server payload, default `'user'`.

## Step 7 — Client unread logic

**`src/context/ChatContext.tsx:543`** — in the `message:new` handler, gate the `unreadCount` bump on kind:

```ts
unreadCount:
  message.kind === 'system' ||
  message.senderId === currentUserId ||
  conversation.id === currentActiveConversationId
    ? 0
    : (conversation.unreadCount ?? 0) + 1,
```

No other client change needed. The shared `UnreadDot`/bold styling in `MessagesScreen` and `JoinRequestsScreen` already keys off `conversation.unreadCount`, which now never increments for system messages — so 1:1 and group behave identically.

## Step 8 — Tests

**Server (`server/api_integration_test.go` and/or `repository_chat_test.go`):**
1. Extend `TestUpdateSingleToGroupCreatesConversationForJoinRequest` (or a new test): after editing a **future-dated** Single event, assert each approved private conversation's requester (not the host) sees `unread_count == 0` on the `"Updated Event Detail"` message — proving 1:1 parity.
2. Mirror for group: assert a non-host member of an edited group event sees `unread_count == 0` for the update message.
3. Assert the persisted message row has `kind = 'system'` for both join-announcement and event-update.
4. Assert a real `user` message still bumps `unread_count` (regression guard).
5. Join-approval flow: assert other existing members of a group conversation don't get `unread_count` bumped by `"X joined the chat"`.

**Client (`src/context/__tests__/`):**
6. `message:new` with `kind: 'system'` does **not** increment `unreadCount` (and doesn't mark the conversation for unread styling).
7. `message:new` with `kind: 'user'` (default) still increments as before.

## Step 9 — Validation

- `cd server && go test ./...`
- `npm run typecheck`
- `npm test -- --runInBand --silent`
- Manual smoke: edit a group event and a 1:1 event on the emulator; confirm no red dot / bold appears on the affected conversations for non-host members; confirm host still sees `unread_count == 0`; confirm real messages still badge.

---

## File change summary

| File | Change |
|---|---|
| `server/repository_schema.go` | `kind` column, INSERT/SELECT updates, `ensureMessageKindColumn` migration + backfill, wire into `Init` |
| `server/models.go` | `MessageKind` constants; `Kind` field on `Message`, `MessageSummary`, `CreateMessageParams` |
| `server/repository_chat.go` | `CreateMessage`/`ListMessages`/`fetchLatestMessage` read+scan `kind`; `countUnreadMessages` excludes `kind = 'system'` |
| `server/handler.go` | `emitEventUpdateChatMessages` sets `Kind: MessageKindSystem` |
| `server/chat_hub.go` | `messagePayload.Kind`; `emitChatMessage` includes it; `postJoinAnnouncement` sets `Kind: MessageKindSystem` |
| `src/api/mappers/chat.ts` | `ChatMessage.kind`; `mapServerMessage` reads it |
| `src/context/ChatContext.tsx` | `message:new` handler skips `unreadCount++` for `kind === 'system'` |
| `server/api_integration_test.go` (+ repo tests) | parity + kind assertions |
| `src/context/__tests__/*` | client unread-skip test |

## Why this is the long-term solution

- First-class taxonomy, not a boolean bolt-on — extensible to future kinds (`announcement`, `moderation`, etc.).
- Anchored at the data layer, so every consumer (live WS, REST sync, push, future rendering) reads one source of truth.
- Survives refresh/reconnect: server-side `countUnreadMessages` excludes system messages, so the badge can't reappear after `refreshConversations`.
- Migration cleans up existing phantom badges (backfill + recomputed count).
- Decouples "badges unread" from "renders in thread / appears as last-message preview" — those stay as-is today and become independently tunable later via the same `kind` field.
