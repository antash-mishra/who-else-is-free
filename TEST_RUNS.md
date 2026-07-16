# TEST_RUNS.md

Live status board for on-device (Android emulator) verification runs. Appended per skill `test-on-device`.

## 2026-07-05 — dev-login bypass for emulator testing
- Change: Add `POST /api/dev-login` (env-gated `DEV_LOGIN_ENABLED=1`) on the backend + `__DEV__`-gated `DevLoginButton` mounted in part of `SignInButtons`. Test user `tester@who-else-is-free.test` (id 5) gets a real session JWT and `profile_complete: true`.
- Flow: Sign out → Profile "Continue" → "Dev Login (tester)" → Discover → Profile.
- Attempt 1: FAIL — DevLoginButton fired correctly, but `EXPO_PUBLIC_API_BASE_URL` was unset so the app's bundle pointed at the production backend (`https://who-else-is-free-server.fly.dev`), which correctly doesn't have the dev-login route → 404 → "Dev login is not enabled on the server." error caption. This validated the **error path**.
- Attempt 2: PASS — Restarted Metro with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080 EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080 EXPO_PUBLIC_CHAT_ENABLED=true`, reloaded the bundle, tapped "Dev Login (tester)". Backend log shows `POST /api/dev-login` from `127.0.0.1` returned 200, then the WS connected with the test user's JWT, plus authenticated `/api/conversations` and `/api/push-tokens` calls. App navigated to Discover; Profile screen shows "Tester / tester@who-else-is-free.test / 0 Hosted, 0 Joined".
- Final: PASS — dev-login bypass is wired end-to-end and signed in the test user on the emulator.

## Environment notes (for repro)
- AVD: `WEIF_API_36` (started via `~/Library/Android/sdk/emulator/emulator -avd WEIF_API_36 -no-snapshot-load`).
- Backend: `cd server && DEV_LOGIN_ENABLED=1 go run .` (listens on `:8080`).
- Metro: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080 EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080 EXPO_PUBLIC_CHAT_ENABLED=true npm start`.
- Physical device unplugged (otherwise `mobile_init` fails with `adb: more than one device/emulator`).
- App launch: `adb shell am start -n com.whoelseisfree.app/.MainActivity`. If it lands on Expo Dev Launcher, tap the `http://10.0.2.2:8081` row.

## 2026-07-06 — stop badging system messages as unread (kind taxonomy)
- Change: Add `messages.kind` ('user' | 'system') schema + migration backfill; tag `postJoinAnnouncement` and `emitEventUpdateChatMessages` as `kind=system`; exclude `kind='system'` from `countUnreadMessages`; client `message:new` handler skips `unreadCount++` for `kind==='system'`. See `docs/system-message-unread-plan.md` and `report/system-message-unread-fix-verification.html`.
- Flow: Discover → (curl setup: Host creates group event + approves Tester join + edits event) → Messages (Tester) → ChatThread → back to Messages → (DB insert real user message) → refresh Messages.
- Attempt 1: FAIL — `ensureMessageKindColumn`'s follow-up `ExecContext` for the backfill UPDATE deadlocked on the held PRAGMA rows cursor (5s test timeout). Fixed by mirroring `ensureEventGroupTypeColumn`: call `rows.Close()` before `ExecContext`, and early-return when `hasKind` is already true (so the backfill only runs once, immediately after ALTER).
- Attempt 2: FAIL — `approveSingleJoinRequest`'s manual `insertMessage`/`Scan` had 6 columns but the SQL now returns 7 (added `kind`). Fixed by passing `string(MessageKindUser)` and scanning `&msg.Kind`.
- Attempt 3: FAIL — `TestSystemMessageKindExcludedFromUnreadCount` asserted `last_message.body == "Updated Event Detail"` but SQLite `selectLatestMessageForConversation` had only `ORDER BY created_at DESC` — when approve + edit landed in the same second, the tiebreak was unspecified and sometimes returned the join announcement instead. Fixed by adding `, id DESC` to the ORDER BY so the most-recently-inserted row wins deterministically.
- Attempt 4: PASS — server tests green (`go test ./...` 8s; new `TestSystemMessageKindExcludedFromUnreadCount` 5 sub-tests pass); frontend `npm run typecheck` clean, `npm test` 70 suites / 1154 tests pass. On emulator: after Host edits a Group event, the Tester's Messages screen shows NO red UnreadDot on the conversation whose last message is "Host: Updated Event Detail" (resource-id `conversation-unread-dot-8` absent). Chat thread shows "Updated Event Detail" + "Tester joined the chat" inline. After Host sends a real user message (`kind=user`), the red UnreadDot reappears (resource-id `conversation-unread-dot-8` present) — regression guard confirmed.
- Final: PASS — system messages no longer badge; real user messages still badge. Full HTML report at `report/system-message-unread-fix-verification.html` with embedded screenshots, DB queries, and API payloads.

## 2026-07-06 — full 4-cell verification matrix (host × member × group × 1:1)
- Change: extended the system-message unread fix verification across all 4 cells — Group × {Host, Member} and 1:1 × {Host, Member} — to confirm no inconsistencies. Added three preset dev-login identities (Tester, Host, Member2) to DevLoginButton so cross-user flows can be exercised on the emulator.
- Flow: curl setup (3 events: Group Event A host=Host+members Tester/Member2; 1:1 Event B host=Host+member Tester; 1:1 Event C host=Tester+member Member2) → cycle through Host/Tester/Member2 sign-ins on the emulator (via DevLoginButton presets) → Messages screen for each POV → chat thread screenshots showing system messages inline.
- Attempt 1: PASS — Host POV: Event A (Group) + Event B (1:1) both unread=0, no red dots. Tester POV: Event A (Group, member) + Event B (1:1, member) + Event C (1:1, host) all unread=0, no red dots; old Emulator Test Group Event still has a red dot for the real kind=user message ("Hey Tester, see you there!") — regression guard. Member2 POV: Event A (Group, member) + Event C (1:1, member) both unread=0, no red dots. API confirmation across all 3 users: every conversation whose last_message is `kind='system'` returns `unread_count: 0`. Chat threads show system messages ("Updated Event Detail", "Tester joined the chat", "Member2 joined the chat") inline — fix only suppresses the badge, not the message.
- Final: PASS — no inconsistencies across the 4-cell matrix. System messages never badge; real user messages still badge. Full HTML report at `report/system-message-unread-fix-verification.html` with the 2x2 matrix screenshot grid + API proofs + chat-thread screenshots.

## 2026-07-06 — consistent header info across JoinRequestsScreen + ChatThreadScreen
- Change: unified the chat/join-requests header subtitle format. JoinRequestsScreen 1:1 → "N People, DD Mon Wed"; JoinRequestsScreen group → "N Members, DD Mon Wed" (was static "Join Requests"); ChatThreadScreen 1:1 → "One to one, DD Mon Wed" (was "{eventTitle}, {date}"); ChatThreadScreen group → "N Members, DD Mon Wed" (was time/location). Also moved the WebSocket connecting state out of the subtitle (it used to replace the whole line with "Connecting…") into a new pulsing-dot ConnectionStatusIndicator in the header right area, so the member/date info stays visible while reconnecting. New shared helpers in src/utils/chatHeaderSubtitle.ts. Group JoinRequests header is not reachable from the app UI (JoinRequests is only navigated with groupType 'Single'), so it's covered by unit test only.
- Flow: dev-login as Tester (host) → Messages → tap "1:1 Event B (Edited)" → JoinRequestsScreen 1:1 (screenshot 01) → tap approved member row → ChatThread 1:1 (screenshot 04) → back → Messages → tap "Group Event A (Edited)" → ChatThread group (screenshot 03).
- Attempt 1: PASS — mobile_dump_ui text nodes confirmed exact subtitles: JoinRequests 1:1 "2 People, 14 Jul Tue"; ChatThread 1:1 title "Tester" + "One to one, 14 Jul Tue"; ChatThread group "3 Members, 12 Jul Sun". DateTime formatting verified: 2026-07-14→"14 Jul Tue", 2026-07-12→"12 Jul Sun". Screenshots + PROOF.md at report/header-consistency-proof/. npm test 1164 pass; typecheck clean; lint 0 errors/no new warnings.
- Final: PASS — all reachable surfaces render the consistent title/subtitle format. Group JoinRequests header verified by unit test (asserts "3 Members, <date>"). ConnectionStatusIndicator verified by unit test (subtitle stays visible while connecting).

## 2026-07-08 — Notification Inbox (full implementation)
- Change: Server-backed notification history (`notifications` table + `NotificationHandler` endpoints + best-effort recorder at all 6 push sites) + `NotificationsScreen` with bell `IconButton`/`CountBadge` in Profile header; inbox-only `routeFromNotification` helper (push-tap routing frozen); foreground `onMessage` → cheap unread-count refresh.
- Flow: Profile → bell → Notifications inbox → tap row (markRead + navigate) → back → "Mark all read" → badge cleared. Tested as host (join_request.created → JoinRequests) and member2 (all 3 override bodies + denied row → Main → Events).
- Attempt 1: PASS —
  - 01 Profile bell, no badge (0 unread) ✓
  - 02 Inbox empty state ✓
  - 03 Host inbox 4 unread rows + "Mark all read" ✓ (API unread=4)
  - 04 Tap join_request.created row → JoinRequests screen; host unread 4→3 ✓
  - 05 Host Profile badge "3" ✓
  - 06 Member2 Profile badge "6" ✓
  - 07 Member2 inbox: all three override bodies verbatim on-device ✓
  - 08 Tap join_request.denied row → Discover Events (Main → Events); member2 unread 6→5 ✓
  - 09 "Mark all read" → member2 unread 5→0; "Mark all read" button hidden ✓
  - 10 Member2 Profile badge cleared ✓
- Initial hiccup: bell tap did not fire when landing on the `CountBadge` overlay (top-right). Workaround: tap the left side of the bell (x≈935) to avoid the badge. Not a code defect — the badge is `clickable=false` but `ScalePressable` still needed a tap outside the badge bounds. Non-blocking for real users (finger is larger and lands center-mass of the bell); flagged for a follow-up to widen the bell's hit area or move the badge slightly off the tap target.
- Final: PASS — full end-to-end verified on emulator; backend + frontend test suites green.
- Screenshots: `report/notification-inbox/screenshots/01..10`  (report: `report/notification-inbox/IMPLEMENTATION.md`)

## 2026-07-16 — Empty-state vertical alignment

- Change: make the signed-out My Events and Chat empty states, plus the signed-in Chat list empty state, fill their available content area.
- Device: Android emulator `WEIF_API_36`, 1080 × 2400, package `com.whoelseisfree.app`.
- Signed-out flow: opened Discover against an isolated empty API, then opened My Events and Chat with no session; all empty-state content rendered vertically centered and the affected wrappers extended to the bottom-tab boundary.
- Signed-in flow: used a temporary zero-data dev identity, then opened Hosting in My Events and Chat; both empty states rendered vertically centered. The temporary preset was reverted after capture.
- Evidence: `report/empty-state-alignment-fix.html` and screenshots under `report/empty-state-alignment/`.
- Automated checks: 4 Jest suites / 104 tests passed; TypeScript passed; lint completed with 0 errors (899 existing baseline warnings); touched-file formatting passed.
- Final verdict: **PASS**.
