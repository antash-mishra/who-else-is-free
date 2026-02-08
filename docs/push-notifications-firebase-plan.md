# Firebase Push Notifications Plan (iOS + Android)

## 1) Goal
Implement production-ready push notifications for Android and iOS using Firebase Cloud Messaging (FCM), integrated with the existing React Native Expo app and Go backend.

This phase covers:
- New chat messages
- Join request created
- Join request approved
- Join request denied

This phase does not cover:
- Event reminder scheduling (time-based)
- Marketing/broadcast notifications
- User notification settings UI beyond OS-level channel controls

## 2) Current Codebase Baseline

### Frontend
- App entry: `App.tsx`
- Contexts:
  - Auth: `src/context/AuthContext.tsx`
  - Chat: `src/context/ChatContext.tsx`
  - Events: `src/context/EventsContext.tsx`
- Navigation:
  - Navigator: `src/navigation/AppNavigator.tsx`
  - Types: `src/navigation/types.ts`
- Existing chat UX:
  - Messages list: `src/screens/MessagesScreen.tsx`
  - Thread: `src/screens/ChatThreadScreen.tsx`

### Backend
- Bootstrap: `server/main.go`
- Router: `server/router.go`
- Chat HTTP + WebSocket hub: `server/chat_hub.go`
- Event handlers: `server/handler.go`
- DB + migrations + repository: `server/repository.go`
- Models: `server/models.go`

### Native project state
- Native folders exist: `android/`, `ios/`
- Firebase is not configured yet:
  - No `google-services.json`
  - No `GoogleService-Info.plist`
  - No Firebase gradle plugin setup
  - No APNs entitlements for push in `ios/whoelseisfree/whoelseisfree.entitlements`

## 3) Locked Product Decisions
- Provider path: Direct FCM end-to-end (no Expo push relay)
- Notification scope: chat + join request lifecycle only
- Delivery policy: suppress push if recipient is actively viewing the same conversation
- Permission timing: prompt after login from authenticated app context
- Android channels: two channels
  - `chat`
  - `join_requests`

## 4) Target Architecture
- Client gets native FCM registration token.
- Client sends token to backend under authenticated session.
- Backend stores token per user/device.
- Backend sends pushes via Firebase Admin SDK.
- Chat hub presence state suppresses same-conversation duplicate pushes.
- Notification tap routes user into correct screen (`ChatThread` or `JoinRequests`).

## 5) Backend Plan

## 5.1 Dependencies and bootstrap
1. Add Firebase Admin SDK dependency to Go server.
2. Add push sender initialization in `server/main.go`.
3. Inject push sender into chat handler/hub registration path.
4. Keep fallback behavior safe:
   - If Firebase is not configured, app runs normally and only logs push-disabled state.

## 5.2 Environment variables
Add server env configuration support:
- `FIREBASE_CREDENTIALS_FILE` (path to service account JSON)
- `FIREBASE_CREDENTIALS_JSON` (raw JSON string alternative)
- `PUSH_ENABLED` (`true`/`false`, default `false`)
- Optional:
  - `PUSH_DRY_RUN` (`true` for non-delivery testing)

Update:
- `server/.env` (local)
- `.env.example` (document new vars)

## 5.3 Database schema and migration
Add `push_tokens` table via idempotent migration inside `EventRepository.Init`:

Fields:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `user_id INTEGER NOT NULL`
- `token TEXT NOT NULL`
- `platform TEXT NOT NULL` (`ios` or `android`)
- `device_id TEXT`
- `app_version TEXT`
- `active INTEGER NOT NULL DEFAULT 1`
- `failure_count INTEGER NOT NULL DEFAULT 0`
- `last_error TEXT`
- `last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`

Indexes and constraints:
- `UNIQUE(user_id, token)`
- `INDEX push_tokens_user_idx(user_id)`
- `INDEX push_tokens_active_idx(active, user_id)`

Migration strategy:
- Add `createTablePushTokens` SQL constant in `server/repository.go`.
- Add `ensurePushTokensTable(ctx)` migration helper and call it from `Init`.
- Keep idempotent style consistent with existing `ensure*` methods.

## 5.4 Repository methods
Add methods in `server/repository.go`:
- `UpsertPushToken(ctx, userID, token, platform, deviceID, appVersion) error`
- `DisablePushToken(ctx, userID, token) error`
- `ListActivePushTokensByUserIDs(ctx, userIDs []int64) (map[int64][]PushToken, error)`
- `DisablePushTokenByValue(ctx, token, reason) error` (for invalid token cleanup after FCM response)
- `IncrementPushTokenFailure(ctx, token, errMsg) error`
- `ResetPushTokenFailure(ctx, token) error`

Add model type in `server/models.go`:
- `PushToken` struct with DB fields used by sender service.

## 5.5 Push token API endpoints
Add new protected routes in `server/router.go`:
- `POST /api/push-tokens`
- `DELETE /api/push-tokens`

Create `server/push_handler.go`:
- Request payloads:
  - Register:
    - `token` (required)
    - `platform` (`ios`/`android`)
    - `device_id` (optional)
    - `app_version` (optional)
  - Delete:
    - `token` (required)
- Auth from existing session middleware.
- Responses:
  - `204 No Content` on success
  - `400` for validation failures
  - `401` if unauthorized
  - `500` for server errors

## 5.6 Firebase sender service
Create `server/push_firebase.go`:
- Interface:
  - `type PushSender interface { SendToUsers(ctx context.Context, userIDs []int64, payload PushPayload, opts PushSendOptions) error }`
- Implementation:
  - Resolve tokens by user IDs from repository
  - Build FCM message with:
    - notification title/body
    - data map for navigation
    - platform config for Android/iOS
  - Send in batches (FCM multicast limits)
  - Parse per-token response:
    - disable token on permanent invalid/unregistered errors
    - increment failure count on transient errors
    - reset failure count on success

## 5.7 Presence-aware suppression
Extend WebSocket protocol in `server/chat_hub.go`:
- New inbound message type: `presence:update`
- Payload fields:
  - `appState` (`active` or `background`)
  - `activeConversationId` (nullable)

Track presence in `ChatClient` state:
- `appState string`
- `activeConversationID *int64`

Suppression check before push:
- For each recipient user:
  - If any live socket for that user has:
    - `appState == "active"` and
    - `activeConversationID == targetConversationID`
  - Skip push for that user.

## 5.8 Trigger points
Wire push emit at existing backend events:

1. Chat message send
- Location: `ChatClient.handleSend` in `server/chat_hub.go`
- After message persisted and WebSocket fanout:
  - recipients = conversation members excluding sender
  - emit `chat.message`

2. Join request created
- Location: `requestJoin` in `server/chat_hub.go`
- recipient = event host
- emit `join_request.created`

3. Join request approved
- Location: `approveJoin` in `server/chat_hub.go`
- recipient = requester
- emit `join_request.approved`

4. Join request denied
- Location: `denyJoin` in `server/chat_hub.go`
- recipient = requester
- emit `join_request.denied`

Payload keys (string map):
- `type`
- `conversationId` (if present)
- `eventId` (if present)
- `requestId` (join request events)
- `senderId` (chat)
- `title`
- `body`

## 6) Frontend Plan

## 6.1 Dependencies
Add packages:
- `@react-native-firebase/app`
- `@react-native-firebase/messaging`
- `expo-device` (for device metadata, if needed)
- `expo-notifications` (optional local foreground handling; keep if used)

## 6.2 Native configuration
Android:
1. Place `android/app/google-services.json`.
2. Update `android/build.gradle`:
   - add `classpath("com.google.gms:google-services:...")`.
3. Update `android/app/build.gradle`:
   - apply `com.google.gms.google-services`.
4. Define notification channels at runtime:
   - `chat`
   - `join_requests`

iOS:
1. Place `ios/GoogleService-Info.plist`.
2. Enable Push Notifications capability.
3. Enable Background Modes -> Remote notifications.
4. Ensure `aps-environment` exists in `ios/whoelseisfree/whoelseisfree.entitlements`.
5. Run `pod install` (`npx pod-install`).
6. In Firebase console, upload APNs key for iOS push routing.

## 6.3 Push provider/context
Add `src/context/PushContext.tsx`:
- Responsibilities:
  - request permission (post-login timing)
  - get and refresh FCM token
  - register/unregister backend token
  - handle opened notification routing
  - expose init status and debug state if needed

Provider placement in `App.tsx`:
- `AuthProvider` -> `PushProvider` -> `ChatProvider` -> `EventsProvider` (or `PushProvider` after `ChatProvider` if routing helpers require chat state; choose one and keep deterministic).

## 6.4 Auth integration
In `src/context/AuthContext.tsx`:
- On sign-out:
  - best effort call to delete push token from backend before local token purge.

In `PushProvider`:
- Watch auth state (`user`, `token`):
  - if logged in + permission granted: register token.
  - if logged out: clear listeners and local push session state.

## 6.5 Presence integration for suppression
In `src/context/ChatContext.tsx`:
- Send `presence:update` over WS when:
  - app foreground/background changes (`AppState`)
  - `activeConversationId` changes
  - socket reconnects

Message envelope:
- `type: "presence:update"`
- `appState`
- `activeConversationId`

## 6.6 Notification routing
Add routing utility in `PushProvider`:
- Parse payload `type`.
- Route behavior:
  - `chat.message`:
    - set active conversation in chat context
    - navigate to `Main` -> `Messages` -> `ChatThread`
  - `join_request.created`:
    - navigate to `JoinRequests` with `conversationId`, `eventId`, `title`
  - `join_request.approved` and `join_request.denied`:
    - navigate to related chat/event path with available IDs

Use existing route types in `src/navigation/types.ts`.

## 6.7 Permission UX
Prompt flow:
1. User logs in.
2. Show concise in-app rationale dialog.
3. Trigger system permission request.
4. Persist prompt marker in secure/local storage to avoid repeated prompting.

If denied:
- Keep app functional.
- Retry prompt only from deliberate re-enable action later (future UI).

## 7) Notification Payload Contract

Common fields:
- `type`
- `title`
- `body`
- `conversationId` (optional)
- `eventId` (optional)

Type-specific:
- `chat.message`:
  - `senderId`
  - `messagePreview`
- `join_request.created`:
  - `requestId`
  - `requesterId`
- `join_request.approved`:
  - `requestId`
- `join_request.denied`:
  - `requestId`

Rules:
- All values serialized as strings in FCM data payload.
- Client parser is strict and no-crash on malformed payload.

## 8) Testing Plan

## 8.1 Backend tests (`go test ./...`)
- Migration test:
  - `push_tokens` table created idempotently.
- Token endpoint tests:
  - register success
  - duplicate upsert path
  - unauthorized rejection
  - delete token path
- Push sender tests with mocked FCM:
  - sends to expected recipient set
  - sender excluded for chat message
  - invalid token disables token
  - transient failures increment failure count
- Suppression tests:
  - active same conversation -> no push
  - background or different conversation -> push sent

## 8.2 Frontend tests (`npm test`)
- Push provider:
  - token registration on login
  - refresh token re-registration
  - unregister on sign-out
- Chat presence:
  - emits `presence:update` on app state and active conversation changes
- Notification open routing:
  - chat payload -> `ChatThread`
  - join request payload -> `JoinRequests`
- Permission flow:
  - rationale shown once
  - denied path handled without crash

## 8.3 Manual E2E
- Android physical device:
  - receive push in foreground/background/terminated
  - tap routes correctly
  - channel behavior correct
- iOS physical device:
  - receive push in background/terminated
  - tap routes correctly
  - APNs/FCM bridging verified
- Suppression:
  - open same chat on recipient device, send message from other device, confirm no push.

## 9) Rollout Plan
1. Ship backend with `PUSH_ENABLED=false`.
2. Deploy mobile build with token registration + handlers.
3. Enable `PUSH_ENABLED=true` in staging/internal first.
4. Validate logs and error rates for 24-48 hours.
5. Enable for production users.

Fallback:
- Disable `PUSH_ENABLED` immediately if delivery or routing issues appear.

## 10) Observability and Operations
Add structured logs:
- `push.token_registered`
- `push.token_disabled`
- `push.send_attempt`
- `push.send_success`
- `push.send_failure`
- `push.suppressed_active_conversation`

Track counters:
- sends attempted
- sends succeeded
- sends failed
- tokens disabled
- suppressions

## 11) Implementation Order (Execution Checklist)
1. Add backend schema + repository methods.
2. Add push token API routes/handler.
3. Add Firebase sender service and bootstrap wiring.
4. Add notification triggers in chat/join-request handlers.
5. Add suppression state in WebSocket protocol and hub logic.
6. Configure native Firebase files + gradle/entitlements.
7. Add frontend PushProvider and auth integration.
8. Add frontend routing and presence updates.
9. Add automated tests.
10. Run manual E2E on Android and iOS devices.

## 12) Acceptance Criteria
- Tokens register and unregister correctly per authenticated user.
- Chat and join request events deliver pushes on both Android and iOS.
- Sender never receives push for their own message.
- Recipient in active same conversation does not receive duplicate push.
- Notification tap opens the intended screen with correct context.
- Invalid tokens are automatically disabled after FCM response.
- Existing chat, events, and auth behavior remain unchanged when push is disabled.
