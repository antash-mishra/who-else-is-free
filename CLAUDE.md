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
- Chat thread on Android keeps the window in `ADJUST_NOTHING` and pads the thread body by the keyboard lift (`useAndroidKeyboardLift` in `ChatThreadScreen.tsx`), so the composer rises and the message list shrinks together; do not translate the composer alone or the latest messages end up under the keyboard.
- Text inputs use `typography.inputLetterSpacing` / `inputDetailLetterSpacing` instead of the negative text tracking tokens. Android applies negative letter spacing symmetrically, which pushes a placeholder's first glyph under the caret.
- Event Details floating hero buttons render through `HeroButtonBlur`, which enables `experimentalBlurMethod` on Android and layers `componentTokens.overlay.heroButtonTint` over it; plain `BlurView` is a flat tint on Android.
- Approving a join request advances the approver's read cursor server-side and the client marks that conversation read for a short grace window, so approval-generated messages (intro, join announcement) never surface as unread for the host.
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
  Every persisted inbox row is also emitted live as a `notification:new` frame over `/api/ws`
  (`emitNotificationNew` in `server/chat_hub.go`, carrying the same `NotificationView` the REST
  inbox returns); `NotificationsContext` subscribes through `useChat().subscribeToServerEvents`,
  prepends the row, bumps the unread count, and re-syncs the count on `socket:open`.
  `NotificationBannerHost` (mounted once in `AppNavigator` above the `NavigationContainer`) is the
  only foreground banner surface; it suppresses banners on the Notifications route and for the
  active chat conversation, and shapes its copy per type with `buildBannerContent`
  (`src/utils/notificationBanner.ts`). Payloads carry `coverKey` for event-bearing types and
  `senderAvatar` only as a short remote URL (`payloadAvatar`), never inline base64, because the same
  map is the FCM data message. Do not mount per-screen notification banners (`EventActionBadge` stays
  for local action confirmations). Inbox rows and the banner both open through
  `useOpenNotifications` (`src/hooks/useOpenNotifications.ts`).

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
- Tabbed pager wiring: `useTabbedPages` in `src/hooks/useTabbedPages.ts`. Spread `pagerProps` onto
  `AnimatedPager` and `tabsProps` onto `SegmentedControl` instead of passing `pageOffsetSV`,
  `selectedIndex` and `onChange` separately, so the tab indicator cannot stop tracking the pager.
  Selection is by value, not index (Discover's options are dynamic), and the hook falls back to the
  first option when the selected one disappears. `HostRequestTabs` keeps its own frozen pager and
  stays off this hook.
- Empty states: `EmptyState`
- Press motion and haptics: `ScalePressable`, `src/services/haptics.ts`
- Motion tokens: `src/theme/motion.ts`, layered beside the frozen `src/theme/springs.ts` (the four
  `Springs` preset values must not change; `src/navigation/transitions.ts` is tuned against them)
- Scrapbook entry motion: `Placed` in `src/components/motion`. It animates once per `id`, so
  `SectionList` recycling and pager page changes never replay an entry; pass a stable unique `id`.
  `tiltMode` is `entry` (settles square), `rest` (settles at a slight angle, for photo cards), or
  `none` (for overlapping avatars). Stagger is capped by `staggerDelayMs`; tilt angles come from
  `src/utils/seededRandom.ts`, shared with the confetti engine.
- Every animated primitive must honour Reanimated's `useReducedMotion()` and degrade to a static or
  opacity-only presentation. `ScalePressable`'s `tilt` and `AppTabs`' `pageOffsetSV` are opt-in;
  omitted, both components behave exactly as before.
- Dev-only logging: `logger` in `src/services/logger.ts` (use it instead of `console.*`)
- Runtime permissions: never gate a request on a derived status. `expo-modules-core` derives
  UNDETERMINED vs DENIED from its own `expo.modules.permissions.asked` SharedPreferences record, and
  Android auto-backup restores that record onto a fresh install, so a new install can report DENIED
  with `canAskAgain` false while the system has never asked. Check `granted`, otherwise request and
  let the OS decide — requesting a blocked permission is a no-op.
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

## Plan details and input-sheet contracts

- Group member presentation includes the host exactly once, first with a Host label and no moderation menu. Group headline counts and Members lists use the same roster. The 1:1 Accepted list remains requester-only.
- Event Details member reports carry an explicit person target; plan and person prompts must identify the same target as their submit handler. Accepted guests read their intro from More actions, not an inline Introduction section.
- `EventActionConfirm.headerAlign` defaults to left; use center for removal confirmations. Report-plan menu entries use normal text; destructive leaving/removal retains its warning color.
- Shared `BottomSheet` entry waits for native `onShow`, runs once per opening, and does not restart on content or viewport updates. Input sheets constrain height above the keyboard; `EventActionOverlay` keeps the CTA outside the scrollable text-entry body.

## Event shared transition (cover + title)

- `EventSharedTransitionProvider` (`src/components/events/EventSharedTransition.tsx`) owns the single root overlay that flies an event card's cover and title into Event Details. `EventSectionList` primes the card's frames at press-in (before the press scale distorts them), hands `{ imageUri, title, titleStyle, coverRef, titleRef }` to `open`, and passes `sharedCover` through its press callback into the typed Event Details route. Preserve this callback argument in new list entry points. Rows read the stable actions context plus `useEventSharedTransitionState`, and the tapped card hides its own cover and title while its event is `flying` so the elements move rather than duplicate.
- `EventDetailsHero` lands the cover (`land(eventId, 'cover', frame, { rotation })`) and `EventDetailsInfo` lands the title (`land(eventId, 'title', frame, { titleStyle })`). Both hide their duplicate while their event is in flight and keep the resting tilt without replaying `Placed`. The flight starts once the cover has landed and the title has landed or `titleGraceMs` has passed; `landTimeoutMs` releases a tap whose destination never lands.
- The overlays are transform-only. The cover is laid out once at `heroCoverSize` and moved with translate/scale/rotate plus a scale-compensated border radius, so no frame commits a shadow tree or resizes the image view (expo-image re-decodes the bitmap on every resize). The title is a single one-line replica in the Details style that scales from the card's font size from its top-left corner; the Details title stays hidden until hand-off, where the replica is pixel-identical to its first line (revealing it earlier reads as a second copy). Take-off waits for the cover bitmap's `onLoad` or `imageGraceMs`. Never animate `width`, `height`, `top`, or `left` on these overlays; that is what made the original flight stutter. Overlay worklets read only shared values and per-flight constants (the cover target is written to a shared value right before take-off, and the title body mounts only once its frames are known): a closure that changes at landing reaches the UI thread through a React effect, which a busy JS thread delays by several frames.
- Card-origin Event Details wraps its content in `EventSharedTransitionPage`, whose opacity follows the flight progress up to `pageRevealEnd`. `sharedCoverScreenOptions` keeps the stack card transparent and holds the origin list attached for `holdMs`; only the close is a stack fade. Reduced motion fades the page in place without a flight, other entry points keep the slide, leaving the page releases its flight, and a card-origin open whose event is not cached (Past Events) releases the flight and fades its loading fallback in.
- `eventSharedMotion` in `src/theme/motion.ts` owns every duration, deadline, and radius; `heroCoverWidthFraction` is shared with the hero styles. Keep the overlay outside the stack so list clipping and screen transforms cannot clip the moving elements.
