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
- Screenshots: `report/notification-inbox/screenshots/01..10` (report: `report/notification-inbox/IMPLEMENTATION.md`)

## 2026-07-16 — Empty-state vertical alignment

- Change: make the signed-out My Events and Chat empty states, plus the signed-in Chat list empty state, fill their available content area.
- Device: Android emulator `WEIF_API_36`, 1080 × 2400, package `com.whoelseisfree.app`.
- Signed-out flow: opened Discover against an isolated empty API, then opened My Events and Chat with no session; all empty-state content rendered vertically centered and the affected wrappers extended to the bottom-tab boundary.
- Signed-in flow: used a temporary zero-data dev identity, then opened Hosting in My Events and Chat; both empty states rendered vertically centered. The temporary preset was reverted after capture.
- Evidence: `report/empty-state-alignment-fix.html` and screenshots under `report/empty-state-alignment/`.
- Automated checks: 4 Jest suites / 104 tests passed; TypeScript passed; lint completed with 0 errors (899 existing baseline warnings); touched-file formatting passed.
- Final verdict: **PASS**.

## 2026-07-17 — Admin support inbox

- Change: add persistent database-backed admin roles, protected admin help-submission APIs, Contact/Feedback submission hardening, and an admin-only Support Inbox with filters, detail, reply metadata, and status management.
- Environment: Android emulator `WEIF_API_36`, package `com.whoelseisfree.app`; isolated feature backend on `:8082` with `DEV_LOGIN_ENABLED=1` and `ADMIN_BOOTSTRAP_EMAILS=tester@who-else-is-free.test`; Metro targeted `http://10.0.2.2:8082`.
- Flow: Discover → Profile → Support Inbox → urgent contact detail → Mark as reviewed → back → Reviewed filter.
- Attempt 1: PASS — Profile exposed Support Inbox only after `/api/admin-access` confirmed the signed-in tester's persisted admin role; the inbox ranked the new urgent safety contact first, displayed Contact/Feedback and New status tags, and showed submitter/relative-time metadata. Detail displayed the full message, account/reply email, wants-reply flag, and reply action. Mark as reviewed persisted immediately; returning to the inbox moved it below new items, and the Reviewed filter returned only the reviewed urgent contact.
- UX follow-up: PASS — separated the two independent filter dimensions with visible `MESSAGE TYPE` and `STATUS` labels and renamed the status catch-all from `All` to `Any`; refreshed inbox and Reviewed-filter screenshots confirm the distinction on-device.
- Native build note: a clean Expo prebuild could not link the generated launcher because existing app config references missing Android resource `color/iconBackground`. The installed compatible development client loaded this worktree's current JavaScript bundle through Metro, so the feature itself was fully exercised. This is unrelated native-build infrastructure debt.
- Evidence: `report/admin-support-assets/profile-entry.png`, `support-inbox.png`, `support-message.png`, `support-message-reviewed.png`, and `reviewed-filter.png`.
- Final: **PASS** — admin authorization, list/detail rendering, prioritization, filtering, reply information, and status mutation work end-to-end on the emulator.

## 2026-07-17 — Accepted members in the 1:1 event overlay

- Change: reuse the group-event overlay roster design for a host-owned 1:1 event, label it `Accepted`, populate it from approved join-request requesters, omit the host, and refresh approved requests when the read-only overlay opens.
- Flow: Chat → Coffee Catchup (1:1 host row) → event header → Event Details overlay on Android `WEIF_API_36` and iOS iPhone 15 Pro simulator.
- Attempt 1: PASS — iOS rendered `Accepted 1`, `Guest One`, and the existing member actions affordance with no host row.
- Attempt 2: PASS — Android rendered the same tab, count, row, divider, and actions affordance with no host row.
- Automated checks: focused Event Details overlay suite passed 7/7; TypeScript passed; Prettier passed; lint completed with 0 errors and the existing 899-warning baseline.
- Evidence: `report/accepted-members-overlay-implementation.html` and four before/after screenshots under `report/accepted-members-overlay-assets/`.
- QA data note: Coffee Catchup was moved from 16 July to 18 July through `PUT /api/events/7` so it remained visible after a fresh app session.
- Final verdict: **PASS**.

## 2026-08-23 — Issue #122 unavailable-plan notification

- Change: verify that removing `NotificationAccessModal` leaves the unavailable-plan explanation in the Notifications inbox and routes taps directly to Discover.
- Flow: dev-login member requests `Hike` → host denies request through the authenticated API → Member2 Profile → Notifications → unavailable-plan row → tap row → Discover.
- Attempt 1: PASS — the inbox displayed `Hike is no longer available to you. Explore other events nearby.` under Today; tapping it opened Discover without a modal.
- Evidence: `report/issue-122-notification-unavailable.png` and `report/issue-122-after-notification-tap.png`.
- Final verdict: **PASS**.

## 2026-08-23 — Stale notification action resolver and lifecycle

- Change: complete phases 1–6 of `report/stale-notification-actions-plan.md`: action-state schema/backfill, authenticated resolver, eager lifecycle invalidation, muted inactive history, shared inbox/OS-push opening, recipient-specific push IDs, and the one-shot Discover result prompt.
- Environment: Android emulator `WEIF_API_36` (Android 16, 1080 × 2400), package `com.whoelseisfree.app`; local backend with `DEV_LOGIN_ENABLED=1`; Metro at `http://10.0.2.2:8081`; Host and Member2 preset identities.
- API flow: clear host inbox → create event as Host → request as Member2 → verify active unread row → delete event as Host → verify row is `unavailable`, `read=true`, reason `event_deleted`, and unread count 0. Repeated for Group and 1:1.
- Attempt 1: BLOCKED — the already-running AVD went offline and showed `System UI isn't responding`; no visual verdict was recorded from that state.
- Attempt 2: PASS — cold-started the AVD, connected the installed development build to Metro, and signed in as Host. For both Group and 1:1, Notifications showed one muted `Unavailable` request row with no unread dot; Profile showed the bell with no count badge; tapping the row opened Discover and the exact `Event unavailable` / `This event is no longer available. You can discover other events here.` prompt; dismissing it and revisiting Discover did not reopen it.
- Automated checks: Go tests and `go vet ./...` passed; focused frontend suites passed 70/70; TypeScript, touched-file lint, Prettier, and `git diff --check` passed. The full frontend baseline passed 73/78 suites (1,205/1,232 tests); all notification suites passed, while five unrelated existing suites retained 27 failures.
- Evidence: `report/stale-notification-actions-device.png`, `report/stale-notification-actions-modal-device.png`, and `report/stale-notification-actions-implementation-report.html`.
- Final verdict: **PASS**.

## 2026-08-24 — Issue #123 My Plans states and copy

- Change: add explicit initial-loading and uncached-error states to signed-in My Plans, share the event-list loading/error presentation with Discover, retain cached content during refresh failures, update signed-out and Hosting empty-state copy, and close the event-card middle-dot regression gap.
- Environment: Android emulator `WEIF_API_36` (Android 16, 1080 × 2400), package `com.whoelseisfree.app`; local backend with `DEV_LOGIN_ENABLED=1`; Metro at `http://10.0.2.2:8081`.
- Flow: signed-out My Plans → dev-login as Member2 → signed-in Hosting empty state → seeded host event card.
- Device result: PASS — signed-out My Plans showed `Your plans are waiting` / `Get started to create or join plans.` with no tabs; Member2 showed the tabs plus `No plans hosted` / `Your hosted plans will appear here.`; the populated event card rendered `Shivapuri Trail · 10:00 AM`. The emulator UI bridge became unresponsive while forcing the offline state, so loading/error/retry behavior was verified by focused render and component tests instead of claiming a device capture.
- Automated checks: focused Jest coverage passed 5 suites / 87 tests; TypeScript passed; lint completed with 0 errors and the existing warning baseline; touched-file formatting and `git diff --check` passed. The full frontend suite retains three unrelated baseline failures in Event Details, Chat Thread, and create-event form tests.
- Evidence: `report/issue-123-my-plans-implementation-report.html` and `report/issue-123-my-plans-{guest,hosting-empty,card-dot}.png`.
- Final verdict: **PASS** for the implemented issue scope; the failed offline screenshot attempt is disclosed in the report.

## 2026-08-24 — Issue #125 Profile copy and safe errors

- Change: update Profile to “Sign out”, rename delete cancellation to “Cancel”, replace raw account/help submission errors with fixed user-safe copy while retaining development logs, add commas to Past Plans absolute date headings, revise Past Plans error/retry copy, remove obsolete privacy-policy Notion links, remove the unreachable profile-name fallback, and verify the existing #121 Edit Profile behavior.
- Environment: Android emulator `WEIF_API_36` (Android 16, 1080 × 2400), package `com.whoelseisfree.app`; local backend with `DEV_LOGIN_ENABLED=1`; Metro at `http://10.0.2.2:8081`; Member2 preset identity.
- Device result: PASS — Profile displayed `Sign out`; delete hold-to-confirm displayed `Cancel`; Past Plans displayed comma-separated headings including `31 Jul, Fri` and `26 Jul, Sun`; forced offline Contact and Feedback submissions displayed the specified generic alerts while development logging retained the underlying network failure.
- Automated checks: focused Jest coverage passed 5 suites / 45 tests; TypeScript passed; touched-file formatting passed; lint completed with 0 errors and 842 existing baseline warnings. The full frontend run passed 80/82 suites and 1,223/1,247 tests; the remaining 24 failures are confined to unrelated existing Event Details and Chat Thread rendering suites.
- Evidence: `report/issue-125-profile-implementation-report.html` and five screenshots under `report/issue-125-profile-assets/`.
- Final verdict: **PASS**.

## 2026-08-24 — Issue #127 Chat

- Change: split notification request review into the full-page `JoinRequest` route while keeping the Messages/Event Details host flow in `OneToOneHub`; update message sender/system previews, chat error copy, pending-request accessibility and empty copy, thread subtitles/member grammar/timestamps, and 1:1 member-action error handling.
- Environment: Android emulator `WEIF_API_36` (Android 16, 1080 × 2400), package `com.whoelseisfree.app`; local backend with `DEV_LOGIN_ENABLED=1`; Metro at `http://10.0.2.2:8081`; Host plus disposable Issue #127 test identities.
- Reproduction: a fresh pending 1:1 notification opened Event Details; new join announcements read “joined the chat”; the 1:1 thread used a generic subtitle and locale-dependent time; the group singular/member, close-label, and raw error cases matched the issue report.
- Device result: PASS — a new conversation-less 1:1 notification opened `JoinRequest` directly; the event-cache miss was found during the first pass and fixed by refreshing event metadata on focus. Messages simultaneously showed `Sylvie: Sounds good`, `Taylor Requester joined the plan`, `No messages yet`, and `No one accepted yet`. Pending Requests exposed `Close`, shared row truncation, and the exact empty copy. Thread captures proved plan/date, `10:44 PM`, and `Group • 1 member`. Report and remove remained separate; the shared report overlay opened; forced offline remove/chat failures showed fixed safe copy.
- Automated checks: frontend 85 suites / 1,254 tests passed; `go test ./...` passed; TypeScript passed; lint completed with 0 errors and the existing warning baseline; touched files were formatted and `git diff --check` passed.
- Evidence: `report/issue-127-chat-implementation-report.html` and before/after screenshots under `report/issue-127-assets/`.
- Final verdict: **PASS**.

## 2026-08-25 — Issue #128 Notifications

- Change: keep Mark all as read enabled at zero unread, normalize Clear all styling, update empty/error/date copy, centralize the five non-chat lifecycle messages for push and inbox, render server-owned single-row bodies verbatim, add structured join-request sender names, and backfill legacy stored copy idempotently.
- Environment: Android emulator `WEIF_API_36` (Android 16, 1080 × 2400), package `com.whoelseisfree.app`; isolated temporary SQLite backend with `DEV_LOGIN_ENABLED=1`; Metro at `http://10.0.2.2:8081`; Host and Member2 preset identities.
- Device result: PASS — a seeded zero-unread host inbox displayed the unchanged chat row, all five exact revised lifecycle messages, and `Last 7 days` / `Last 30 days`; its menu kept `Mark all as read` enabled and rendered `Clear all` with the normal black treatment. Member2 displayed `Your notifications will appear here.` when empty, then a forced server outage displayed only `Failed to load notifications` with `Try again`.
- Automated checks: focused Jest coverage passed 5 suites / 43 tests and the full frontend run passed 87 suites / 1,264 tests; notification Go tests and full `go test ./...` passed; TypeScript passed; lint completed with 0 errors and the existing warning baseline; touched-file formatting and `git diff --check` passed. Exact FCM title/body values are covered through the server's mock push sender because local emulator push delivery is disabled.
- Evidence: `report/issue-128-notifications-implementation-report.html` and four screenshots under `report/issue-128-assets/`.
- Final verdict: **PASS**.

## 2026-09-05 — Issue 135 plan details

- Change: person-report context, host-inclusive group membership, requested copy/styles, and input-sheet layout/lifecycle.
- Attempt 1: BLOCKED — clean Android prebuild requires the ignored google-services.json, absent from this checkout.
- Attempt 2: BLOCKED — synthetic sheet harness bundled into the installed development client; the Android emulator displayed an app-not-responding dialog.
- Attempt 3: BLOCKED — restarted the installed client; UI hierarchy exposed no usable app controls. Temporary harness and entry-point changes removed; test Metro stopped.
- Interim (after attempts 1–3): native verification incomplete. Automated verification passed 1,304 tests. Horizontal screen-slide reproduction remains outstanding; do not treat the shared-sheet animation fix as a verified resolution of that symptom.
- Attempt 4 (2026-09-05, commit 005470e3): PASS on Android emulator `WEIF_API_36` (Pixel 8 clone, API 36, 10 GB data partition; the stock `Pixel_8_Phone` AVD had 392 MB free and refused the 182 MB debug APK). Backend `DEV_LOGIN_ENABLED=1`, Metro with `10.0.2.2` env, fresh `expo run:android` build. Seeded via REST: group event 16 (Host hosting, Tester accepted), group event 17 (Host hosting, no requests), 1:1 event 18 (Tester hosting, Member2 accepted); events needed coordinates near the emulator location to pass Discover's 50 km local filter.
  - Flow (Tester, member): Discover → Group Picnic 135. Header reads "2 Members"; no inline Introduction section. More menu order is View intro message / Report plan (black) / Leave plan (red). View intro shows regular text. Report plan sheet with keyboard up keeps Submit fully visible (`report/issue-135-assets/135-report-plan-keyboard.png`).
  - Flow (Tester, 1:1 host): Coffee Chat 135 → Accepted → Member2 menu. Remove sheet has centered title/description and a "Remove" CTA. Report & block sheet has a "Report & block" CTA and opens the person prompt with placeholder "Tell us why you're reporting Member2" (`135-report-person-placeholder.png`). Not submitted, to avoid blocking the seeded user.
  - Flow (Host): Group Picnic 135 Members tab lists Host first with a Host label and no menu, then Tester with a menu; tab count 2 matches the header (`135-members-tab-host.png`). Fresh Group 135 shows "1 Member" and the host row before any conversation exists (`135-fresh-group-one-member.png`).
  - Flow (Member2): Fresh Group 135 → Request to join. Intro sheet keeps Send visible with the keyboard up, with a long single-paragraph intro, and after ten newlines grow the input (`135-write-intro-keyboard.png`, `135-write-intro-grown.png`).
  - Not verified: the intermittent horizontal Event Details slide from the issue's first screenshot was not reproduced during repeated card → details navigation; it stays open. Note for future runs: typing text containing two `r` characters through `adb shell input text` triggers React Native's dev double-tap-R reload, which looks like an app restart.
- Final: **PASS** on Android emulator for every issue item except the horizontal slide, which remains unverified. iOS not checked.

## 2026-09-05 — Issue 136 chat fixes

- Change: chat header date comma, Android input caret/placeholder overlap, chat list hidden under keyboard, unread dot after approving a request, overlay close-button blur/artifact (`report/issue-136-implementation.md`).
- Flow (Member2): Messages → Coffee Chat 135 (1:1). Header reads "Coffee Chat 135 · 07 Sep, Mon". Focusing the composer: before the fix the list kept full height and the latest messages sat under the keyboard (`report/issue-136-assets/01-chat-keyboard-before.png`); after, the body pads by the keyboard lift and the last messages stay visible above the composer (`02-chat-keyboard-after.png`). Caret no longer overlaps the "W" of "Write a message" (`03-composer-caret-before-after.png`).
- Flow (Member2): chat header → Event Details overlay. Close button renders as a dark frosted circle with a clean white ✕, no stray shape (`04-overlay-close-button.png`). Cover images are not fetched on this emulator, so the blur was checked over the flat hero placeholder.
- Flow (Host): Discover → Tea Meetup 136 (1:1) → Requests → Accept Member2 → Messages tab. Row shows "Member2 joined the plan" in regular weight with no unread dot (`05-messages-after-approval.png`). REST baseline: a 1:1 approved before the server change reports `unread_count` 1 for the host; one approved after reports 0.
- Automated: focused Jest for chat thread, chat context, header subtitle, and dateTime; full Jest suite; TypeScript; ESLint on touched files with no new warnings; Prettier on touched files (three files were already outside the repo's format baseline and were left as found). Go: `TestAPIIntegration/list_covers` fails in this checkout because cover images are gitignored and not fetched; unrelated to the change.
- Not verified: iOS. The placeholder caret fix is applied to every `TextInput` through the shared tokens, but only the chat composer was inspected on device.
- Final: **PASS** on Android emulator.

## 2026-09-05 — Scrapbook motion system (phases 0–2)

- Change: motion tokens (`src/theme/motion.ts`) beside the frozen `springs.ts`, shared seeded random, the `Placed` entry primitive with reduce-motion support, two Reanimated migrations, Discover card stagger + opt-in `ScalePressable` tilt + swipe-tracking sort indicator, and Event Details parallax hero / cover drop-in / avatar pop-in / join stamp / request row exit (`docs/superpowers/specs/2026-09-05-app-motion-system-design.md`, `docs/superpowers/plans/2026-09-05-app-motion-system.md`).
- Automated: 105 Jest suites / 1,345 tests pass; `npm run typecheck` clean; `npm run lint` 776 warnings against 788 on `master` (0 errors); Prettier clean on touched files.
- Environment: the pre-existing emulator session was unhealthy (SystemUI ANR on first contact, then `Process system isn't responding`); cold-restarted `WEIF_API_36`, which booted clean with no further ANRs. Metro was already running with `--localhost`, so `adb reverse` was added for 8080 alongside the existing 8081 forward. Verified signed-out unless noted. Evidence captured with `adb screenrecord` plus ffmpeg frame extraction, since static screenshots cannot show motion.
- **Discover entry cascade — PASS.** Full cold launch recorded; at 20 fps the rows resolve top-to-bottom. Mid-flight frame vs settled frame: row 1 nearly opaque while rows 2–4 are progressively fainter, rows still translated ~10–26 px low and rising, covers scaled slightly small and settling outward. Matches `entryTranslateY` 14 / `entryScaleFrom` 0.97 / capped 45 ms stagger.
- **No entry replay — PASS.** Scrolling down and back, and switching sort tabs, left cards solid; no re-fade. The once-per-id registry holds.
- **Swipe-tracking sort indicator — PASS.** During a slow drag between Upcoming and Newest the two pills interpolate through intermediate greys in step with the page slide, rather than snapping on selection. This is the new optional `pageOffsetSV` path.
- **Event Details cover drop-in and rest tilt — PASS.** The cover card scales up into place; both mid-entry and settled frames show it visibly rotated (bottom edge slopes ~10–18 px across ~480 px, ≈1.2°, within `tiltMaxDeg` 1.5), with the elevated shadow offset to match.
- **Reduce motion — PASS.** With `transition_animation_scale`/`window_animation_scale`/`animator_duration_scale` set to 0, Discover cards appear at full opacity with no cascade, and the Event Details cover renders perfectly axis-aligned with no drop-in and no tilt. `Placed` falls back to a plain static View as designed. Scales restored to 1 afterwards.
- **Not verified:**
  - Hero parallax. Every seeded plan is short enough to fit on one screen, so the Event Details `ScrollView` never scrolls and the effect is never exercised. Needs a plan with a long description or a large member list.
  - Join CTA stamp. Reaching it requires a signed-in non-host viewer, and the seeded plans fall outside signed-in Discover's 50 km filter on this emulator (the same data quirk recorded in the issue-135 run). No join request was created.
  - Request row exit animation. Needs a host account with pending requests, blocked by the same data gap.
  - Avatar stagger. The available plan has a single member, so there is no sequence to observe; the avatar itself renders.
  - iOS entirely.
- Environment left as found: animation scales back to 1, location permission revoked (its state at session start), app signed out, no seeded data added.
- Final: **PASS** for every motion behaviour that the available data could exercise; four items above remain unverified for data reasons, not defects.

## 2026-09-05 — Motion system performance regression (Galaxy A56)

- Trigger: reported slow scrolling and laggy animation on a physical Samsung SM-A566E (Android 16), running the dev client against the fly.io backend.
- Method: `dumpsys gfxinfo <pkg> reset` then a fixed gesture sequence, reading janky-frame counts and percentiles. Because the motion work is JS-only, `master` and the feature branch were A/B'd on the same installed build by switching branches and reloading Metro, holding device, data, and battery-saver state constant.

### Discover scroll (12 swipes)

| Run                              | Janky      | 90th  | 99th   | Slow UI thread |
| -------------------------------- | ---------- | ----- | ------ | -------------- |
| A: feature branch                | 25 (9.09%) | 34 ms | 121 ms | 25             |
| B: `master`                      | 3 (0.79%)  | 16 ms | 25 ms  | 2              |
| C: branch minus `Placed` on rows | 3 (0.81%)  | 16 ms | 24 ms  | 3              |
| D: branch with `Placed` fixed    | 2 (0.54%)  | 16 ms | 28 ms  | 2              |

- Run C isolates it: removing only the `Placed` wrapper restores `master` behaviour while the `ScalePressable` tilt stays in place, so the tilt is not implicated.
- Root cause: `Placed` left a `useReducedMotion` hook, a shared value, a worklet style, and an extra native `Animated.View` attached to every row for the life of the list, and `SectionList` remounts those constantly while recycling. The animation is one-shot; the machinery was not.
- Fix: non-animating items (id already seen, reduce motion, or index past the stagger window) render as a plain `View` with no Reanimated attached. A `rest` tilt is preserved on that path as a plain style transform. GPU percentiles were flat at 3–4 ms throughout, confirming a UI/JS-thread cost rather than a GPU one.

### Tab navigation (Discover → My plans → Chats → Profile ×3)

| Run                       | Janky      | 90th  | 99th  |
| ------------------------- | ---------- | ----- | ----- |
| `master`, debug build     | 39 (6.40%) | 20 ms | 69 ms |
| Branch, debug build       | 48 (8.32%) | 27 ms | 85 ms |
| Branch, tilt neutralised  | 47 (8.05%) | 23 ms | 85 ms |
| Branch, battery saver off | 43 (7.00%) | 20 ms | 69 ms |

- Tab navigation is janky on `master` too. Across runs the count moved 39/43/47/48 out of ~600 frames, so the branch delta sits inside run-to-run noise rather than being a distinct regression. Neutralising the `ScalePressable` tilt changed nothing (48 → 47).

### Release build (same device, same battery-saver state)

| Interaction     | Debug       | Release                                |
| --------------- | ----------- | -------------------------------------- |
| Discover scroll | 0.54% janky | **0.00%** (0 janky frames, 99th 15 ms) |
| Tab navigation  | 8.32% janky | **2.94%** (99th 48 ms)                 |

- The debug/dev-client build was the dominant contributor to the remaining perceived jank; a release build of the same commit removes it. Battery saver is a smaller secondary factor (scroll 0.54% → 0.26% with it off).
- Final: the one genuine regression (`Placed` on list rows) is fixed and now measures better than `master`; residual tab-navigation jank is pre-existing and largely a dev-build artifact.

## 2026-09-05 — Shared tab-and-pager wiring (useTabbedPages)

- Change: extracted the tab-strip/pager wiring into `src/hooks/useTabbedPages.ts` and adopted it in
  `HomeScreen` and `MyEventsScreen`. My Events created a page offset and passed it to
  `AnimatedPager` but never to `SegmentedControl`, so its tabs snapped while Discover's tracked the
  swipe.
- Automated: 9 new hook unit tests (index derivation, pager change, tab change, shared offset
  identity, fallback when the selected option disappears, out-of-range page index); 106 suites /
  1,354 tests pass; typecheck clean; lint 776 warnings against 788 on `master`, 0 errors.
- Device (Galaxy A56, dev client, fly.io backend): My plans → slow horizontal drags between
  Hosting / Joined / Requests. Frame extraction at 12 fps shows both pills interpolating through
  intermediate greys in step with the drag — "Hosting" fading out as "Joined" fills in — rather
  than snapping at the end. Matches Discover. The "Hosting 1" count badge is preserved through the
  transition.
- Not verified: iOS. Event Details' `HostRequestTabs` was deliberately excluded (its pager is
  direction-locked and frozen in CLAUDE.md), so its tabs still snap by design.
- Final: **PASS** on Android.

## 2026-09-06 — Live inbox over WebSocket + foreground notification banner

- Change: server emits `notification:new` over `/api/ws` for every persisted inbox row (`emitNotificationNew`, hub `direct` channel); `ChatContext.subscribeToServerEvents` + `NotificationsContext` prepend the row live and bump the unread count; new `NotificationBannerHost`/`NotificationBanner` (Reanimated + Gesture Handler, mounted once in `AppNavigator`); inbox rows and banner share `useOpenNotifications`. Evidence in `report/live-notifications-assets/`. Report: `report/live-notifications-implementation-report.html`.
- Setup: Android emulator `WEIF_API_36`, backend `DEV_LOGIN_ENABLED=1 go run .` (restarted on the new code), Metro with `10.0.2.2` env, JS-only change so no native rebuild. Device signed in as **Host** (id 5); Tester (id 4) and Member2 (id 6) driven from the host shell via REST and a small `ws` script.
- Flow (Host on Discover): Tester requests to join Fresh Group 135 → banner slides in under the status bar reading "**Tester** wants to join your plan **Fresh Group 135**." and auto-hides within the 4 s hold (`01-banner-join-request.png`).
- Flow (tap): Member2 requests Fresh Group 135 → banner tapped within 1.5 s → app lands on the Join Request screen listing both pending requests, i.e. the same `openNotification` resolve path as inbox rows (`02-banner-tap-opens-join-request.png`). Profile bell shows the unread dot without the inbox ever being opened (`03-profile-bell-unread.png`).
- Flow (inbox open): with Notifications on screen, Member2 requests Group Picnic 135 → new row appears at the top marked "Now" with the unread dot, and **no banner** (route suppression) (`04-inbox-live-row-no-banner.png`).
- Flow (chat, Host on Discover): Tester sends a message in Group Picnic 135 over WS → banner "New message from **Tester** in **Group Picnic 135**. Tester: …" (`05-banner-chat-message.png`); swipe up dismisses it and the Messages tab dot lights (`06-banner-after-swipe.png`).
- Flow (chat, Host inside the thread): second Tester message → appears in the thread, no banner, no inbox row, unread count unchanged (server-side presence suppression) (`07-thread-suppressed.png`).
- Design pass: the first banner (white card on the white Discover screen) read as a flat strip. Reworked to the app's dark frosted toast material; a second pass made it person-led (sender/requester avatar and name, plan as context, uppercase kind label, message text alone as the body) via `buildBannerContent`; re-checked on device for a chat message and a join request (`01-banner-join-request.png`, `05-banner-chat-message.png` show the final design).
- Artwork pass: payloads now carry `coverKey` and (URL-only) `senderAvatar`. On device, Tester with a remote avatar URL sends a chat message → banner shows the photo (`05-banner-chat-message.png`); Host requests Tester's Live Banner Walk and Tester approves → Host's banner leads with the plan cover (`08-banner-approved-cover.png`, cover served from a local gitignored fixture PNG since real covers are not fetched here).
- Automated: Go `TestNotificationNewFrameOverWebSocket` (3 subtests) + full `go test ./...` (only the pre-existing `TestAPIIntegration/list_covers` failure, gitignored covers); Jest 97 suites / 1329+ tests green incl. new banner, host, hook, context, and ChatContext subscription tests; `tsc` clean; ESLint adds no warnings in touched files (ChatContext keeps its 4 baseline warnings).
- Not verified: iOS; background → foreground `socket:open` count re-sync was exercised only by unit test.
- Final: **PASS** on Android emulator.

## 2026-09-07 — Animation lifecycle repair (verification in progress)

- Change: Create success pops to existing Main; asynchronous list reconciliation; badge mount/hold sequencing; shared-flight cancellation and generation checks; removal of independent stack hold; animation cleanup. Splash and shared cover/title design preserved.
- Environment: local API fixtures, API 36 arm64 emulator, SwiftShader/Vulkan disabled, 720×1600 density 280, release APKs with local URLs and OTA disabled.
- Invalid attempts excluded: hardware renderer stalls; tap before splash completed; fixture filtered after viewer location resolved.
- Valid age matrix: both baseline and fixed reached Details at 15/25/35/40/45/60/120 s. All 14 destination screenshots inspected. Report: `report/animation-repair/status.md`. This signed-out scenario did not reproduce the reported 40-second failure.
- Automated: 115 suites / 1,418 tests passed; later badge regression passed in its five-test suite. Typecheck and lint passed (774 warnings, zero errors).
- Final: **IN PROGRESS**. Signed-in creation, broader animation matrix, long idle/resume and physical-device smoothness remain unverified. No FPS target or app-wide smoothness pass claimed.

## 2026-09-07 — Animation repair, measured release iteration

- Report: `report/animation-repair/performance-report.md`, with per-transition frame tables, screenshots, baseline/final recordings, source-change inventory, excluded experiments and limitations.
- Retained: shared-flight lifecycle guards; removal of competing stack hold; asynchronous post-create reconciliation with stale-list protection; badge/press/shimmer cleanup; memory+disk Create images; active-only confetti. Creation now reads hydrated root state, jumps the existing Main tab to My Events, allows a render opportunity, then pops the form with a route-change guard. Splash/shared visual design preserved.
- Release emulator: API 36 arm64, 720×1600, density 280, SwiftShader/Vulkan disabled, local fixture backend, OTA disabled for QA only. Temporary native manifest changes restored. No physical device or production data used.
- Four main batches: 144 inspected scenario destinations (Create open/cancel-close, group sheet open/close, My Plans/Discover tabs). Keyboard batches: 32 inspected destinations. Earlier shared age/repetition: 54 inspected destinations.
- Final successful creation video: downward dismissal directly onto My Plans, then downward toast entry and confetti. Visible submitting feedback → destination reveal: baseline 2.892 s, final 2.102 s (27.3% shorter in one recording pair; not FPS/population p95). Back returns to Discover, not the submitted form. Two additional open/cancel-close cycles recorded.
- Frame results mixed: confirmation Create-open p95 83.2→72.2 ms; close 76.4→74.8 ms; group-open 62.4→99.9 ms regressed. Earlier Create batch also regressed. Keyboard app-frame p95 opening 112.9→69.3 ms, closing 70.9→60.2 ms (three warm trials each). No consistent app-wide smoothness claim.
- Automated final: 117 suites / 1,425 tests passed; typecheck passed; lint zero errors / 774 existing warnings; release APK build passed. Hidden confetti regression verifies 50→0 particle allocations and 1→0 registered frame callbacks per inactive overlay.
- Final: **PARTIAL PASS** — navigation/lifecycle repair iteration verified; app-wide smoothness acceptance remains open. The exact 40-second failure was not reproduced; longer idle, three-batch stress acceptance, broader animation matrix, phone and iOS validation remain.

- Final resume smoke check: 58.5 seconds in background, same process retained, then signed-in Discover → Details succeeded; recording and settled screenshot inspected. This is one recovery observation, not a long-idle or FPS pass. Create entry still briefly shows image placeholders.

## 2026-09-07 — Animation phone QA APK handoff

- Built `artifacts/animation-performance/animation-phone-qa.apk`: release arm64, production HTTPS API/WSS URLs, OTA disabled for this QA binary so the bundled repairs remain under test. Original native manifest restored after build.
- Connected to the user's Galaxy A56 (SM-A566E) at the explicitly supplied wireless ADB address. Signing certificate matched the installed app; installed with `adb install -r` successfully, without uninstalling or clearing data.
- Verified actual APK bundle contains production API and WS URLs and excludes the emulator fixture endpoint. First assemble reused a stale Gradle bundle; rejected it before installation and forced fresh bundle generation. Installed APK SHA-256 matches `a9ae9c8a8d4590e3b6b8b8d48095b09b63a028d4fe1be168e7d9d7b48076d0ce`.
- Launched MainActivity successfully and verified the app process and resumed activity. No event creation or automated interaction test was performed on the phone; performance/visual acceptance is handed to the user.
- Result: **INSTALL/LAUNCH PASS**, phone animation measurements still pending.


## 2026-09-07 — Airbnb-style image-only transition

**Verdict: design/lifecycle pass on Android emulator; performance not accepted.** Implemented rounded page expansion/return with shared image only. Final release: 11 open/return cycles, all 22 endpoint screenshots checked; two recorded cycles plus 45.13-second idle and 45.24-second background/resume recordings reviewed frame by frame. Same process survived; My Plans and on-screen Back checked. Explicit cached-layer experiments were rejected after native blur/blank-screen failures. Final reset/handoff paths and static Android hero material tested without those observed failures.

Perfetto, ten post-warm-up trials per direction: old → final median trial p95 opening **70.6 → 145.3 ms**, return **83.4 → 108.7 ms**. Final is 17.3% / 25.6% lower than the first new-design prototype, but slower than the old design. These are emulator frame-record timings, not phone FPS. RenderThread CPU increased substantially; see the report's scheduler breakdown.

Validation: 117 Jest suites / 1,428 tests passed; final shared-transition rerun 23 passed; typecheck passed; lint 0 errors / 774 warning baseline. No physical-device or iOS claim. [Report, screenshots, recordings and raw measurements](report/animation-repair/airbnb-implementation-report.md).


## 2026-09-07 — Image-only transition phone APK handoff

- Connected to Galaxy A56 (SM-A566E) using the user-supplied wireless debugging address `192.168.1.9:39779`.
- Built the latest release ARM64 APK with forced fresh JS bundling, production HTTPS API/WSS endpoints, and OTA disabled for this QA binary. Original native manifest restored after build. Gradle assemble passed in 1m 11s.
- Verified bundled production URLs and absence of the emulator fixture endpoint. Artifact: `artifacts/animation-performance/airbnb-phone-qa.apk` (72,901,480 bytes), SHA-256 `9a4df30cec5da2e1241d458be265f1d153213d4364c4d28f2c7a2212f6cb50a1`.
- Installed with `adb install -r` successfully; no uninstall or data clearing. Pulled installed base APK and confirmed its SHA-256 matches the new artifact. MainActivity launched successfully and app process was present.
- Result: **INSTALL/LAUNCH PASS**. Includes the image-only expanding/returning shared transition and earlier animation repairs. Phone animation smoothness and performance acceptance remain for user testing; no production event mutations or phone performance benchmark performed.


## 2026-09-07 — Event Details return endpoint flicker

- Reproduced the reported flash in original video frame 92 (12.946844 s); both cover and badge washed out, neighboring text stayed stable.
- Image fade/source experiment: FAIL, reverted. Retaining completed progress alone: FAIL. Final repair hides the contracted Details surface on the UI thread at the source endpoint and preserves that endpoint through cleanup.
- Final release emulator validation: **PASS for this flicker**, four open/return cycles in two recordings, all 199 captured frames reviewed. No white flash in 87 post-return frames; minimum contrast proxy 95.45%, versus 19.9% in original damaged frame. This is not a frame-time/FPS improvement claim.
- 49 focused tests, typecheck, targeted ESLint and diff check passed. No phone update or iOS test for this repair. [Report and evidence](report/animation-repair/return-flicker-report.md).


## 2026-09-07 — Return flicker fix installed on phone

- Connected to the user-authorized Galaxy A56 at `192.168.1.9:39779`; built release ARM64 with fresh production API/WSS bundling and QA OTA disabled. Original manifest restored.
- Installed `artifacts/animation-performance/return-flicker-phone.apk` with `adb install -r`, preserving app data. Actual installed APK SHA-256 verified on device: `6ad4625df423b3d5194ed748fcdc09b65695258b545edc0ac4c2a92747661be8` (72,901,540 bytes).
- MainActivity launched successfully; process present (PID 15611). **INSTALL/LAUNCH PASS**. The return-endpoint fix is now installed; physical-device visual acceptance remains for the user to test.


## 2026-09-07 — User acceptance and commit handoff

- The user confirmed the installed animation implementation works correctly on their phone and requested commit/push.
- Existing validation: 117 suites / 1,428 tests passed for the implemented design; subsequent endpoint repair passed 49 focused tests, typecheck, targeted ESLint, and release build/install verification. Four final emulator returns were reviewed frame by frame without the reported white flash.
- Visual acceptance is confirmed by the user. Remaining work is optional measured performance tuning (rendering/blur cost and deferred heavy Details content), a comparable before/after device benchmark if access becomes available, and iOS validation. Existing emulator regressions remain documented; acceptance is not a numeric frame-rate claim.


## 2026-09-07 — Card input latency and rapid reopening

- Native input and UI-progress instrumentation on release API 36 emulator, local fixtures, no phone writes. Seven normal pairs per version and eighteen rapid-retap attempts per version; numerical capture without screenrecord.
- Final retained change removes the redundant React Navigation animation lifecycle from successful shared returns; custom image motion and fallback fade remain. Median return endpoint → React unmount: **434.1 → 37.0 ms (91.5% lower)**. Post-endpoint retaps accepted: **1/9 → 9/11**; two residual misses at 18.0/68.4 ms. Verdict: **IMPROVED, NOT FULLY RESOLVED**.
- Opening release → first sampled UI motion **327.2 → 387.5 ms**; no opening improvement established. Accepted final retaps: 315.1 ms median to first sampled opening motion. These are emulator UI-progress timings, not photon latency/FPS/phone performance.
- 117 suites / 1,431 tests passed before final defensive unmount guard; final focused regression/typecheck results recorded in the report. Reviewed 32 final trial screenshots and all 85 frames of two additional visual cycles; no return-endpoint white flash observed. Background/resume fallback restored Discover.
- No phone install, commit, or push for this task. [Report, raw measurements, screenshots and video](report/animation-repair/input-latency-report.md).

- Final defensive unmount guard: 27 focused shared-transition tests and typecheck passed; targeted transition/test/metrics lint passed.


## 2026-09-07 — Input latency cleanup build installed on phone

- User requested build/install. Release ARM64 rebuilt with production API/WSS, transition timing diagnostics explicitly disabled, QA OTA disabled; original Android manifest restored.
- Installed on Galaxy A56 (`192.168.1.9:39779`) with `adb install -r`, preserving app data. Artifact: `artifacts/animation-performance/input-latency-phone.apk`, 72,904,684 bytes, SHA-256 `5caa35c2669695346b3f4eb6a64da0daa6630bde86dea4dd45b8f4d6f1a1d4b5`. Actual installed base APK hash matched.
- MainActivity launched successfully; process present (PID 19765). **INSTALL/LAUNCH PASS**. Includes reduced shared-return route-removal delay and defensive unmount cleanup. Opening startup delay and very early missed retaps remain documented; no new phone performance claim.
