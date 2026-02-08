# Push Notifications Architecture

## System Overview

```
+-------------------------------------------------------------------------+
|                        MOBILE APP (React Native)                        |
|                                                                         |
|  +-------------+   +--------------+   +--------------+                  |
|  | AuthProvider |-->| ChatProvider  |-->| PushProvider  |--> AppNavigator |
|  |             |   |              |   |              |                  |
|  | - user      |   | - WebSocket  |   | - FCM token  |                  |
|  | - token     |   | - messages   |   | - permission |                  |
|  | - signOut() |   | - presence   |   | - tap routing|                  |
|  +-------------+   +--------------+   +--------------+                  |
+-------------------------------------------------------------------------+
         |                    |                    |
         | REST API           | WebSocket          | REST API
         | (auth)             | (real-time)        | (push tokens)
         v                    v                    v
+-------------------------------------------------------------------------+
|                      GO BACKEND (Gin + SQLite)                          |
|                                                                         |
|  +-----------+  +-----------+  +------------+  +-------------------+    |
|  |AuthHandler|  |  ChatHub   |  |PushHandler |  |   PushSender      |   |
|  |           |  |            |  |            |  |   (interface)     |   |
|  | - login   |  | - Run()    |  | - register |  |                   |   |
|  | - session |  | - presence |  | - delete   |  | +---------------+ |   |
|  +-----------+  | - suppress |  +------------+  | |fcmPushSender | |   |
|                 | - triggers |                  | |(production)  | |   |
|                 +-----------+                   | +---------------+ |   |
|                                                 | |noopPushSender| |   |
|                                                 | |(dev/testing) | |   |
|                                                 | +---------------+ |   |
|                                                 +-------------------+   |
+-------------------------------------------------------------------------+
                                    |
                                    | FCM Admin SDK
                                    v
                        +-----------------------+
                        |   Firebase Cloud       |
                        |   Messaging (FCM)      |
                        |                        |
                        |   - APNs (iOS)         |
                        |   - FCM (Android)      |
                        +-----------------------+
                                    |
                                    | Push delivery
                                    v
                            +---------------+
                            |  Device OS     |
                            |  notification  |
                            |  tray          |
                            +---------------+
```

---

## 1. Token Registration Flow

When a user signs in, the mobile app requests push permission, obtains an FCM token from Firebase, and registers it with the backend.

```
 MOBILE APP                          BACKEND                    FIREBASE
 ----------                          -------                    --------
     |                                  |                          |
     |  1. User signs in                |                          |
     |--------------------------------->|                          |
     |                                  |                          |
     |  2. PushProvider mounts          |                          |
     |  +----------------------+        |                          |
     |  | messaging()          |        |                          |
     |  |  .requestPermission()|        |                          |
     |  +----------+-----------+        |                          |
     |             |                    |                          |
     |  3. Get FCM token                |                          |
     |  +----------+-----------+        |                          |
     |  | messaging().getToken()|-------------------------------------->|
     |  +----------+-----------+        |            returns token |
     |             |<----------------------------------------------+
     |             |                    |
     |  4. Generate deviceId            |
     |  +----------+-----------+        |
     |  | SecureStore: get or  |        |
     |  | create UUID          |        |
     |  +----------+-----------+        |
     |             |                    |
     |  5. POST /api/push-tokens        |
     |  +----------+-----------+        |
     |  | { token, device_id,  |------->|  6. UPSERT into
     |  |   platform: "ios" }  |        |     push_tokens table
     |  +----------------------+        |  +---------------------+
     |                                  |  | push_tokens          |
     |                                  |  | +-----+------+-----+|
     |                                  |  | |uid  |token |platf||
     |                                  |  | +-----+------+-----+|
     |                                  |  | |  1  |abc...|ios  ||
     |                                  |  | |  1  |def...|andr ||
     |                                  |  | |  2  |ghi...|ios  ||
     |                                  |  | +-----+------+-----+|
     |                                  |  +---------------------+
     |                                  |
     |  7. onTokenRefresh listener      |
     |  +----------------------+        |
     |  | If FCM rotates the   |        |
     |  | token, re-register   |------->|  UPSERT (same flow)
     |  | via POST /push-tokens|        |
     |  +----------------------+        |
```

**Key files:**
- `src/context/PushContext.tsx` — FCM token acquisition, registration, refresh listener
- `server/push_handler.go` — `POST /api/push-tokens`, `DELETE /api/push-tokens`
- `server/repository.go` — `UpsertPushToken()`, `DeletePushToken()`

---

## 2. Push Sending Flow (Chat Message)

When a user sends a message, the backend delivers it in real-time via WebSocket to connected clients and asynchronously sends push notifications to offline members.

```
 SENDER                   BACKEND ChatHub                    RECIPIENTS
 ------                   --------------                     ----------
    |                          |                                 |
    |  WS: message:send        |                                 |
    |  { conversationId: 5,    |                                 |
    |    body: "Hey!" }        |                                 |
    |------------------------->|                                 |
    |                          |                                 |
    |                   +------+------------------+              |
    |                   | handleSend()            |              |
    |                   |  1. Verify membership   |              |
    |                   |  2. Save to messages DB |              |
    |                   |  3. emitChatMessage()   |---- WS ----->| (online
    |                   |     (broadcast to all   |   message:new|  members)
    |                   |      connected clients) |              |
    |                   |                         |              |
    |                   |  4. sendPushForChat     |              |
    |                   |     Message() -------+  |              |
    |                   +-------------------------+              |
    |                                          |                 |
    |                          +-- async goroutine --+           |
    |                          |                     |           |
    |                          v                     |           |
    |                   +----------------------+     |           |
    |                   | a. ListConversation  |     |           |
    |                   |    MemberIDs(convID) |     |           |
    |                   |    -> [user1, user2, |     |           |
    |                   |        user3, sender]|     |           |
    |                   |                      |     |           |
    |                   | b. Filter out:       |     |           |
    |                   |    - sender           |     |           |
    |                   |    - suppressed users |     |           |
    |                   |      (see section 3)  |     |           |
    |                   |                      |     |           |
    |                   | c. ListPushTokens    |     |           |
    |                   |    ByUserIDs()       |     |           |
    |                   |    -> [tok_a, tok_b] |     |           |
    |                   |                      |     |           |
    |                   | d. Build data payload|     |           |
    |                   |    { type: "chat.    |     |           |
    |                   |      message",       |     |           |
    |                   |      title, body }   |     |           |
    |                   |                      |     |           |
    |                   | e. pushSender        |     |           |
    |                   |    .SendBatch() ---------->| FCM ----->| (offline
    |                   +----------------------+     |           |  members)
    |                                                |           |
```

**Key files:**
- `server/chat_hub.go` — `handleSend()`, `sendPushForChatMessage()`
- `server/push_firebase.go` — `fcmPushSender.SendBatch()`
- `server/repository.go` — `ListConversationMemberIDs()`, `ListPushTokensByUserIDs()`

---

## 3. Presence & Suppression System

This prevents duplicate notifications when a user is already viewing the conversation in the app. The design uses the WebSocket connection itself as a "foreground" signal (the app closes the socket when backgrounded), plus an `activeConversationID` to know which specific conversation is on screen.

```
 MOBILE APP                              BACKEND ChatHub
 ----------                              --------------
                                         +----------------------+
  User opens ChatThread                  | Hub State (Run loop):|
  for conversation 5                     |                      |
    |                                    | clientsByUser: {     |
    |  setActiveConversation(5)          |   user1: [client_a], |
    |      |                             |   user2: [client_b]  |
    |      v                             | }                    |
    |  ChatContext sends WS:             |                      |
    |  { type: "presence:               | activeConvos: {      |
    |    active_conversation",           |   user1: 5  <------- set when
    |    conversationId: 5 }             | }             presence msg
    |------------------------------------>               arrives|
    |                                    |                      |
    |                                    | Suppression check:   |
    |                                    | shouldSuppressPush(  |
    |                                    |   user1, convID=5)   |
    |                                    |   has socket? YES    |
    |                                    |   activeConvo == 5?  |
    |                                    |     YES -> SUPPRESS  |
    |                                    |                      |
  User navigates away                    |                      |
    |                                    |                      |
    |  setActiveConversation(null)       |                      |
    |  WS: { type: "presence:           | activeConvos: {      |
    |    active_conversation",           |   (user1 removed)    |
    |    conversationId: 0 }             | }                    |
    |------------------------------------>                      |
    |                                    | shouldSuppressPush(  |
    |                                    |   user1, convID=5)   |
    |                                    |   has socket? YES    |
    |                                    |   activeConvo == 5?  |
    |                                    |     NO -> SEND PUSH  |
    |                                    |                      |
  User goes to background                |                      |
  (app closes WebSocket)                 |                      |
    |                                    |                      |
    |  socket disconnects --------------->  unregister:         |
    |                                    |   remove from        |
    |                                    |   clientsByUser      |
    |                                    |   delete activeConvos|
    |                                    |   for user1          |
    |                                    |                      |
    |                                    | shouldSuppressPush(  |
    |                                    |   user1, convID=any) |
    |                                    |   has socket? NO     |
    |                                    |   -> SEND PUSH       |
    |                                    +----------------------+
```

**Thread safety:** Presence updates flow through a channel (`presence chan presenceUpdate`) from `readPump` goroutines into the hub's single `Run()` goroutine, which is the only goroutine that reads/writes `activeConvos` and `clientsByUser`. No mutex needed.

**Key files:**
- `src/context/ChatContext.tsx` — sends `presence:active_conversation` when `activeConversationId` changes
- `server/chat_hub.go` — `readPump()` handles the message, `Run()` updates `activeConvos`, `shouldSuppressPush()` checks state

---

## 4. Notification Trigger Points

| Trigger | Handler | Push Type | Recipient | Body |
|---------|---------|-----------|-----------|------|
| User sends a message | `ChatClient.handleSend()` (WS) | `chat.message` | All conversation members except sender + suppressed | `"{senderName}: {preview}"` |
| User requests to join (Group) | `ChatHTTPHandler.requestJoin()` (HTTP) | `join_request.created` | Event host | `"{name} wants to join your event"` |
| User requests to join (1:1, auto-approved) | `ChatHTTPHandler.requestJoin()` (HTTP) | `join_request.created` + `join_request.approved` | Host gets "created", requester gets "approved" | See above + `"Your request to join was approved!"` |
| Host approves request | `ChatHTTPHandler.approveJoin()` (HTTP) | `join_request.approved` | Requester | `"Your request to join was approved!"` |
| Host denies request | `ChatHTTPHandler.denyJoin()` (HTTP) | `join_request.denied` | Requester | `"Your request to join was declined"` |

**Key file:** `server/chat_hub.go` — `sendPushForChatMessage()`, `sendPushToUser()`

---

## 5. Notification Tap Routing (Frontend)

When a user taps a notification, the app navigates to the appropriate screen based on the push `type` field.

```
 User taps notification
         |
         v
 +---------------------------+
 | PushProvider receives tap |
 | via:                      |
 | - getInitialNotification()| <-- app was killed
 | - onNotificationOpenedApp | <-- app was in background
 +-----------+---------------+
             |
             v
 +-----------------------+
 | Read data.type        |
 +-----------+-----------+
             |
     +-------+--------+--------------+
     v       v        v              v
 chat.    join_req  join_req     join_req
 message  .created  .approved    .denied
     |       |        |              |
     v       v        v              v
 setActive  navigate  setActive   navigate
 Convo(id)  ("Join    Convo(id)   ("Main",
     |      Requests",    |       {Messages})
     v      {convId,      v
 navigate   eventId,   navigate
 ("Chat     title})    ("Chat
  Thread")              Thread")
```

| Push Type | Navigation Action |
|-----------|-------------------|
| `chat.message` | `setActiveConversation(conversationId)` then navigate to `ChatThread` |
| `join_request.created` | Navigate to `JoinRequests` with `{ conversationId, eventId, title }` |
| `join_request.approved` | `setActiveConversation(conversationId)` then navigate to `ChatThread` |
| `join_request.denied` | Navigate to `Main` > `Messages` tab |

**Key file:** `src/context/PushContext.tsx` — `handleNotificationTap()`

---

## 6. Sign-Out Cleanup

When the user signs out, the device's FCM token is removed from the backend so the device no longer receives push notifications for that account.

```
 MOBILE APP                           BACKEND
 ----------                           -------
     |
     |  User taps Sign Out
     |  +-----------------------+
     |  | AuthContext.signOut()  |
     |  |  -> user becomes null |
     |  +----------+------------+
     |             |
     |  +----------v------------+
     |  | PushProvider detects  |
     |  | user null (was set)   |
     |  |                       |
     |  | DELETE /api/push-tokens|
     |  | { token: cached_fcm } |---------> DELETE FROM push_tokens
     |  |                       |           WHERE user_id=? AND token=?
     |  | Clear fcmTokenRef     |
     |  +-----------------------+
     |
     |  +-----------------------+
     |  | ChatContext detects   |
     |  | user/token null       |
     |  |  -> closes WebSocket  |---------> Hub unregisters client,
     |  |  -> clears state      |           clears presence
     |  +-----------------------+
```

**Key files:**
- `src/context/PushContext.tsx` — watches `user` becoming null, calls `DELETE /api/push-tokens`
- `src/context/ChatContext.tsx` — closes WebSocket on sign-out
- `server/push_handler.go` — `deletePushToken()` handler

---

## 7. Dual Delivery Path

Every message and event has two delivery channels that work together:

```
                    +---------------------+
                    |   Message/Event      |
                    |   occurs on server   |
                    +----------+----------+
                               |
                    +----------+----------+
                    |                      |
              +-----v-----+        +------v------+
              | WebSocket  |        | Push (FCM)   |
              | broadcast  |        | async        |
              | (instant)  |        | goroutine    |
              +-----+------+        +------+------+
                    |                      |
                    v                      v
           +----------------+    +----------------+
           | ONLINE users    |    | OFFLINE users   |
           | (socket open,   |    | (no socket,     |
           |  app in         |    |  app in          |
           |  foreground)    |    |  background/     |
           |                 |    |  killed)         |
           | See message     |    | See notification |
           | instantly in UI |    | in system tray   |
           +----------------+    +----------------+
```

When a user is online with an active socket viewing the target conversation, push is **suppressed** to avoid redundancy. The WebSocket broadcast always runs; push is the fallback for offline users.

---

## 8. Data Model

```
 push_tokens (SQLite)
 +----+---------+------------------+-----------+----------+------------+
 | id | user_id | token            | device_id | platform | updated_at |
 +----+---------+------------------+-----------+----------+------------+
 |  1 |       1 | fcm_token_abc... | dev_uuid1 | ios      | 2026-02-07 |
 |  2 |       1 | fcm_token_def... | dev_uuid2 | android  | 2026-02-07 |
 |  3 |       2 | fcm_token_ghi... | dev_uuid3 | ios      | 2026-02-07 |
 +----+---------+------------------+-----------+----------+------------+
```

- **UNIQUE index on `token`** — one FCM token maps to exactly one device; UPSERT on conflict
- **Index on `user_id`** — fast lookup of all devices for a user
- A user can have multiple tokens (multiple devices)
- `device_id` is a UUID generated and stored in SecureStore on the client

**Key file:** `server/repository.go` — `createTablePushTokens`, `createPushTokensTokenUniqueIndex`

---

## 9. FCM Payload Format

All pushes use **data-only messages** (no `notification` block in the top-level FCM payload). This gives full control over display, suppression, and routing on the client. The APNs config includes an `alert` so iOS shows the notification in the system tray.

```json
{
  "token": "device_fcm_token",
  "data": {
    "type": "chat.message",
    "conversationId": "5",
    "senderId": "1",
    "senderName": "Sam",
    "title": "Beach Volleyball",
    "body": "Sam: Hey, anyone coming tomorrow?"
  },
  "android": { "priority": "high" },
  "apns": {
    "headers": { "apns-priority": "10" },
    "payload": {
      "aps": {
        "content-available": true,
        "mutable-content": true,
        "sound": "default",
        "badge": 1,
        "alert": {
          "title": "Beach Volleyball",
          "body": "Sam: Hey, anyone coming tomorrow?"
        }
      }
    }
  }
}
```

**Key file:** `server/push_firebase.go` — `fcmPushSender.Send()`, `fcmPushSender.SendBatch()`

---

## 10. PushSender Interface & Implementations

The `PushSender` interface decouples the hub from Firebase, making it testable and allowing graceful degradation.

```
                    PushSender (interface)
                    +----------------------------+
                    | Send(ctx, notification)     |
                    | SendBatch(ctx, []notif)     |
                    +-------------+--------------+
                                  |
                    +-------------+-------------+
                    |                           |
          +---------v---------+       +---------v---------+
          | fcmPushSender     |       | noopPushSender    |
          | (production)      |       | (dev / testing)   |
          |                   |       |                   |
          | Uses Firebase     |       | Does nothing,     |
          | Admin SDK to send |       | returns nil       |
          | via FCM/APNs      |       |                   |
          +-------------------+       +-------------------+
```

**Initialization** (`server/main.go`):
1. Check `PUSH_ENABLED` env var
2. If `"true"`, try to create `fcmPushSender` from `FIREBASE_CREDENTIALS_FILE`
3. If disabled or credentials missing, fall back to `noopPushSender` with a log message
4. Inject chosen sender into `NewChatHub(repo, signer, pushSender)`

**Key file:** `server/push_firebase.go` — `InitPushSender()`, interface + both implementations

---

## 11. File Map

| File | Role |
|------|------|
| `server/push_firebase.go` | `PushSender` interface, FCM implementation, no-op fallback, `InitPushSender()` |
| `server/push_handler.go` | REST endpoints: `POST /api/push-tokens`, `DELETE /api/push-tokens` |
| `server/chat_hub.go` | Presence tracking, suppression, push triggers in `handleSend`, `requestJoin`, `approveJoin`, `denyJoin` |
| `server/repository.go` | `push_tokens` table DDL, `UpsertPushToken`, `DeletePushToken`, `ListPushTokensByUser`, `ListPushTokensByUserIDs`, `ListConversationMemberIDs` |
| `server/models.go` | `PushToken` struct |
| `server/main.go` | `InitPushSender()` call, wiring into `ChatHub` |
| `server/router.go` | Route registration for push token endpoints |
| `src/context/PushContext.tsx` | FCM token management, permission, tap routing, foreground handling, sign-out cleanup |
| `src/context/ChatContext.tsx` | Sends `presence:active_conversation` WS messages on conversation change |
| `App.tsx` | Provider hierarchy: `AuthProvider > ChatProvider > PushProvider > EventsProvider` |
| `android/build.gradle` | Google Services classpath |
| `android/app/build.gradle` | Google Services plugin |
| `ios/whoelseisfree/whoelseisfree.entitlements` | `aps-environment` entitlement |
| `ios/whoelseisfree/Info.plist` | `UIBackgroundModes: remote-notification` |
