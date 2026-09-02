# CLAUDE.md

Guide for Claude and other coding agents working in this repository.

Follow `AGENTS.md` first. This file mirrors the essentials for Claude-oriented workflows.

## Project

Who Else Is Free is an event discovery and social coordination app.

- Frontend: React Native Expo app in `src/`
- Backend: Go Gin server in `server/`
- API: REST plus WebSocket chat at `/api/ws`
- Navigation: React Navigation stack and bottom tabs in `src/navigation`
- Inactive bottom-tab scenes always use `pointerEvents` and accessibility props. Apply `display: 'none'` only on Android so hidden controls stay out of its accessibility tree; iOS must keep the native scene mounted so nested pan recognizers survive tab revisits. Pagers receive navigation focus through `AnimatedPager.isActive` and rebuild their gesture on the next frame for Android re-registration without remounting list content.
- Bottom obstructions are normalized by `src/utils/bottomObstruction.ts`. When a surface already reserves the system bottom safe area, subtract that inset from keyboard movement or absolute tab-bar clearance instead of counting it twice. Use keyboard-top coordinates when available; do not add device-size or navigation-mode spacing branches in screens.
- State: React Context providers for auth, events, chat, push, covers, and bloom state
- Startup permissions: Discover waits for `BloomContext.transitionComplete`, then serializes `PushContext.requestPushPermission` and `useViewerLocation().requestPermission`. Do not prompt from `App.tsx`, provider mount effects, or the splash route; silent checks and token/location loading for existing grants may still run there.
- Admin support: persistent authorization lives in `admin_users` by immutable user ID;
  `ADMIN_BOOTSTRAP_EMAILS` only provisions verified initial accounts. Support Inbox API mapping is
  in `src/api/adminHelp.ts`, feature state is in `useAdminAccess`/`useAdminHelpSubmissions`, and
  support content must stay out of analytics and routine logs.
- Notifications: historical content stays immutable except for explicit idempotent copy-correction
  migrations, while `action_state` separately tracks live
  action validity (`active`, `resolved`, or `unavailable`). `read` remains independent and unread
  counts include only active rows. The idempotent schema migration/backfill is in
  `server/repository_schema.go`; task types are `chat.message` and `join_request.created`.
  Lifecycle mutations eagerly invalidate related actions. Inbox and OS-push taps must both call
  the authenticated `POST /api/notifications/actions/resolve` boundary through
  `openNotification` in `src/context/pushRouting.ts`; never navigate from raw notification IDs or
  restore client-side entity access checks. Active request tasks open the full-page `JoinRequest`
  route (including conversation-less 1:1 requests); Messages and Event Details use the separate
  `OneToOneHub` route. Inactive tasks remain as one muted historical group. Push and inbox copy for
  known types is centralized in `notificationCopyFor` in `server/notification_payloads.go`; single
  inbox rows render stored bodies verbatim and collapsed join groups prefer structured
  `payload.senderName` over legacy body parsing.

## Working References

- Repo working rules: `AGENTS.md`
- Shared components and shared styling catalog: `report/shared-components-refactor-guide.md`
- Refactor roadmap: `report/code-refactoring-consistency-plan.md`
- Performance reports: `report/performance-consistency-audit.html` and `report/performance-baseline.html`
- Google EAS/Fly secret runbook: `docs/google-build-and-places-secrets.md`

Before adding or refactoring UI, read `report/shared-components-refactor-guide.md`. It explains what each shared component is, where it is used, and which theme/style files act as shared CSS.

## Working Agreement

- Preserve behavior unless the task explicitly asks for behavior change.
- Prefer existing shared components, hooks, services, API helpers, and theme tokens before adding local code.
- Use `EVENT_INFO_SEPARATOR` for event cards and `EVENT_DETAILS_INFO_SEPARATOR` for Event Details rows; both live in `src/constants/display.ts`. Do not replace punctuation in normal prose or saved addresses.
- Keep screens focused on composition, state orchestration, and navigation.
- Move repeated UI, data mapping, payload construction, request helpers, haptics, and action behavior into shared components/helpers.
- Refactor one user-visible area at a time.
- Do not mix structural refactors with performance optimization unless explicitly asked.
- Do not remove user changes or unrelated untracked files.
- Update `AGENTS.md`, `CLAUDE.md`, and relevant report docs when conventions, validation commands, shared primitives, or architectural rules change.

## Shared Components And Styling

Treat "shared CSS" in React Native as:

- theme tokens in `src/theme`
- shared component-owned styles
- feature-level `.styles.ts` files for complex component-local styling

Use shared primitives before local UI:

- UI primitives: `src/components/ui`
- `IconButton` supports a compact visual size with an explicit shared hit-slop token when a header must keep the standard touch target without inheriting the button's layout height.
- Sheets: `src/components/sheets`, `BottomSheetHostProvider`, `BottomSheetModal`, `CreateEventBottomSheet`
- Event lists: `src/components/events`, including `EventListLoadState` for the shared full-page loading/error/retry presentation
- Empty states: `EmptyState`
- Press motion and haptics: `ScalePressable`, `src/services/haptics.ts`
- Dev-only logging: `logger` in `src/services/logger.ts` (use it instead of `console.*`)
- User-profile gender values and onboarding order: `src/constants/profileOptions.ts` (`Male`, `Female`, `Other`); keep these separate from event-audience gender options.
- Create/Edit Event mapping: `src/screens/create-event/createEventForm.ts`
- Create/Edit Event structure: `useCreateEventForm`, `useCreateEventSheets`, and the
  `CreateEventHeader`/`CreateEventFormFields`/`CreateEventSubmitButton`/`CreateEventSheetContent`
  components in `src/screens/create-event/` (all share `CreateEventScreen.styles.ts`). Signed-in and
  signed-out creation share required-field/future-time validation and successful creation returns
  directly to My Events with its created badge/confetti.
- New Create sessions select a random loaded catalog cover through `getRandomCoverKey`; Edit keeps
  the event's existing cover.
- API requests: `requestJson`/`ApiError` in `src/api/client.ts`, error extraction in `src/api/errors.ts`
- API payload mappers: `src/api/mappers` (`events.ts`, `chat.ts`)
- API timeout helpers: `src/api/request.ts`
- Cover catalog search/filter: `searchCovers` in `src/utils/coverSearch.ts`; the
  catalog itself is generated by `server/cmd/covers-sync` from Drive into
  `server/assets/covers/` and `server/covers_catalog.json` — re-run it instead of
  hand-editing covers. Cover images are gitignored; deploys (and fresh clones)
  populate them with `cd server && go run ./cmd/covers-sync -fetch`

Modal bottom sheets should use `BottomSheetModal` so they are coordinated by the shared host and do not stack sibling native modals on iOS. Shared keyboard avoidance keeps the home-indicator inset behind the iOS keyboard while preserving the shared base content spacing; do not add per-modal safe-area or keyboard offsets. Use `onOpened` for focus or heavy content that must wait for sheet entry; Android keyboard lifts use physical-screen keyboard-top coordinates to support `adjustPan`. Use `CreateEventBottomSheet` for Create/Edit Event sheet chrome so it stays on the same modal transition system.

Places autocomplete is country-restricted server-side only when the client supplies the ISO country
resolved from the already-granted viewer location; do not replace it with a client-only result
filter, and leave it unrestricted when the country is unavailable.

Event Details disables stack back-swiping because its host Requests/Members (or Requests/Accepted) section owns horizontal swipes. `HostRequestTabs` direction-locks its pager so vertical drags fail early to the outer screen `ScrollView`; preserve that gesture boundary when changing the tabs.

Do not import `expo-haptics` outside `src/services/haptics.ts`. Do not call `console.*` directly in app code; use `logger` from `src/services/logger.ts`. Hardcoded hex colors outside `src/theme` are only allowed in the documented artwork-palette files (`src/utils/avatar.ts`, `src/components/ConfettiOverlay.tsx`).

## Commands

Frontend:

```sh
npm start
npm run android
npm run ios
npm run web
npm test
npm run typecheck
npm run lint
npm run format:check
```

Backend:

```sh
cd server && go run .
cd server && go test ./...
```

`npm run lint` currently has an existing warning baseline. Do not add new warnings casually; reduce the baseline when touching files.

## Validation

For frontend changes:

- Run the narrowest relevant Jest test first: `npx jest <path-or-pattern> --runInBand --silent`
- Run `npm run typecheck` for TypeScript refactors.
- Run broader tests when changing shared components, navigation, contexts, or API helpers.
- Use Prettier on touched files rather than formatting the whole repo unless the task is a formatting pass.

For visual or interaction changes, smoke test on the connected mobile app/emulator:

- Discover
- My Events
- Create Event
- Messages
- Profile
- Event Details
- Bottom sheets and action menus
- Back navigation

For batch issue work that must be verified on the emulator, use the project-local `fix-issues-on-device` skill (`.pi/skills/`) with the `mobile-mcp` bridge tools (`.pi/extensions/mobile-mcp/`: `mobile_init`, `mobile_open_app`, `mobile_dump_ui`, `mobile_tap`, `mobile_swipe`, `mobile_type`, `mobile_key_press`, `mobile_screenshot`). Pi connects to MCP servers via extensions (no built-in MCP). The skill implements a fix → typecheck/test → `npm run android` → navigate → `mobile_screenshot` → visually verify → retry loop, using `ISSUES.md` as the status board. Verify issues sequentially (one shared emulator). After a fresh clone run `cd .pi/extensions/mobile-mcp && npm install`.

For single-change verification after implementing a feature/fix, use the `test-on-device` skill (`.pi/skills/test-on-device/`). It bypasses Google/Apple sign-in with the dev-login dummy user (backend `POST /api/dev-login` gated by `DEV_LOGIN_ENABLED=1`; client `DevLoginButton` gated by `__DEV__`, mounted in `SignInButtons` with testID `dev-login-button`) and drives the emulator with the `mobile_*` tools, recording pass/fail verdicts on `TEST_RUNS.md`. Full sign-in mode docs (normal vs dev-login, switching, three preset users) in `docs/dev-login.md`. Emulator-only — never targets a physical device. Per-session setup: launch `WEIF_API_36` AVD, run `cd server && DEV_LOGIN_ENABLED=1 go run .`, run Metro with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080 EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080 EXPO_PUBLIC_CHAT_ENABLED=true npm start`, launch with `adb shell am start -n com.whoelseisfree.app/.MainActivity`, tap the `http://10.0.2.2:8081` row on the Dev Launcher screen, tap "Dev Login (tester)". If a physical device is also connected, unplug it OR start pi with `ANDROID_SERIAL=emulator-5554` (mobile-mcp runs bare `adb shell` with no `-s` and fails with `more than one device/emulator` otherwise). Never enable `DEV_LOGIN_ENABLED` in production.

## Import And Type Rules

Import order:

1. React imports.
2. React Native imports.
3. External library imports.
4. Internal alias imports.
5. Relative imports.

Prefer aliases when available:

- `@components/*`
- `@screens/*`
- `@navigation/*`
- `@theme/*`
- `@hooks/*`
- `@utils/*`
- `@context/*`
- `@api/*`
- `@services/*`
- `@assets/*`
- `@constants/*`

Keep route params typed in `src/navigation/types.ts`. Avoid `navigation as any`, `props: any`, and new broad `any` casts.
