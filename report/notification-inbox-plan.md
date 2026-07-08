# Notification Inbox — Implementation Plan

**Status:** Ready to implement
**Last updated:** 2026-07-08
**Scope:** Full inbox (Option A) — server-backed notification history + a `Notifications` screen reachable from a bell `IconButton` in the Profile screen header.

---

## Goal

Persist every push notification server-side into a `notifications` table and expose a "Notifications" inbox screen reachable from a new bell `IconButton` in the Profile screen header. The inbox shows a server-backed, paginated, dated list with unread markers and tap-to-navigate (the same routing logic the push tap already uses). It also displays friendlier text for the three "harsh" scenarios.

The plan is sequenced so each step is independently testable. Touch ordering follows the AGENTS.md refactor order (backend first, then API mappers, then context, then UI, then wiring).

---

## Confirmed Decisions

1. **Read semantics** ✅ — Row-by-row tap marks a notification read, plus a "Mark all as read" header action. Opening the inbox alone does **not** clear unread.
2. **Pagination** ✅ — Offset-based (`?limit=20&offset=`). Matches existing list endpoints.
3. **Bell placement** ✅ — Top-right of the `Account`/`Profile` header row (next to the title), as per the Figma.
4. **Badge style** ✅ — `CountBadge` (as-is, secondary palette) showing the numeric unread count when >0. No badge when 0. Reuses the existing component verbatim — no destructive-tone variant introduced now; revisit only if a red unread badge is explicitly requested.
5. **Override rows navigate (inbox-only)** ✅ — `join_request.denied`, `event.member_removed`, and `event.deleted` rows navigate to `Main → Events` (event discovery) on tap. The OS push-tap path stays **unchanged** (see decision #8) — inbox routing and push-tap routing are deliberately separate code paths so existing push recipients see byte-for-byte identical tap behavior.
6. **Guest state** ✅ — Hide the bell entirely when signed out.
7. **Persistence is best-effort, push delivery never blocks** ✅ — `recordAndSendPushToUser[s]` inserts the `Notification` row first, then dispatches FCM. On row-insert failure: log and proceed to send the push (never degrade push delivery). On FCM failure: row is retained (the inbox still shows the notification). Mirror today's fire-and-forget + log-on-error pattern.
8. **Push-tap routing is frozen** ✅ — `routeFromNotification` is extracted as the **inbox** helper; the existing `handleNotificationTap` in `src/context/pushRouting.ts` keeps its current routing for OS push taps (incl. `join_request.denied → Messages`). No unified-helper refactor that would silently change push-tap landing screens.
9. **Live badge, lazy list** ✅ — Foreground `onMessage` refreshes only the unread **count** (cheap `GET /api/notifications/unread-count`); the full paginated list is loaded on inbox open, pull-to-refresh, and `loadMore` (not on every `onMessage`).
10. **Optimistic markRead re-syncs count only** ✅ — `markRead`/`markAllRead` flip rows in place + adjust `unreadCount` optimistically, then re-sync **only** the count post-hoc (a count fetch), not the visible list. The visible list is reconciled on inbox open / pull-to-refresh, preventing mid-session scroll flicker from newer rows arriving.
11. **Account-deletion cleanup** ✅ — `repository_accounts.go` deletes `notifications WHERE user_id = ?` inside the existing account-deletion transaction (next to the push_tokens delete).
12. **markAllRead reconciles page 1** ✅ — `markAllRead` clears all rows server-side; client flips visible rows optimistically in place, then refetches page 1 (now all read) to reconcile the paginated state.

---

## Friendly-Text Translation Table

| Push `type` | Push body (OS notification) — unchanged | Inbox body shown in `NotificationsScreen` |
|---|---|---|
| `chat.message` | `<senderName>: <body preview>` | same (verbatim) |
| `join_request.created` | `<name> wants to join your event` | same (verbatim) |
| `join_request.approved` | `Your request to join was approved!` | same (verbatim) |
| `join_request.denied` | `Your request to join was declined` | **`This event is no longer available to you. Explore other events nearby.`** |
| `event.member_removed` | `The host removed you from this event.` | **`You no longer have access to this event. Explore other events nearby.`** |
| `event.deleted` | `The host deleted this event.` | **`This event has been cancelled and is no longer available. Explore other events nearby.`** |

The overrides are independent of the raw push body (which stays exactly as today for OS notifications), so behavior for existing push recipients is preserved byte-for-byte. Inbox display text is owned server-side in `notification_payloads.go`.

---

## Current Notification Landscape (Audit)

Notifications today are **push-only via FCM** (data-only payloads). There is no in-app notification log/inbox — no `notifications` table, no `Notifications` screen, no `Notif` route in `src/navigation/types.ts`. When a push arrives:

- **App in background/quit** → OS shows the system notification; tapping it routes via `handleNotificationTap` in `src/context/pushRouting.ts`.
- **App in foreground** → `onMessage` in `PushContext.tsx` is a silent no-op (chat unread counts update via WS in `ChatContext`).

So today there is nothing to view in-app — once dismissed, a notification is gone. This plan adds the missing persistence layer.

### The 6 triggering scenarios (all server-side)

| # | `type` | Triggered when | Sent to | Code location |
|---|--------|-----------------|---------|---------------|
| 1 | `chat.message` | A chat message is sent in a conversation | All other conversation members (skips sender + active-conversation viewer) | `chat_hub.go:1291` (`sendPushForChatMessage`) |
| 2 | `join_request.created` (Group) | A user requests to join a Group event | Event host | `chat_hub.go:835` |
| 3 | `join_request.created` (1:1) | A user requests to join a 1:1 event | Event host | `chat_hub.go:844` |
| 4 | `join_request.approved` | Host approves a join request | The requester | `chat_hub.go:1029` |
| 5 | `join_request.denied` | Host denies a join request | The requester | `chat_hub.go:1109` |
| 6 | `event.member_removed` | Host removes a member from an event | The removed user | `chat_hub.go:1229` |
| 7 | `event.deleted` | Event is deleted by host OR account deletion cascades hosted events | All members of deleted event(s) | `handler.go:530`, `profile_handler.go:136` |

(There is also a `test` type fired only by the dev `POST /api/push/test` endpoint — not user-facing, out of scope for the inbox.)

### Push tap routing (current, in `src/context/pushRouting.ts`)

| `type` | Navigates to |
|---|---|
| `chat.message` | `ChatThread` (sets active conversation) |
| `join_request.created` | `JoinRequests` (group) or `EventDetails` (1:1) |
| `join_request.approved` | `ChatThread` |
| `join_request.denied` | `Main → Messages` |
| `event.member_removed` | `Main → Events` |
| `event.deleted` | `Main → Events` |

The inbox will reuse this same routing logic (extracted into a shared helper) so tapping a row behaves identically to tapping the OS notification.

---

## Implementation Steps

### Step 1 — Backend: schema + model + repository methods

**Files:**

- `server/models.go` — add `Notification` struct:
  ```go
  type Notification struct {
      ID             int64     `json:"id"`
      UserID         int64     `json:"user_id"`
      Type           string    `json:"type"`
      EventID        *int64    `json:"event_id,omitempty"`
      ConversationID *int64    `json:"conversation_id,omitempty"`
      Title          string    `json:"title"`
      Body           string    `json:"body"`
      Payload        string    `json:"payload,omitempty"`
      Read           bool      `json:"read"`
      CreatedAt      time.Time `json:"created_at"`
  }
  ```
- `server/repository_schema.go` — add:
  - `createTableNotifications` (id, user_id FK, type, event_id NULL, conversation_id NULL, title, body, payload TEXT, read INTEGER DEFAULT 0, created_at)
  - `createNotificationsUserCreatedIndex` (user_id, created_at DESC)
  - `createNotificationsUserReadIndex` (user_id, read) for unread count
  - Wire table + both indexes into `func (r *EventRepository) EnsureSchema` near the push_tokens block.
- New file `server/repository_notifications.go` with `Notification` repo methods:
  - `CreateNotification(ctx, Notification) (Notification, error)`
  - `ListNotifications(ctx, userID, limit, offset) ([]Notification, error)` — ordered `created_at DESC`, id tie-break
  - `CountUnreadNotifications(ctx, userID) (int, error)`
  - `MarkNotificationRead(ctx, userID, id) error` — scoped to user
  - `MarkAllNotificationsRead(ctx, userID) error`
- `server/repository_accounts.go` — on account deletion, also `DELETE FROM notifications WHERE user_id = ?` inside the existing transaction (next to the push_tokens delete).

**Tests:** `server/repository_notifications_test.go` against in-memory SQLite — create + list ordering + unread count + mark-one + mark-all + user-scoping (cannot read another user's row).

---

### Step 2 — Backend: notification payloads + display text map + persistence

**Files:**

- New file `server/notification_payloads.go` — declares:
  - `NotificationType*` constants (`chat.message`, `join_request.created`, `join_request.approved`, `join_request.denied`, `event.member_removed`, `event.deleted`).
  - A helper `buildNotification(type, eventID, conversationID, title, body, payload)` returning a `Notification{...}`.
  - A map `notificationDisplayTexts` keyed by type, holding the **inbox-display** title/body. For the three override cases (see Friendly-Text Translation Table); all others use the raw push body verbatim.
- Persist rows at every existing push call site via two `*ChatHub` helpers (best-effort; see Confirmed Decision #7):
  - `recordAndSendPushToUser(userID, type, eventID, conversationID, title, body, data)` — single recipient.
  - `recordAndSendPushToUsers(userIDs, type, eventID, conversationID, title, body, data)` — multi-recipient; iterates **unique** `userIDs` inserting one `Notification` row per recipient (one row per user, not per token) in a single `ctx`, non-transactional like today's FCM sends, then delegates to existing `sendPushToUsers`.
  Both insert the row first (with the inbox display body swapped in from `notificationDisplayTexts`), then dispatch FCM with the raw `map[string]string` push payload — **unchanged wire behavior for OS notifications**. Keep push-tap routing **untouched**: existing `handleNotificationTap` in `src/context/pushRouting.ts` keeps its current per-type navigation (incl. `join_request.denied → Messages`); the inbox gets its own helper (Step 6).

**Migrate call sites** (move inline `map[string]string` payloads into the new recorder):

| File | Line | Type | Notes |
|---|---|---|---|
| `chat_hub.go` | 835 | `join_request.created` | Group |
| `chat_hub.go` | 844 | `join_request.created` | 1:1 |
| `chat_hub.go` | 1029 | `join_request.approved` | |
| `chat_hub.go` | 1109 | `join_request.denied` | ← text override |
| `chat_hub.go` | 1229 | `event.member_removed` | ← text override |
| `chat_hub.go` | 1291 | `chat.message` | per-recipient insert inside `sendPushForChatMessage`; one `Notification` row per recipient |
| `handler.go` | 530 | `event.deleted` | ← text override; multi-recipient (`recordAndSendPushToUsers`); one row per recipient |
| `profile_handler.go` | 136 | `event.deleted` | ← text override; multi-recipient (`recordAndSendPushToUsers`); one row per recipient |

**Tests:** extend `server/api_integration_test.go` mock push sender path; assert `GET /api/notifications` returns rows after each scenario, including the three overridden bodies.

---

### Step 3 — Backend: HTTP endpoints

**File: new `server/notification_handler.go`** (`NotificationHandler`):

- `GET /api/notifications?limit=&offset=` → `{ notifications: [...] }` (define `NotificationView` with the inbox body already mapped).
- `POST /api/notifications/:id/read` → 204 on success / 404 if not found or not owner.
- `POST /api/notifications/read-all` → 204.
- `GET /api/notifications/unread-count` → `{ count: int }`.

**Router:** in `server/router.go`, add `NewNotificationHandler(eventHandler.repo).RegisterRoutes(protected)` alongside the push-token routes.

**Tests:** `server/notification_handler_test.go` — auth, list pagination, mark-one, mark-all, unread count, cross-user isolation.

---

### Step 4 — Frontend: API types + mapper

**New file `src/api/mappers/notifications.ts`:**

- `ApiNotification` type mirroring the server `NotificationView`.
- `AppNotification` domain type: `{ id, type, eventId?, conversationId?, title, body, read, createdAt }`.
- `mapNotification(raw): AppNotification` and `mapNotifications(list)`.

Body text is finalized server-side, so the client stays a pure renderer — no payload construction on the client.

---

### Step 5 — Frontend: NotificationsContext

**New file `src/context/NotificationsContext.tsx`:**

- Provider value: `{ notifications, unreadCount, loading, refreshing, error, refresh, loadMore, refreshUnreadCount(), markRead(id), markAllRead() }` (`refreshUnreadCount` is the cheap count-only fetch used by foreground `onMessage`).
- Uses `requestJson` from `@api/client` and `useAuth` for the token.
- `fetchInitial` loads page 1 + unread count; `loadMore` appends next page using offset.
- `markRead(id)` optimistically flips the row's `read=true` and decrements `unreadCount`, then re-syncs **only** the count (`GET /api/notifications/unread-count`) — not the visible list — to avoid mid-session scroll flicker (see Confirmed Decision #10).
- `markAllRead()` flips all visible rows + sets `unreadCount` to 0 optimistically, then clears all rows server-side and refetches **page 1** (now all read) to reconcile the paginated state (Confirmed Decision #12).
- On `user` becoming null (sign-out), clears state.
- Mount this provider in `App.tsx` next to `PushProvider`, gated on `user != null` (mirrors chat/push providers).

---

### Step 6 — Frontend: push tap + foreground refresh wiring

- `src/context/pushRouting.ts` — `PushData` is unchanged (already covers all types). Add a **separate** inbox-only `routeFromNotification(notification, navigation, setActiveConversation)` helper used by `NotificationsScreen` rows. It mirrors `handleNotificationTap` for the verbatim cases but lands override rows on `Main → Events`:
  - `chat.message` → `ChatThread` (sets active conversation) — same as push tap.
  - `join_request.created` → `JoinRequests` (group) or `EventDetails` (1:1) — same as push tap.
  - `join_request.approved` → `ChatThread` — same as push tap.
  - `join_request.denied` → `Main → Events`.
  - `event.member_removed` → `Main → Events` — same as push tap.
  - `event.deleted` → `Main → Events` — same as push tap.
  `handleNotificationTap` for OS push taps stays **exactly as today** (incl. `join_request.denied → Messages`); no unified-helper refactor (Confirmed Decisions #5 + #8).
- `src/context/PushContext.tsx` — foreground `onMessage` (silently no-op today) calls `useNotifications().refreshUnreadCount()` (cheap `GET /api/notifications/unread-count`) so the bell badge updates live. Do **not** auto-refresh the full list or invoke `markAllRead` on app foreground (preserves unread semantics + avoids list churn on every in-app chat message — Confirmed Decisions #9 + #10).

---

### Step 7 — Frontend: navigation route + screen

**Files:**

- `src/navigation/types.ts` — add `Notifications: undefined` to `RootStackParamList`.
- `src/navigation/AppNavigator.tsx` — register `NotificationsScreen` in the stack (slide-from-right transition, default header hidden — screen renders its own `ScreenContainer` header to match Profile/PastEvents pattern).
- New `src/screens/NotificationsScreen.tsx` (+ `__tests__/NotificationsScreen.rendering.test.tsx`):
  - Header: back button + "Notifications" + (when unread > 0) "Mark all as read" text button on the right.
  - `FlatList` of rows using shared primitives:
    - `UnreadDot` (left) when `!read`.
    - Title (`AppText` variant=subtitle).
    - Body (`AppText` variant=body) — the server-supplied body (friendlier text for the 3 overrides).
    - Timestamp relative (reuse date util; otherwise a small relative formatter).
    - `ListSeparator` between rows.
  - Tap action: `routeFromNotification` (inbox-only helper) → `markRead(id)` → navigate.
  - Empty state: reuse `EmptyState` component with `imageSource={require('@assets/notification/emptystate_notificationinbox.png')}` — "No notifications yet". (PNG provided at `assets/notification/emptystate_notificationinbox.png`.)
  - Pull-to-refresh via `RefreshControl` → `refresh()`.
- New `src/components/NotificationRow.tsx` — owns its visual states (unread vs read/dimmed) and press haptic via `triggerHaptic('light')`. Keeps the screen a pure composition layer per AGENTS.md.

**Tests:** rendering test asserting list, unread dot, empty state, tap routing.

---

### Step 8 — Frontend: bell in Profile header

**Files:**

- Existing asset: `assets/notification/bell.svg` (imported as `@assets/notification/bell.svg`). Stroke already normalized to `currentColor` so it tints via the `color` prop like other icons.
- `src/screens/ProfileScreen.tsx`:
  - Change header from a plain `Text` to a `headerRow` `View` (flexDirection row, space-between, alignItems center): left = "Account" title (keep "Profile" when guest), right = `IconButton` (variant=`plain`) with `<BellIcon color={colors.text} />` (imported from `@assets/notification/bell.svg`), `accessibilityLabel="Notifications"`, `testID="notifications-bell"`, onPress → `navigation.navigate('Notifications')`.
  - Wrap bell in a relative-position container so `CountBadge` can absolutely-position at top-right. Show `CountBadge` only when `unreadCount > 0`. Reuse `CountBadge` as-is (secondary palette, no destructive-tone variant — Confirmed Decision #4).
  - Hide bell entirely when signed out (guest state).
  - Pull `unreadCount` from `useNotifications()`.
  - Bell press: `triggerHaptic('light')` (IconButton already does).
- `ProfileScreen.styles.ts` (inline `StyleSheet.create` currently) — add `headerRow`, `bellContainer`, `bellBadge` styles.
- Update `src/screens/__tests__/ProfileScreen.rendering.test.tsx` to expect the bell (mounted via `NotificationsProvider` mock) and that press navigates.

---

### Step 9 — Docs + AGENTS.md

- `AGENTS.md` Architecture section: add the `notifications` table, `NotificationHandler` endpoints, `NotificationsContext`, the `Notifications` route, and the rule that inbox display text is owned server-side in `notification_payloads.go` while push-payload strings stay unchanged. Note the bell lives in the Profile header via `IconButton` + `CountBadge`.
- `report/shared-components-refactor-guide.md`: if `NotificationRow` is shared, document it; otherwise leave as a feature-row.

---

## Validation Gates

**After Steps 1–3 (backend):**
- `cd server && go test ./...`

**After Steps 4–8 (frontend):**
- `npm run typecheck`
- `npx jest src/api/mappers src/context src/screens/NotificationsScreen src/screens/__tests__/ProfileScreen --runInBand --silent`
- `npm run lint` (don't add new warnings; prefer reducing the baseline).

**After Step 8 (device smoke test):**
- Run the `test-on-device` skill on the emulator — seed notifications by triggering each scenario with the dev-login test user, open Profile, see the badge count, open the inbox, tap rows to navigate, verify empty state when none.

---

## File Touch Summary

### Backend (new)
- `server/notification_payloads.go`
- `server/notification_handler.go`
- `server/repository_notifications.go`
- `server/repository_notifications_test.go`
- `server/notification_handler_test.go`

### Backend (modify)
- `server/models.go` — `Notification` struct
- `server/repository_schema.go` — `createTableNotifications` + indexes + `EnsureSchema` wiring
- `server/repository_accounts.go` — delete notifications on account deletion
- `server/chat_hub.go` — migrate 6 push call sites to `recordAndSendPushToUser`/`recordAndSendPushToUsers` (incl. per-recipient inserts in `sendPushForChatMessage`)
- `server/handler.go` — migrate `event.deleted` push site
- `server/profile_handler.go` — migrate `event.deleted` push site
- `server/router.go` — register `NotificationHandler` routes
- `server/api_integration_test.go` — assert notifications persisted per scenario

### Frontend (new)
- `src/api/mappers/notifications.ts`
- `src/context/NotificationsContext.tsx`
- `src/screens/NotificationsScreen.tsx`
- `src/screens/__tests__/NotificationsScreen.rendering.test.tsx`
- `src/components/NotificationRow.tsx`
- `assets/notification/bell.svg` (existing, modified: `currentColor`)
- `assets/notification/emptystate_notificationinbox.png` (existing, empty-state illustration)

### Frontend (modify)
- `src/navigation/types.ts` — `Notifications` route
- `src/navigation/AppNavigator.tsx` — register screen
- `src/context/pushRouting.ts` — add inbox-only `routeFromNotification` helper (push-tap `handleNotificationTap` stays unchanged)
- `src/context/PushContext.tsx` — foreground `onMessage` → refresh unread count
- `src/screens/ProfileScreen.tsx` — bell `IconButton` + `CountBadge` in header
- `src/screens/__tests__/ProfileScreen.rendering.test.tsx` — assert bell + navigation
- `App.tsx` — mount `NotificationsProvider`

### Docs
- `AGENTS.md`
- `report/shared-components-refactor-guide.md` (if `NotificationRow` is shared)
