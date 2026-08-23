# Stale Notification Actions: Problem and Resolution Plan

## Executive Summary

The Notifications inbox stores a historical row whenever the app sends a notification. Some rows
also act like shortcuts into live resources such as an event, a join request, or a conversation.
Those resources can change or disappear after the notification is created, but the notification's
stored destination does not change.

This creates stale actions. For example:

1. Alice requests to join the host's event, `Hike`.
2. The host receives `Alice wants to join your event Hike`.
3. The host deletes `Hike` without opening that notification.
4. The event, pending request, and related conversation are deleted.
5. The notification row remains in the host's inbox.
6. Tapping it uses the old event and conversation identifiers.

For a group event, the host reaches an empty Requests screen. For a 1:1 event, the host reaches an
Event Details not-found screen. Similar failures are possible for old chat-message and
request-approved notifications after an event is deleted or access is removed.

The common solution is to separate a notification's historical message from the validity of its
action:

- Preserve what happened as immutable notification history.
- Track whether the notification's action is active, resolved, or unavailable.
- Proactively invalidate obsolete actions when lifecycle changes occur.
- Ask the server to resolve the current safe destination when the user taps.
- Use the same resolution rules for inbox rows and operating-system push notifications.
- Keep inactive task history visible in a clearly muted, already-read state instead of making it
  look like a live task.
- When an unavailable target falls back to Discover, explain the redirect with a lightweight
  informational modal.

This plan does not restore the old `NotificationAccessModal` or its pre-navigation access-check
flow. Unavailable targets resolve to a safe destination, normally Discover, and then show a new
one-shot informational result prompt explaining why the original destination could not open.

## The Issue

### Notifications are historical, but their actions point to live data

The server persists one notification row per recipient. A row contains fields including `type`,
`event_id`, `conversation_id`, `title`, `body`, and the original push payload. Rows are inserted as
historical snapshots. Deleting an event does not update or remove notifications associated with
that event.

At the same time, client routing treats identifiers stored in a notification as current:

- `chat.message` opens the stored conversation.
- `join_request.created` opens Requests or Event Details.
- `join_request.approved` opens the stored conversation.

The client does not currently ask the server whether the resource still exists or whether the
signed-in user still has permission before navigating.

### Concrete host scenario

For a group event, `join_request.created` includes both an event ID and conversation ID. If the
host deletes the event and later taps the notification:

1. Notification routing opens the Requests route with the stored identifiers.
2. The Requests screen asks the server for pending requests.
3. The server returns `404` because the event was deleted.
4. `ChatContext` deliberately converts this `404` into an empty request list.
5. The host sees `No requests — Join requests will appear here.`

For a 1:1 event, the notification does not include a conversation ID. The client opens Event
Details instead, and the host sees `We couldn't find that plan.`

Neither result explains why the original notification can no longer be acted on.

### Why issue #122 does not solve the broader problem

Issue #122 removes `NotificationAccessModal`, its unused navigation parameter, and its dead Home
screen state. That cleanup is correct because notification taps no longer request the modal.

It does not address stale notification actions. The remaining routing still trusts the IDs stored
when the notification was created. This plan covers that separate lifecycle problem.

## Current Notification Inventory

The app currently persists six notification kinds.

| Notification kind       | Recipient                          | Current inbox destination           | Live dependency                                                                              | Stale risk |
| ----------------------- | ---------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| `chat.message`          | Conversation members except sender | Chat thread                         | Conversation exists and recipient is still a member                                          | High       |
| `join_request.created`  | Event host                         | Group: Requests; 1:1: Event Details | Event exists, host still owns it, request is still pending, conversation topology is current | Critical   |
| `join_request.approved` | Requester                          | Chat thread                         | Event and conversation exist and recipient is still a member                                 | High       |
| `join_request.denied`   | Requester                          | Discover                            | No live entity is required                                                                   | Low        |
| `event.member_removed`  | Removed member                     | Discover                            | No live entity is required                                                                   | Low        |
| `event.deleted`         | Approved members, excluding host   | Discover                            | No live entity is required                                                                   | Low        |

Unknown future types render without crashing but currently have no defined navigation behavior.

### `chat.message` edge cases

The stored action can become invalid when:

- The event is deleted.
- The recipient leaves the event.
- The host removes the recipient.
- A group-type change replaces the conversation topology.
- The conversation is otherwise deleted.

Current behavior can open a blank or invalid Chat thread.

### `join_request.created` edge cases

The stored action can become invalid or misleading when:

- The host deletes the event.
- The requester cancels the request.
- The host approves or denies the request from another surface or device.
- The requester deletes their account.
- The event switches between Group and 1:1.
- Several request notifications are collapsed but only some requests remain pending.
- The event becomes a past event before the host opens the request.

This is the highest-priority kind because it represents an outstanding task for the host.

### `join_request.approved` edge cases

The stored conversation can become invalid when:

- The event is deleted.
- The member leaves.
- The host removes the member.
- The host deletes their account and hosted events are removed.
- A group-type change replaces the conversation topology.

### Safe outcome notifications

`join_request.denied`, `event.member_removed`, and `event.deleted` already route to a general screen
that does not require the original entity. They are historical outcomes and can remain visible.

`join_request.denied` has a separate copy concern: the inbox says the event is no longer available
to the requester even though a denied event can remain publicly visible. That wording should be
reviewed independently from stale-action handling.

## Goals

1. Never open an event, conversation, request, or membership surface that is no longer valid for
   the signed-in user.
2. Mark resolved or unavailable tasks read, remove them from active task groups and the unread
   count, and render one muted historical summary with an explicit status icon/label.
3. Preserve meaningful historical outcome notifications.
4. Use one server-authoritative resolution policy for inbox rows and OS push taps.
5. Handle races where data changes after the inbox loads but before the user taps.
6. Explain unavailable redirects without reintroducing a blocking pre-navigation access modal.
7. Preserve push delivery if notification-history persistence or cleanup fails.

## Non-Goals

- Do not rewrite old notification history into a different event type.
- Do not make client-side `ChatContext.conversations` the authority for access. It can be stale or
  still loading.
- Do not require an event to exist merely to display a historical outcome notification.
- Do not block core event, request, membership, or account operations if best-effort notification
  cleanup fails.
- Do not restore the deleted `NotificationAccessModal`, its old route parameter, or its old access
  decision logic. The new informational result prompt appears only after server resolution and safe
  navigation.

## Proposed Common Solution

Use two complementary protections:

1. **Eager lifecycle invalidation:** update notification action state as soon as the related event,
   request, membership, or conversation changes.
2. **Tap-time server resolution:** validate the current state immediately before navigation.

Eager invalidation keeps the inbox and unread badge clean. Tap-time resolution closes race windows
and remains correct if invalidation failed or the inbox has cached data.

## 1. Separate Notification Content From Action State

Keep `type`, `title`, `body`, and original payload as historical content. Add explicit action state:

```text
action_state        active | resolved | unavailable
action_reason       nullable string
action_resolved_at  nullable timestamp
join_request_id     nullable integer
```

Suggested reasons:

```text
event_deleted
request_approved
request_denied
request_cancelled
requester_deleted
access_removed
member_left
conversation_deleted
conversation_replaced
event_ended
```

`join_request_id` is needed because existing request-created payloads do not reliably identify the
individual request. Do not add the more ambiguous `actor_user_id` in the first implementation. It
does not solve a current routing requirement and would need separate account-deletion and privacy
semantics. Add a specifically named relationship later only when a concrete query needs one.

### Notification categories

Treat rows as either tasks or outcomes:

- **Task notifications:** `chat.message`, `join_request.created`.
- **Outcome notifications:** `join_request.approved`, `join_request.denied`,
  `event.member_removed`, `event.deleted`.

Resolved or unavailable tasks stop being active tasks: the server marks them read, excludes them
from the unread count, and the client does not mix them into an active collapsed group. Preserve one
collapsed historical summary per event or conversation with a muted `Handled` or `Unavailable`
status. Outcomes remain as history, but their tap action must still resolve safely.

The three concepts stay separate:

- `read` controls the unread dot and badge.
- `action_state` controls whether the original live action is still valid.
- task/outcome category controls how the row is grouped and retained.

## 2. Enrich Newly Created Notification Payloads

New `join_request.created` notifications should include stable identifiers:

```json
{
  "type": "join_request.created",
  "eventId": "123",
  "conversationId": "456",
  "joinRequestId": "789",
  "requesterId": "42",
  "senderName": "Alice",
  "title": "Hike",
  "body": "Alice wants to join your event"
}
```

For 1:1 events, `conversationId` may remain absent until approval, but `joinRequestId` must be
present.

Chat and approval notifications should continue carrying the event and conversation identifiers
needed to resolve their current destination. Where chat rows currently omit `event_id` from the
notification table, either persist it or retain a reliable conversation-to-event lookup.

## 3. Invalidate Actions During Lifecycle Mutations

Add repository helpers with idempotent behavior, such as:

```go
ResolveJoinRequestNotifications(...)
InvalidateEventNotifications(...)
InvalidateConversationNotifications(...)
InvalidateUserRequestNotifications(...)
```

Invalidation changes `action_state`, records the reason/time, and sets `read = 1` in the same
notification update. An inactive task must never keep an unread dot or contribute to the Profile
badge.

### Request approved

- Resolve the matching host `join_request.created` task.
- Reason: `request_approved`.
- Create the requester `join_request.approved` outcome notification as today.

### Request denied

- Resolve the matching host `join_request.created` task.
- Reason: `request_denied`.
- Create the requester `join_request.denied` outcome notification as today.

### Request cancelled

- Resolve the matching host `join_request.created` task.
- Reason: `request_cancelled`.
- Do not create an additional outcome notification unless product design asks for one.

### Requester account deleted

- Resolve request-created notifications sent to hosts for that requester.
- Reason: `requester_deleted`.
- Perform this before request records are deleted.

### Event deleted

Before event and conversation cascades remove the live records:

- Invalidate host `join_request.created` tasks for the event.
- Invalidate member `chat.message` tasks for the event's conversations.
- Invalidate old `join_request.approved` actions that target those conversations.
- Preserve historical denied/removed/deleted outcomes.
- Create a new `event.deleted` outcome notification for approved members, excluding the host, as
  today.

The host should not retain an actionable `Alice wants to join Hike` row after deleting `Hike`.

### Member removed by host

For the removed user:

- Invalidate unread chat tasks for the conversation.
- Invalidate old approval actions targeting the conversation.
- Reason: `access_removed`.
- Create `event.member_removed` as today.

### Member leaves

For the departing user:

- Invalidate unread chat tasks and old approval actions.
- Reason: `member_left`.
- Do not create a host-removal outcome notification.

### Event group type changes

Apply notification-type-specific rules instead of remapping every old conversation automatically:

- `join_request.created` is event-scoped, so the resolver may use the event's current Group/1:1
  topology and current pending requests.
- `chat.message` refers to an exact historical conversation. Validate that exact conversation and
  membership; do not silently open a replacement conversation.
- `join_request.approved` may open a replacement conversation only if the server proves that it is
  for the same event and the recipient is currently a member. Otherwise mark the action
  `conversation_replaced` or `access_removed`.

### Past events

Define whether pending requests remain actionable after an event's scheduled time. If not, add a
scheduled or query-time rule that resolves them as `event_ended`.

## 4. Add a Server-Authoritative Action Resolver

Add an authenticated endpoint:

```http
POST /api/notifications/actions/resolve
```

Inbox request for either a single row or a collapsed row:

```json
{
  "notification_ids": [123, 122, 119],
  "mark_handled": true
}
```

The client must send every underlying notification ID represented by a collapsed row. The server
verifies that every ID belongs to the authenticated user and that the IDs form one valid group. For
a collapsed join-request row, the result remains active if any matching request in the group is
still pending. This prevents a cancelled latest request from hiding an older pending request.

Active response:

```json
{
  "status": "active",
  "destination": "join_requests",
  "event_id": 22,
  "conversation_id": 31,
  "title": "Hike"
}
```

Unavailable response:

```json
{
  "status": "unavailable",
  "reason": "event_deleted",
  "destination": "events"
}
```

Resolved request with an existing event:

```json
{
  "status": "resolved",
  "reason": "request_approved",
  "destination": "event_details",
  "event_id": 22
}
```

The server must verify:

- Every notification belongs to the authenticated user.
- Supplied grouped IDs share the expected event/conversation grouping key.
- The event still exists when the destination requires it.
- The user still owns or can access the event.
- The conversation exists and the user is still a member.
- A referenced join request is still pending.
- The route reflects current group/conversation topology.

Do not accept a destination or title from the client as authoritative.

When `mark_handled` is true and resolution succeeds, mark the supplied owned rows read in the same
server operation. If the resolver temporarily fails, do not mark anything read or handled. The
resolver may also persist a newly discovered unavailable/resolved state so later list/count queries
immediately agree with the tap result.

## 5. Centralize Client Notification Opening

Create one client operation, conceptually:

```ts
openNotification(notificationIds);
```

It should:

1. Send the single ID or every ID represented by a collapsed row to the server.
2. Navigate only using the resolved response.
3. Let the successful resolver operation mark the supplied IDs handled/read atomically.
4. Refresh or optimistically apply the returned action state.
5. Handle unavailable actions consistently, including the post-navigation informational prompt.

Replace direct entity-dependent routing in `routeFromNotification` with resolved destinations.
Keep route-name-to-navigation mapping centralized and typed.

Do not restore the old local conversation precheck. Commit `7d48910` removed that approach because
the conversation list can be stale or still loading.

## 6. Define Consistent Stale-Action UX

Recommended destination policy:

| Current state                                   | Safe result                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| Event deleted                                   | Discover, then `Event unavailable` informational modal |
| Membership/access removed                       | Discover, then generic unavailable informational modal |
| Conversation deleted/replaced                   | Discover, then generic unavailable informational modal |
| Request already resolved and event still exists | Event Details                                          |
| Request cancelled and event still exists        | Event Details                                          |
| Event no longer accepts requests                | Event Details                                          |
| Unknown notification type                       | Stay in Notifications                                  |
| Resolver temporarily fails                      | Stay in Notifications and allow retry                  |

### Informational modal after the safe redirect

When resolution sends the user to Discover because the original destination is unavailable, wait
until Discover is focused and then show a one-shot informational result prompt:

```text
Title: Event unavailable
Body: This event is no longer available. You can discover other events here.
Button: Explore events
```

For a conversation or access-specific reason where the event itself may still exist, use:

```text
Title: This is no longer available
Body: You no longer have access to the original destination. You can discover other events here.
Button: Explore events
```

Use the existing `EventActionOverlay` `result` prompt through `BottomSheetModal` and the shared sheet
host. Pass a typed, one-shot notice reason to the Discover route, consume it after the screen is
focused, and clear it immediately so it does not reappear on tab revisits. Do not restore the old
`NotificationAccessModal` component or let a modal decide authorization. The server resolver has
already made the decision before this informational prompt appears.

For a stale task already visible because the inbox was cached, tapping it should resolve safely,
mark it handled/read, navigate to Discover, and show the informational prompt. A lightweight
non-blocking error may be used for temporary network failure, but the app should not navigate
blindly or mark the row handled when resolution fails.

## 7. Keep Inbox Visibility and Unread Counts Consistent

Current collapse behavior hides read `chat.message` and `join_request.created` rows. Replace that
read-only rule with an explicit active/history presentation:

- Active unread tasks keep the normal unread dot and press treatment.
- Resolved/unavailable tasks are automatically read and never join an active collapsed group.
- Preserve one collapsed inactive summary per event or conversation so the user understands what
  happened without showing every stale chat-message row.
- Resolved summaries use a muted `Handled` status.
- Unavailable summaries use a muted unavailable icon plus an `Unavailable` label.
- Muted rows must have sufficient contrast and an accessibility label such as
  `Unavailable notification. Opens Discover and explains why.`
- They remain pressable only because pressing performs the safe server-resolved fallback; they must
  never open the original dead entity.
- Exclude every inactive task from unread-count queries and the Profile badge.
- Keep outcome notifications visible under the current user-cleared/account-deletion behavior.

The backend list keeps inactive history rows, so the client must not discard them after pagination.
Client collapse can turn a raw 20-row page into one historical summary; `loadMore` must therefore
remain available based on the raw page/`has_more` result rather than the number of rendered rows. If
product later chooses to hide inactive history, filter it in SQL before `LIMIT` and `OFFSET`. The
backend unread-count endpoint always excludes inactive tasks so a muted row cannot leave a phantom
badge.

`NotificationRow` owns these visual and accessibility states. Reuse `AppText`, theme tokens,
`ScalePressable`, and existing shared icons before introducing local styling. Add named notification
status colors/tokens if the existing muted tokens are insufficient; do not hardcode colors in the
screen.

## 8. Apply the Same Rules to OS Push Taps

Inbox and OS notifications currently have separate routing paths, including a deliberate difference
for `join_request.denied`. Entity validity should not differ between those paths.

Preferred approach:

- Include the persisted notification ID in each recipient's push payload.
- Resolve that ID through the same server endpoint before navigation.

Notification IDs are recipient-specific, while the current multi-recipient push helper sends one
shared payload. Supporting IDs may require sending per recipient after each row is inserted.

The fallback is permanent, not only a deferred migration path. Notification persistence is
best-effort, so a valid push may have no persisted notification ID. Legacy pushes and older app
versions also lack it. When `notificationId` is absent, OS taps call a resolver with `type`,
`eventId`, and `conversationId`; the server treats them only as lookup hints, validates all IDs and
current access against the authenticated user, and never trusts a client-provided route. A failure
must stay safe rather than navigate using the raw payload.

## 9. Preserve Reliability Guarantees

Notification persistence is currently best-effort so a database insert failure does not block FCM
push delivery. Preserve that property.

Lifecycle invalidation should also be best-effort where coupling it to a core mutation would be
risky. The resolver is the final correctness boundary if eager invalidation fails.

Where invalidation can safely participate in an existing repository transaction, do it before
event, request, or conversation records are removed so identifiers remain available.

## Migration for Existing Notifications

Existing rows do not contain action state or join-request IDs.

1. Add an idempotent `ensureNotificationActionColumns` startup migration. Inspect
   `PRAGMA table_info(notifications)`, add each missing column, close the schema cursor before
   writes, and invoke the migration after `createTableNotifications` but before new indexes and
   backfill queries. Editing `CREATE TABLE IF NOT EXISTS` alone does not upgrade an existing SQLite
   database.
2. Add new columns with `action_state = active` by default and validate allowed state values in the
   repository/domain layer (or with a supported SQLite check during table creation).
3. Mark dependency-based rows unavailable and read when their stored event or conversation no
   longer exists.
4. For existing `join_request.created` rows:
   - Mark unavailable if the event no longer exists.
   - Mark resolved if the host owns the event but it has no pending requests.
   - If pending requests exist but cannot be matched to a specific old row, allow the resolver to
     open the event-level Requests screen.
5. Keep denied, removed, and deleted outcome notifications because their destinations are safe.
6. Let tap-time resolution correct ambiguous legacy rows.
7. Test startup and reruns against both a pre-change database and a new empty database.

## Implementation Phases

### Phase 1: Domain contract and schema

Status: implemented on August 23, 2026. The idempotent startup migration, legacy backfill,
server/client action-state models, stable join-request identity field, matching indexes, and domain
category contract are in place. Newly emitted request notifications begin populating
`join_request_id` in Phase 2.

- Add the idempotent notification schema migration, action-state fields, and stable request
  identity.
- Update server and client notification models.
- Add only indexes that match the actual list/count, event, conversation, and request queries.
- Document task versus outcome notification semantics.

Primary files:

- `server/repository_schema.go`
- `server/models.go`
- `server/repository_notifications.go`
- `src/api/mappers/notifications.ts`

### Phase 2: Resolver and payload identity

Status: implemented on August 23, 2026. New request/chat payloads retain stable action identity,
recipient-specific persisted notification IDs are attached to pushes, and the authenticated
resolver validates ownership, group consistency, current membership, event ownership, request
state, and conversation topology before returning a typed destination.

- Add join-request ID, requester ID, and sender name to request-created notifications.
- Ensure chat and approval records retain enough event/conversation context.
- Add payload-construction tests.
- Add the authenticated single/group action resolver.
- Enforce ownership, group consistency, current access, per-type topology rules, and atomic
  handled/read updates.

Primary files:

- `server/chat_hub.go`
- new `server/notification_action_handler.go`
- `server/router.go`
- repository query files

### Phase 3: Inbox client integration and stale-state UX

Status: implemented on August 23, 2026. Inbox rows and collapsed groups resolve on the server
before navigating. Successful results update local read/action state, inactive task histories are
muted and labeled, temporary failures remain in Notifications, and unavailable results show the
typed one-shot Discover prompt.

- Add typed resolver API models and a centralized `openNotification(notificationIds)` operation.
- Resolve single and collapsed rows before navigation.
- Add muted `Handled`/`Unavailable` row states and exclude them from unread dots/counts.
- Navigate unavailable targets to Discover, then show the one-shot informational result prompt.
- Remove entity-dependent direct routing from inbox behavior.
- Keep the Notifications screen responsive while resolving.

Primary files:

- `src/api/notifications.ts` or the existing notification API module
- `src/context/pushRouting.ts`
- `src/components/NotificationRow.tsx`
- `src/screens/NotificationsScreen.tsx`
- Discover/Home screen overlay composition
- `src/utils/notificationCollapse.ts`
- `src/navigation/types.ts`
- `src/theme` only if a missing semantic status token is required

### Phase 4: Lifecycle invalidation

Status: implemented on August 23, 2026. Approve, deny, cancel, report-driven cancellation, event
delete, host removal, self-leave, requester/host account deletion, and group topology replacement
now invalidate or resolve affected actions. Task invalidation sets read state in the same update;
tap-time resolution remains the final boundary if best-effort cleanup cannot complete.

- Add repository invalidation helpers.
- Wire approve, deny, cancel, event delete, member removal, self-leave, account deletion, and group
  topology changes.
- Mark inactive tasks read in the same notification update.
- Keep mutations idempotent and retain resolver correctness if best-effort invalidation fails.

Primary files:

- `server/repository_notifications.go`
- `server/chat_hub.go`
- `server/handler.go`
- `server/profile_handler.go`
- relevant repository transaction files

### Phase 5: OS push integration

Status: implemented on August 23, 2026. Recipient-specific push data carries `notificationId` when
history persistence succeeds, and all background/quit-state taps use the same resolver/opening path
as inbox rows. Legacy and persistence-failure pushes use validated type/entity hints and never route
directly from raw data.

- Add notification IDs to push payloads where practical.
- Route OS taps through the resolver.
- Permanently support safe resolution when persistence failed or the payload is legacy and has no
  notification ID.
- Preserve intentional product differences only when they do not affect authorization or target
  validity.

Primary files:

- `server/notification_recorder.go`
- push sender helpers
- `src/context/PushContext.tsx`
- `src/context/pushRouting.ts`

### Phase 6: Backfill, tests, device QA, and observability

Status: implemented on August 23, 2026, with automated backend/client coverage and an HTML
implementation report. The resolver emits content-free status/reason/destination log records that
can be aggregated to monitor unavailable-action rates. Device-verification results and any local
environment limits are recorded in the report rather than inferred from automated tests.

- Backfill or lazily resolve legacy rows and verify migration reruns.
- Add lifecycle and race-condition tests.
- Add grouped-row, pagination, unavailable-modal, stale-icon, unread-count, and push-fallback tests.
- Verify Group and 1:1 flows sequentially on the Android emulator.
- Log resolution status and reason without logging notification content.
- Monitor unavailable-action rates to find missed invalidation paths.

## Test Plan

### Backend integration matrix

For each entity-dependent notification, test:

- Target exists.
- Event deleted.
- Member removed.
- Member leaves.
- Request approved.
- Request denied.
- Request cancelled.
- Requester account deleted.
- Host account deleted.
- Group type changed.
- Notification belongs to another user.
- Mutation occurs after list load but before resolution.
- Invalidation fails but resolver still returns a safe route.
- Collapsed row contains one resolved request and at least one still-pending request.
- One or more supplied group IDs belong to another user or a different event/conversation.
- More than one page of inactive/history rows does not hide eligible active/outcome rows.
- Push persistence fails and ID-less fallback resolution still validates current access.
- Schema migration succeeds and is idempotent for both old and empty databases.

Required regression case:

```text
Requester creates join request
→ host receives request notification
→ host deletes event without opening notification
→ host inbox shows the request as read and Unavailable, not as an active task
→ Profile has no unread badge for that row
→ row tap resolves to Discover instead of Requests/Event Details
→ Discover shows the one-shot Event unavailable informational modal
```

### Client tests

- Active destination mapping for all six kinds.
- Deleted-event fallback to Discover.
- Resolved-request fallback to Event Details.
- Access-removed fallback to Discover.
- Inactive tasks excluded from collapsed groups.
- Unread badge excludes inactive tasks.
- Inactive histories render a muted status icon/label with no unread dot.
- Collapsed rows resolve and mark all relevant owned IDs handled atomically.
- A mixed resolved/pending join group still opens Requests.
- Resolver network failure does not navigate blindly.
- Unknown types remain safe.
- Inbox and OS taps share resolution behavior.
- No `NotificationAccessModal` dependency.
- Discover informational modal uses the resolver reason, appears once after focus, and clears its
  route notice so it does not reappear.
- Modal copy matches `Event unavailable` and the generic access/conversation fallback.

### Device verification

Verify sequentially on the Android emulator:

1. Host receives a join request.
2. Host deletes the event without opening the notification.
3. Reopen Notifications and confirm the request is no longer styled as an active task.
4. Confirm the row is read/muted with an Unavailable status and there is no phantom unread badge.
5. Tap the stale row; confirm Discover opens and the Event unavailable prompt appears once.
6. Dismiss it, revisit Discover, and confirm it does not appear again.
7. Repeat with the inbox already open, delete from another session, then tap the cached row.
8. Confirm the cached tap resolves safely and shows the same prompt.
9. Repeat with an unread chat message followed by event deletion.
10. Repeat with an approval notification followed by member removal.
11. Repeat for Group and 1:1 events.

## Acceptance Criteria

The work is complete when:

- No notification opens an entity the signed-in user cannot access.
- Deleting an event removes or invalidates the host's stale join-request tasks.
- Resolved and cancelled requests no longer appear as pending tasks.
- Chat and approval notifications cannot open deleted conversations.
- Historical outcome notifications remain understandable and visible according to retention rules.
- Inbox and OS push taps use the same authorization and target-validity decisions.
- Hidden or inactive tasks do not contribute to unread counts.
- Cached inbox rows are safe when state changes immediately before a tap.
- Resolver failures do not cause blind navigation.
- Resolved/unavailable tasks are read, visually muted, labeled, accessible, and excluded from the
  unread badge.
- Unavailable fallbacks open Discover and show the correct one-shot informational modal.
- The deleted `NotificationAccessModal` and its pre-navigation access-check behavior are not
  restored.

## Product Decisions Applied During Implementation

The following decisions are confirmed by this revision:

- Keep one muted historical summary for resolved/unavailable task groups instead of making them
  look like live unread tasks.
- Automatically mark inactive tasks read and exclude them from unread counts.
- Use a status icon and `Handled`/`Unavailable` label so inactive rows feel different from active
  rows.
- An unavailable row remains pressable only for the safe fallback: open Discover and show the
  informational modal.
- Use the exact event-unavailable copy defined above and a generic variant for lost access or a
  missing conversation.

- Keep one collapsed muted summary for inactive tasks and keep outcome notifications as history.
- Open Event Details for resolved requests when the event still exists.
- Open Discover for deleted events or lost access.
- Show the one-shot informational result modal after the Discover redirect.
- Pending requests on past events remain resolvable under the existing event lifecycle; no new
  scheduled `event_ended` policy is introduced without a product expiry rule.
- Keep the existing server-owned `join_request.denied` inbox copy; copy review remains independent
  of action validity.
- Keep the current user-cleared/account-deletion retention behavior; no automatic expiry is added.
