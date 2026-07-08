# Notification Inbox — Implementation Report

**Date:** 2026-07-08
**Status:** Implemented and verified end-to-end on the Android emulator

---

## What was built

A full server-backed notification inbox: every push notification is now persisted server-side into a `notifications` table (one row per recipient), and a new `Notifications` screen reachable from a bell `IconButton` in the Profile header shows a paginated, dated list with unread markers, friendlier text for the three "harsh" scenarios, tap-to-navigate, mark-read, and mark-all-read.

### Backend (Steps 1–3)

| Layer | File | What |
|---|---|---|
| Model | `server/models.go` | `Notification` struct |
| Schema | `server/repository_schema.go` | `notifications` table + `notifications_user_created_idx` + `notifications_user_read_idx`; wired into `Init` |
| Repo | `server/repository_notifications.go` | `CreateNotification`, `ListNotifications` (paginated, `created_at DESC, id DESC`), `CountUnreadNotifications`, `MarkNotificationRead` (user-scoped), `MarkAllNotificationsRead`; `ErrNotificationNotFound` |
| Cleanup | `server/repository_accounts.go` | `DELETE FROM notifications WHERE user_id = ?` in the account-deletion transaction |
| Display text | `server/notification_payloads.go` | `NotificationType*` constants + `notificationDisplayTexts` override map (3 "harsh" types) + `buildNotification` |
| Recorder | `server/notification_recorder.go` | `recordAndSendPushToUser` / `recordAndSendPushToUsers` (best-effort: insert row first, then send FCM unchanged; one row per recipient; never blocks push delivery) + `recordChatMessageNotification` |
| Call sites | `server/chat_hub.go` | All 6 push sites migrated to the recorder (incl. per-recipient inserts in `sendPushForChatMessage`, moved before the token lookup) |
| Call sites | `server/handler.go`, `server/profile_handler.go` | `event.deleted` sites migrated to `recordAndSendPushToUsers` |
| HTTP | `server/notification_handler.go` | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, `GET /api/notifications/unread-count`; registered in `router.go` |

**Backend tests:** `server/repository_notifications_test.go`, `server/notification_handler_test.go`, `server/notification_inbox_integration_test.go` — all green (`go test ./...`).

### Frontend (Steps 4–8)

| What | File |
|---|---|
| API types + mapper | `src/api/mappers/notifications.ts` (`ApiNotification`, `AppNotification`, `mapNotification(s)`) |
| Context | `src/context/NotificationsContext.tsx` (paginated list + unread count; `refresh`, `loadMore`, `refreshUnreadCount`, `markRead` optimistic + count-only re-sync, `markAllRead` page-1 refetch) |
| Push routing | `src/context/pushRouting.ts` — `routeFromNotification` (inbox-only; `handleNotificationTap` frozen) |
| Foreground refresh | `src/context/PushContext.tsx` — `onMessage` → cheap `refreshUnreadCount()` |
| Row component | `src/components/NotificationRow.tsx` (unread dot, relative timestamp, press haptic) |
| Screen | `src/screens/NotificationsScreen.tsx` (header + back + "Mark all read"; FlatList + pull-to-refresh + pagination; empty state) |
| Bell + badge | `src/screens/ProfileScreen.tsx` — `IconButton` + `CountBadge` in Account header; hidden for guests |
| Navigation | `src/navigation/types.ts` (`Notifications` route) + `AppNavigator.tsx` (slide-from-right) |
| Provider mount | `App.tsx` — `NotificationsProvider` wraps `PushProvider` |

**Frontend tests:** `src/screens/__tests__/NotificationsScreen.rendering.test.tsx`, extended `src/screens/__tests__/ProfileScreen.rendering.test.tsx` — all green (1177 tests, 0 errors, typecheck clean).

### Docs (Step 9)

`AGENTS.md` (Architecture + Backend Notes), `report/shared-components-refactor-guide.md` (`NotificationRow` documented; `CountBadge`/`UnreadDot` usage rows updated).

---

## End-to-end device verification

**Yes — a real end-to-end test was run on the Android emulator** (`WEIF_API_36`, `emulator-5554`). The backend was restarted with the new code (`DEV_LOGIN_ENABLED=1 go run .`), the app was rebuilt and installed (`npm run android` with the `10.0.2.2` env), and two dev-login users (`host@who-else-is-free.test` + `member2@who-else-is-free.test`) exercised all six notification scenarios through the real REST API + WebSocket. Each assertion below is backed by a captured screenshot (structured UI dump quoted in parentheses) and/or an API response.

### Verified scenarios

| # | Scenario | Evidence |
|---|---|---|
| 1 | Bell renders in Profile header for signed-in users (no badge at 0 unread) | Screenshot 01; UI dump shows `resource-id="notifications-bell"` and no `notifications-badge` |
| 2 | Empty inbox state ("No notifications yet" + illustration) | Screenshot 02; UI dump shows `empty-state`, "No notifications yet", "Updates about your events and messages will show up here." |
| 3 | Host inbox shows unread `join_request.created` rows with "Mark all read" button | Screenshot 03; UI dump shows 4 rows titled "Inbox Seed Hike" / "Inbox Deny Event" / "Inbox Deleted Event" / "Inbox Remove Member Event", body "Member2 wants to join your event", timestamp "now", `resource-id="notifications-mark-all-read"` |
| 4 | Tap `join_request.created` row → markRead + navigate to JoinRequests | Screenshot 04; UI dump shows JoinRequests screen ("No pending requests"); API confirms host unread dropped 4 → 3 |
| 5 | Bell badge shows unread count ("3") after returning to Profile | Screenshot 05; UI dump shows `resource-id="notifications-badge"` + `text="3"` |
| 6 | Member2 Profile shows badge "6" (3 approved + denied + deleted + member_removed) | Screenshot 06; UI dump shows `notifications-badge` + `text="6"` |
| 7 | **All three override bodies render on-device** | Screenshot 07; UI dump confirms verbatim: "You no longer have access to this event. Explore other events nearby." (`event.member_removed`), "This event has been cancelled and is no longer available. Explore other events nearby." (`event.deleted`), "This event is no longer available to you. Explore other events nearby." (`join_request.denied`); plus verbatim "Your request to join was approved!" for `join_request.approved` |
| 8 | Tap `join_request.denied` row → markRead + navigate to **Main → Events** (inbox-only override routing) | Screenshot 08; UI dump shows Discover Events screen; API confirms member2 unread dropped 6 → 5 |
| 9 | "Mark all read" clears all unread (badge disappears) | Screenshot 09 (inbox, all-read) + 10 (Profile, badge gone); API confirms member2 unread 5 → 0; UI dump shows no `notifications-badge` and no `notifications-mark-all-read` |

### Screenshots

All screenshots are in `report/notification-inbox/screenshots/`:

| # | File | What it shows |
|---|---|---|
| 1 | `01-profile-bell-no-badge.png` | Host Profile — bell visible, no badge (0 unread) |
| 2 | `02-notifications-empty-state.png` | Notifications inbox empty state |
| 3 | `03-host-inbox-unread-rows.png` | Host inbox — 4 unread join-request rows + "Mark all read" |
| 4 | `04-tap-row-navigates-to-join-requests.png` | Tap row → JoinRequests screen |
| 5 | `05-profile-bell-with-badge.png` | Host Profile — badge "3" |
| 6 | `06-member2-profile-badge-6.png` | Member2 Profile — badge "6" |
| 7 | `07-member2-inbox-override-bodies.png` | Member2 inbox — all three override bodies visible |
| 8 | `08-tap-denied-row-routes-to-events.png` | Tap denied row → Discover Events (Main → Events) |
| 9 | `09-member2-inbox-all-read.png` | Member2 inbox after "Mark all read" — rows dimmed, no "Mark all read" |
| 10 | `10-member2-profile-badge-cleared-after-mark-all.png` | Member2 Profile — bell visible, badge cleared (0 unread) |

---

## Validation gates passed

| Gate | Command | Result |
|---|---|---|
| Backend tests | `cd server && go test ./...` | ✅ |
| Frontend typecheck | `npm run typecheck` | ✅ (0 errors) |
| Frontend tests | `npm test -- --runInBand --silent` | ✅ (1177 tests, 0 failures) |
| Frontend lint | `npm run lint` | ✅ (0 errors; new files contribute 0 warnings) |
| Device smoke test | emulator e2e (see above) | ✅ (9 scenarios verified) |
