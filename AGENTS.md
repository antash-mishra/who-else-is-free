# AGENTS.md

Project guide for coding agents and contributors working in this repository.

## Keep This File Updated

- Update this file whenever project conventions, folder structure, validation commands, shared primitives, or architectural rules change.
- If a refactor introduces a new preferred component, hook, service, API helper, or theme token, document the new rule here in the same change.
- If a command stops working or a new validation gate is added, update the commands below.
- Keep this file concise and practical. It should describe how to work in the repo, not every implementation detail.

## Working References

- Shared components and shared styling catalog: `report/shared-components-refactor-guide.md`.
- Refactor roadmap and rationale: `report/code-refactoring-consistency-plan.md`.
- Performance reports: `report/performance-consistency-audit.html` and `report/performance-baseline.html`.
- Google EAS/Fly secret runbook: `docs/google-build-and-places-secrets.md`.
- Sign-in modes (Google/Apple vs dev-login bypass): `docs/dev-login.md`.
- Admin provisioning, verification, and revocation: `docs/admin-support-operations.md`.
- Mobile QA history reports belong in `report/`; keep QA history separate from evergreen component/style references.

Read `report/shared-components-refactor-guide.md` before adding or refactoring UI. It explains what each shared component is, where it is used, and which theme/style files act as shared CSS.

## Working Agreement

- Preserve behavior unless the task explicitly asks for behavior change.
- Prefer the existing shared component, hook, service, API helper, or theme token before creating a local implementation.
- Treat "shared CSS" in React Native as `src/theme` tokens plus shared component-owned styles.
- Keep screens focused on composition, state orchestration, and navigation. Move repeated UI, data mapping, and side-effect helpers into shared components/hooks/helpers.
- Refactor one user-visible area at a time and avoid mixing structural refactors with performance optimization unless the task asks for both.
- When a change introduces or changes a shared primitive, token, helper, validation command, or architectural rule, update `AGENTS.md`, `CLAUDE.md`, and the relevant report reference in the same change.
- Do not remove user changes or unrelated untracked files.

## Build And Run Commands

- Frontend dev server: `npm start`
- Android app: `npm run android`
- iOS app: `npm run ios`
- Web app: `npm run web`
- Frontend tests: `npm test`
- Frontend typecheck: `npm run typecheck`
- Frontend lint: `npm run lint`
- Format all files: `npm run format`
- Check formatting: `npm run format:check`
- Backend server: `cd server && go run .`
- Backend tests: `cd server && go test ./...`

`npm run lint` currently exits green with a warning baseline for existing import order, hardcoded colors, `any`, hook, and unused-code debt. Do not add new warnings casually; prefer reducing the baseline as files are touched.

## Architecture

- Admin Support Inbox: Contact Us and Feedback submissions remain in `help_submissions`. Sensitive
  reads and status changes go through the session- and database-role-protected `/api/admin` group;
  runtime authorization checks `admin_users.user_id`, never a client-provided email or embedded admin
  secret. `ADMIN_BOOTSTRAP_EMAILS` is provisioning-only: matching verified accounts receive a
  persistent user-ID grant and the secret can then be removed. Client transport/mapping lives in
  `src/api/adminHelp.ts`, list state in `useAdminHelpSubmissions`, access discovery in
  `useAdminAccess`, and the Profile-only routes are `AdminSupportInbox` and
  `AdminSupportSubmission`. Keep support content out of analytics and routine logs; retention rules
  are in `docs/support-data-retention.md`.
- Notifications inbox: server-side notification history is persisted in the `notifications` table (one row per recipient per push) by `recordAndSendPushToUser`/`recordAndSendPushToUsers` on `*ChatHub` (`server/notification_recorder.go`). Persistence is best-effort — a row-insert failure logs and still sends the FCM push, so push delivery is never degraded. Historical content (`type`/title/body/payload) stays immutable except for explicit idempotent copy-correction migrations; live action validity is tracked separately by `action_state` (`active`, `resolved`, `unavailable`), nullable reason/resolution time, and optional `join_request_id`. `read` remains independent, and unread counts include only active rows. Task types are `chat.message` and `join_request.created`; the other four current types are outcomes. The idempotent startup migration/backfill lives in `repository_schema.go`, and lifecycle mutations eagerly invalidate related actions before their live records disappear. The authenticated `POST /api/notifications/actions/resolve` endpoint is the authorization and destination boundary for both inbox and OS-push taps; new pushes include recipient-specific `notificationId` values when persistence succeeds, while validated type/entity hints remain the permanent no-ID fallback. Client opening is centralized in `openNotification` (`src/context/pushRouting.ts`): active request tasks open the full-page `JoinRequest` route even when a 1:1 request has no conversation yet, while unavailable actions route safely to Discover with a typed one-shot `EventActionOverlay` notice. The Messages/Event Details 1:1 host flow uses `OneToOneHub`; keep it separate from notification request review. `NotificationsContext` (`src/context/NotificationsContext.tsx`) holds the paginated list + unread count and applies successful resolutions optimistically; inactive tasks render as one muted `Handled`/`Unavailable` history group. Push and inbox copy for known types is owned by `notificationCopyFor` in `server/notification_payloads.go`; single inbox rows render the stored body verbatim while collapsed groups use structured payload fields. The bell `IconButton` + `CountBadge` live in the Profile header and are hidden for signed-out users. Live delivery: every persisted row is also emitted as a `notification:new` WebSocket frame (`emitNotificationNew` in `server/chat_hub.go`, routed through the hub's `direct` channel so `clientsByUser` is only read on the hub goroutine; payload is the REST `NotificationView`). `ChatContext` exposes `subscribeToServerEvents` (plus a synthetic `socket:open` event) so `NotificationsContext` can prepend the row, bump the unread count, and re-sync the count after reconnects without owning the socket. `NotificationBannerHost` (`src/components/NotificationBannerHost.tsx`, mounted once in `AppNavigator` as a sibling of the `NavigationContainer`) renders the single foreground `NotificationBanner`; it is suppressed on the `Notifications` route, for the active chat conversation, and for read/inactive rows. Never mount per-screen notification banners. Banner taps and inbox row taps share `useOpenNotifications` (`src/hooks/useOpenNotifications.ts`). Payload decoration: every event-bearing push/inbox payload carries `coverKey`, and chat/join-request payloads carry `senderAvatar` only when `payloadAvatar` accepts it (short `http(s)` URL; inline base64 avatars are dropped so the FCM data message stays under 4 KB). The banner (`buildBannerContent`) and inbox rows (`resolveNotificationCoverUri`) prefer these payload fields, then the conversation roster / loaded events, then a seeded monogram.

- Frontend: React Native Expo app in `src/`, with root app setup in `App.tsx` and root registration in `index.ts`.
- Backend: Go Gin HTTP server in `server/` using SQLite.
- API: REST endpoints plus WebSocket chat at `/api/ws`.
- Navigation: React Navigation stack and bottom tabs in `src/navigation`.
- Inactive bottom-tab scenes always use `pointerEvents` and accessibility props. Apply `display: 'none'` only on Android so hidden controls stay out of its accessibility tree; iOS must keep the native scene mounted so nested pan recognizers survive tab revisits. Pagers receive navigation focus through `AnimatedPager.isActive` and rebuild their gesture on the next frame for Android re-registration without remounting list content.
- Bottom obstructions are normalized by `src/utils/bottomObstruction.ts`. When a surface already reserves the system bottom safe area, subtract that inset from keyboard movement or absolute tab-bar clearance instead of counting it twice. Use keyboard-top coordinates when available; do not add device-size or navigation-mode spacing branches in screens.
- Chat thread on Android keeps the window in `ADJUST_NOTHING` and pads the thread body by the keyboard lift (`useAndroidKeyboardLift` in `ChatThreadScreen.tsx`), so the composer rises and the message list shrinks together; do not translate the composer alone or the latest messages end up under the keyboard.
- Text inputs use `typography.inputLetterSpacing` / `inputDetailLetterSpacing` instead of the negative text tracking tokens. Android applies negative letter spacing symmetrically, which pushes a placeholder's first glyph under the caret.
- Event Details floating hero buttons render through `HeroButtonBlur`, which enables `experimentalBlurMethod` on Android and layers `componentTokens.overlay.heroButtonTint` over it; plain `BlurView` is a flat tint on Android.
- Approving a join request advances the approver's read cursor server-side and the client marks that conversation read for a short grace window, so approval-generated messages (intro, join announcement) never surface as unread for the host.
- State: React Context providers currently handle auth, events, chat, push, covers, bloom, and notifications state.
- First-launch notification and location prompts are owned by Discover after `BloomContext.transitionComplete`; never request system permissions from `App.tsx`, provider mount effects, or the splash route. `PushContext.requestPushPermission` serializes notification authorization and token registration only observes existing grants; `useViewerLocation` inspects permission silently on mount and exposes `requestPermission` for the Discover sequence. Keep the prompts serialized so native dialogs cannot overlap.
- Theme: shared tokens live in `src/theme`, including colors, spacing, typography, springs, radii, shadows, layout, and component tokens.
- Event metadata punctuation: use `EVENT_INFO_SEPARATOR` for event cards and `EVENT_DETAILS_INFO_SEPARATOR` for Event Details rows; both live in `src/constants/display.ts`. Keep normal prose and saved address punctuation unchanged.
- User-profile gender values and their onboarding order live in `src/constants/profileOptions.ts`; keep them ordered as `Male`, `Female`, `Other` and separate from the event-audience options in `src/constants/eventOptions.ts`.
- Shared UI primitives live in `src/components/ui`; use them before adding local button, icon button, text field, checkbox, separator, section header, or tab implementations. `IconButton` may use a compact visual size with an explicit shared hit-slop token when header alignment must stay independent of its touch target.
- Shared sheet primitives live in `src/components/sheets`; use `BottomSheetHostProvider` for modal-sheet coordination and `BottomSheet`, `SheetHeader`, and `SheetActionList` for sheet surfaces and action menus before adding local sheet chrome.
- Modal bottom sheets should go through `BottomSheetModal` so iOS uses the shared host instead of stacking sibling native modals. Shared keyboard avoidance keeps the home-indicator inset behind the iOS keyboard while preserving the shared base content spacing; do not add per-modal safe-area or keyboard offsets. `onOpened` is the single entry-settled signal for deferred keyboard focus or heavy sheet content; on Android it uses physical-screen keyboard-top coordinates to remain correct with `adjustPan`. Use `CreateEventBottomSheet` for Create/Edit Event sheet chrome so it stays on the same modal transition system.
- Event Details disables stack back-swiping because its host Requests/Members (or Requests/Accepted) section owns horizontal swipes. `HostRequestTabs` direction-locks its pager so vertical drags fail early to the outer screen `ScrollView`; preserve that gesture boundary when changing the tabs.
- Tabbed pager screens wire their tab strip and pager through `useTabbedPages` (`src/hooks/useTabbedPages.ts`). Spread its `pagerProps` onto `AnimatedPager` and `tabsProps` onto `SegmentedControl` rather than passing `pageOffsetSV`, `selectedIndex` and `onChange` by hand: Discover and My Events already shared both components and the indicator still drifted apart, because the offset can be given to the pager and forgotten on the tabs. Selection is tracked by value, not index, since Discover's options are dynamic; the hook falls back to the first option when the selected one leaves the list. Event Details' `HostRequestTabs` keeps its own direction-locked pager and is deliberately not on this hook.
- Shared event-list primitives live in `src/components/events`; use `EventSectionList`, `EventListPage`, `EventListLoadState`, and `eventListSections` helpers before duplicating event card lists, loading/error presentation, or date grouping in screens.
- Shared component/style documentation lives in `report/shared-components-refactor-guide.md`; update it when shared components, shared style files, or theme-token ownership changes.
- Create/Edit Event form mapping lives in `src/screens/create-event/createEventForm.ts`; keep payload construction, edit hydration, guest draft mapping, and date normalization there instead of rebuilding them in `CreateEventScreen`. New Create sessions choose a random loaded catalog cover through `getRandomCoverKey`; Edit always preserves the event cover.
- Create/Edit Event screen structure lives in `src/screens/create-event/`: form state in `useCreateEventForm` (reducer over `CreateEventFormState`), sheet routing/keyboard-settle timing in `useCreateEventSheets`, and render pieces in `CreateEventHeader`, `CreateEventFormFields`, `CreateEventSubmitButton`, and `CreateEventSheetContent`. `CreateEventScreen` stays composition plus submission/navigation orchestration; the pieces share `CreateEventScreen.styles.ts` and the `createField*`/`createText*` theme tokens.
- Create-plan validation is shared by signed-in and signed-out flows: name, description, and location are required, and the scheduled time must be in the future. Successful creation returns directly to My Events with its existing created badge/confetti; do not add an intermediate success route.
- Shared request helpers live in `src/api`: `requestJson` and `ApiError` in `src/api/client.ts` (base-URL prefixing, auth header, timeout, JSON fallback, typed errors), error extraction in `src/api/errors.ts`, timeout/abort primitives in `src/api/request.ts`, and API payload mappers in `src/api/mappers` (`events.ts`, `chat.ts`, `notifications.ts`). Use them instead of duplicating fetch/auth-header/error boilerplate inside contexts and hooks.
- Session-expired navigation is wired via the `onSessionExpired` prop on `AuthProvider` (set in `App.tsx`); contexts must not import navigation directly. Inbox-tab and bell routing goes through `routeFromNotification` in `src/context/pushRouting.ts` (inbox-only; the OS push-tap `handleNotificationTap` is a separate, frozen path).
- Motion tokens live in `src/theme/motion.ts` beside the frozen `src/theme/springs.ts`; keep the four `Springs` presets' values unchanged because `src/navigation/transitions.ts` is tuned against them. Scrapbook entry motion goes through `Placed` in `src/components/motion` (animates once per `id`, so list recycling and pager page changes never replay an entry), with capped stagger from `staggerDelayMs` and deterministic tilt from `src/utils/seededRandom.ts`. Every animated primitive must honour Reanimated's `useReducedMotion()` and degrade to a static or opacity-only presentation. `ScalePressable`'s `tilt` prop and `AppTabs`' `pageOffsetSV` prop are both opt-in: omitted, those components behave exactly as before.
- Runtime permissions: never gate a request on a derived permission status. `expo-modules-core` computes UNDETERMINED vs DENIED from its own `expo.modules.permissions.asked` SharedPreferences record, and Android auto-backup restores that record onto a fresh install (the generated backup rules include every sharedpref except `SecureStore`), so a new install can report DENIED with `canAskAgain` false while the system has never actually asked. Check `granted`, and otherwise call the request and let the OS decide; requesting a genuinely blocked permission is a no-op. `useViewerLocation` and both `ImagePicker.requestMediaLibraryPermissionsAsync` call sites follow this.
- Haptics are centralized in `src/services/haptics.ts`; no other source file should import `expo-haptics`.
- Logging goes through the dev-only `logger` in `src/services/logger.ts`; do not call `console.*` directly in app code (tests may still spy on `console`).
- Hardcoded hex colors are only allowed in `src/theme` and the documented artwork-palette exceptions: `src/utils/avatar.ts` and `src/components/ConfettiOverlay.tsx`.
- The event cover catalog is generated: `server/cmd/covers-sync` downloads the team Drive folder into `server/assets/covers/` and writes `server/covers_catalog.json` (embedded into the server binary). Re-run `cd server && go run ./cmd/covers-sync` when Drive contents change; do not hand-edit the catalog or assets. The images themselves are gitignored (public repo) — only the catalog is committed, and the Docker build runs `go run ./cmd/covers-sync -fetch` to download the cataloged images at deploy time. After a fresh clone, run that fetch command once to populate `server/assets/covers/`. Cover search/filtering in the app goes through `searchCovers` in `src/utils/coverSearch.ts`.
- Places autocomplete is country-restricted in `server/places_handler.go` only when the client supplies the ISO country resolved from the already-granted viewer location. Pass it through to Google Places `includedRegionCodes`; leave search unrestricted when permission or reverse geocoding is unavailable.
- Keep navigation route params typed in `src/navigation/types.ts`; use `NavigatorScreenParams` for nested navigators and avoid `navigation as any` casts for route jumps. The `Notifications` route (`NotificationsScreen`) is a top-level stack screen reachable from the Profile header bell.
- Navigation-specific surfaces and status colors should use named tokens from `src/theme/colors.ts`, not local hex or rgba literals in `AppNavigator`.
- Tests: Jest tests live near source files under `__tests__`.

## Import Rules

Use this order:

1. React imports.
2. React Native imports.
3. External library imports.
4. Internal alias imports.
5. Relative imports.

Prefer aliases over deep relative paths when an alias exists:

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

Keep aliases aligned across `tsconfig.json`, `babel.config.js`, and `jest.config.js`.

## TypeScript Rules

- Strict TypeScript is expected.
- Use interfaces or named types for component props, hook return values, context values, and API payloads.
- Avoid `any`. If external data is unknown, isolate parsing/casting in adapter or mapper files.
- Keep navigation params typed in `src/navigation/types.ts`.
- Do not spread `navigation as any` or `props: any` into new code. Add proper route/screen types instead.
- Prefer pure mapper functions for API payload conversion.

## React Native Component Rules

- Use functional components and hooks.
- Keep screens as composition layers. Move reusable UI, data derivation, and actions into components/hooks.
- Prefer shared primitives over duplicating local UI:
  - buttons
  - icon buttons
  - text fields
  - checkbox rows
  - empty states
  - list separators
  - section headers
  - sheets
  - tabs/segmented controls
  - event rows and member/request rows
- If two UI elements look like the same interaction, they should use the same component or hook so styling, animation, haptics, accessibility, loading, and disabled behavior stay consistent.
- Local one-off animation is allowed only for genuinely unique screen moments, not for common buttons, cards, tabs, sheets, menus, or CTAs.

## Styling And Theme Rules

- Prefer tokens from `src/theme` over raw values.
- Do not introduce new hardcoded colors, radii, shadows, spacing, button heights, or overlay opacity unless there is a specific reason.
- Add missing tokens before spreading a new repeated value across screens.
- Use `src/theme/radii.ts`, `shadows.ts`, `layout.ts`, and `components.ts` for repeated radius, shadow, screen padding, hit slop, z-index, button, input, icon, avatar, overlay, and segmented-control values.
- Shared components should own their visual states: default, pressed, disabled, loading, selected, error, and destructive.
- Keep brand-specific or screen-specific tokens named and centralized.
- Treat "shared CSS" in React Native as shared theme tokens plus shared components.
- Use feature-level `.styles.ts` files for complex component-local styling that is not broadly reusable yet. If a style pattern repeats across features, promote it to a theme token or shared component.

## Motion And Haptics Rules

- Shared UI components should own their motion and feedback behavior.
- Use semantic helpers from `src/services/haptics.ts` for feedback such as `selection`, `light`, `submit`, `success`, `warning`, `error`, and `destructive`.
- Do not import `expo-haptics` outside `src/services/haptics.ts`.
- Repeated interactions should share animation constants or component-level motion tokens.
- Bottom sheets, action menus, buttons, cards, tabs, and CTAs should feel consistent across the app.

## State And API Rules

- Keep API transport and payload normalization out of screen components.
- Prefer shared API helpers for auth headers, JSON parsing, timeout handling, and error handling once they exist.
- Keep context providers focused on state orchestration, not large transport implementations.
- Split large contexts by data/actions when high-churn state causes broad rerenders.
- Avoid navigation side effects inside contexts unless there is no practical alternative.

## Refactoring Rules

- Preserve behavior unless the task explicitly asks for behavior change.
- Refactor one user-visible area at a time.
- Start with low-risk shared foundations before large screen rewrites.
- Keep route names and navigation params stable during UI extraction.
- Do not combine structural refactors with performance optimizations unless the task asks for both.
- When extracting a component, move only the code required for that component and keep tests passing.
- Prefer mechanical extraction first, then cleanup.
- Do not remove user changes or unrelated untracked files.

## Current Refactor Plan

The working refactor roadmap is documented in:

- `report/code-refactoring-consistency-plan.md`
- `report/shared-components-refactor-guide.md`

Use that plan for ordering:

1. Guardrails and tooling.
2. Theme tokens.
3. Shared UI primitives.
4. Semantic haptics and pressables.
5. Sheet and overlay consolidation.
6. Event list refactor.
7. Event Details decomposition.
8. Create/Edit Event form refactor.
9. API client and context boundaries.
10. Navigation cleanup.
11. Final consistency pass.

Completed so far: guardrails/tooling, expanded theme tokens, shared UI primitives, semantic haptics/pressables, sheet/action overlay foundations, shared event-list foundations, Event Details overlay-route extraction, Create/Edit Event form mapping helpers, shared API request timeout helpers, typed nested navigation params, navigation color token cleanup, and mobile layout/accessibility fixes for the shared foundations.

## Testing And Validation

For frontend changes, run the narrowest relevant test first, then broader validation when the change has shared impact.

Recommended commands:

- Targeted Jest test: `npx jest <path-or-pattern> --runInBand --silent`
- Full frontend tests: `npm test -- --runInBand --silent`
- Frontend typecheck: `npm run typecheck`
- Frontend lint: `npm run lint`
- Format check: `npm run format:check`
- Backend tests: `cd server && go test ./...`

Run `npm run typecheck` for TypeScript refactors. For formatting, the full repo still has a legacy formatting baseline; use Prettier on touched files and avoid whole-repo formatting churn unless the task is explicitly a formatting pass.

For visual or interaction refactors, manually smoke test on the connected mobile app/emulator:

- Discover
- My Events
- Create Event
- Messages
- Profile
- Event Details
- Bottom sheets and action menus
- Back navigation

### Emulator Verification With mobile-mcp

Pi's documented way to connect to MCP servers is via **extensions** (pi has no built-in MCP support; see its README philosophy: "Build CLI tools with READMEs (Skills), or build an extension that adds MCP support"). Both pieces below are **project-local** under `.pi/` so they travel with the repo and load after project trust:

- `.pi/extensions/mobile-mcp/` — a bridge extension that spawns the `mobile-mcp` server as a stdio subprocess and exposes the Android emulator/device as pi tools: `mobile_init`, `mobile_open_app`, `mobile_dump_ui`, `mobile_tap`, `mobile_swipe`, `mobile_type`, `mobile_key_press`, `mobile_screenshot`, `mobile_list_packages`. `mobile_screenshot` returns a real PNG that vision-capable models can see, so fixes can be visually verified. After a fresh clone, run `cd .pi/extensions/mobile-mcp && npm install` once (its `node_modules` is gitignored).
- `.pi/skills/fix-issues-on-device/SKILL.md` — the batch workflow: implement a fix, run typecheck/tests, rebuild and install via `npm run android`, navigate to the issue's screen with `mobile_dump_ui`/`mobile_tap`, capture `mobile_screenshot`, inspect it, and retry up to 5 times per issue, using `ISSUES.md` as the live status board.
- `.pi/skills/test-on-device/SKILL.md` — the single-change verification workflow: after implementing a feature/fix, prove it works on the Android emulator by bypassing Google/Apple sign-in with a dev-login dummy user and driving the app with the `mobile_*` tools. Covers starting an AVD, env wiring for emulator builds (`EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080`), Metro preconditions, handling the Expo Dev Launcher screen, signing in via the `DevLoginButton` (testID `dev-login-button`, mounted inside `SignInButtons` behind `__DEV__`), reproducing the changed flow, and recording a pass/fail verdict on `TEST_RUNS.md`. Emulator-only — never targets a physical device.

### Dev-Login Bypass For Emulator Testing

For testing on the emulator without going through Google/Apple sign-in, the backend exposes a dev-login route and the client a `__DEV__`-gated button. **See [`docs/dev-login.md`](docs/dev-login.md) for the full setup, the three preset test users, switching between normal and dev-login modes, and the end-to-end emulator recipe.** Quick recap:

- **Server** (`server/auth_handler.go`): `POST /api/dev-login` registered ONLY when `DEV_LOGIN_ENABLED=1` (env flag, off by default, logs a loud `WARNING` when on). It reuses `getOrCreateUserByEmail` + `respondWithIssuedSession`, so the returned token is a real session JWT accepted by every authenticated endpoint and the WebSocket. Request body: `{"email":"tester@who-else-is-free.test","name":"Tester","profile_complete":true}`. The fixed email keeps a stable, reproducible seed user across sessions. **Never enable `DEV_LOGIN_ENABLED` in production or commit it to `.env` / `Dockerfile` / EAS build config.**
- **Client** (`src/components/DevLoginButton.tsx`): `__DEV__`-gated button that calls `useAuth().signInWithDevUser(...)` on tap, mounting inside `SignInButtons` so it appears on every unauthenticated surface. In release builds (`__DEV__ === false`) the default export is `() => null`, so the button can never render regardless of the backend flag.
- **Two independent switches, both off in production:** the server env flag AND the client `__DEV__` gate. Either alone is enough to keep dev-login out of release builds.

### Emulator Test Session Setup

When running the `test-on-device` skill, the per-session environment is:

- **Emulator AVD:** `WEIF_API_36` (launched via `~/Library/Android/sdk/emulator/emulator -avd WEIF_API_36 -no-snapshot-load`). The `emulator` binary is not on `$PATH` by default; use the absolute path.
- **Targeting:** if a physical device is also connected over USB, `mobile-mcp` fails with `adb: more than one device/emulator` (it runs bare `adb shell` with no `-s <serial>`). Either unplug the physical device, OR start pi with `ANDROID_SERIAL=emulator-5554` so the mobile-mcp subprocess inherits it. Verify the target is an emulator (`emulator-<port>` + `product:sdk_gphone*`) via `adb devices -l`.
- **Backend:** `cd server && DEV_LOGIN_ENABLED=1 go run .` (listens on `:8080`).
- **Metro:** `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080 EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080 EXPO_PUBLIC_CHAT_ENABLED=true npm start`. The `10.0.2.2` alias is the emulator's special route to the host loopback — it does NOT exist on physical devices.
- **App launch:** `adb shell am start -n com.whoelseisfree.app/.MainActivity` (the `mobile_open_app` `monkey` invocation silently no-ops on this Expo Dev Launcher build). If the app lands on the Dev Launcher screen listing dev servers, tap the `http://10.0.2.2:8081` row to connect to Metro.
- **Status board:** keep `TEST_RUNS.md` in the project root as the durable log of every device-test verdict.

One emulator is a shared device, so verify changes sequentially, never call `mobile_*` tools in parallel. Trust the project with `/trust` (or `pi -a`) so `.pi/` resources load.

## Known Quality Gates To Improve

- Reduce lint warning baseline.
- Establish a green full-repo format baseline without mixing it into behavior refactors.
- Keep direct haptic imports restricted to `src/services/haptics.ts`.
- Reduce hardcoded style values outside theme.
- Reduce large screen/context files.
- Remove avoidable `any` casts.
- Consolidate repeated sheet, tab, button, list, and action-menu implementations.

## Backend Notes

- Keep backend changes inside `server/` unless frontend API types must be updated too.
- Run `cd server && go test ./...` after backend changes.
- Keep endpoint behavior and payload shape documented in frontend mappers when they are introduced.
- Notification push and inbox text is owned server-side by `notificationCopyFor` in `server/notification_payloads.go`. New copy changes must update that contract and its push/inbox tests together. Single rows render stored bodies verbatim; collapsed join groups use structured `payload.senderName` first and retain body parsing only for legacy rows.

## Plan details and input-sheet contracts

- Group member presentation includes the host exactly once, first with a Host label and no moderation menu. Group headline counts and Members lists use the same roster. The 1:1 Accepted list remains requester-only.
- Event Details member reports carry an explicit person target; plan and person prompts must identify the same target as their submit handler. Accepted guests read their intro from More actions, not an inline Introduction section.
- `EventActionConfirm.headerAlign` defaults to left; use center for removal confirmations. Report-plan menu entries use normal text; destructive leaving/removal retains its warning color.
- Shared `BottomSheet` entry waits for native `onShow`, runs once per opening, and does not restart on content or viewport updates. Input sheets constrain height above the keyboard; `EventActionOverlay` keeps the CTA outside the scrollable text-entry body.

## Event cover shared transition

- `EventCoverTransitionProvider` (`src/components/events/EventCoverTransition.tsx`) owns the single root cover overlay. `EventSectionList` measures the tapped `EventCard` cover and passes `sharedCover` through its press callback into the typed Event Details route. Preserve this callback argument in new list entry points.
- `EventDetailsHero` measures its unrotated cover container, hides its duplicate during the flight, and keeps its resting tilt without replaying `Placed` on handoff. Card-origin navigation fades behind the overlay; other entry points retain the existing slide. Back navigation uses a fade for card-origin routes; the shared flight is forward-only.
- `eventCoverMotion` in `src/theme/motion.ts` owns duration, fallback timeouts, and both cover radii. Reduced motion uses a stationary cover and page fade. Missing/recycled measurements and image errors fall back without blocking navigation. Keep the overlay outside the stack so list clipping and screen transforms cannot clip the moving image.
