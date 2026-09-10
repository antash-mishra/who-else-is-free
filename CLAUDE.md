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
- Frosted surfaces (cover chip, avatar edit badge, Event Details hero buttons, tab bar, submit
  button, cover-picker check badge, event card badge strip, `EventActionBadge`) render through the
  shared `FrostedSurface` primitive; do not use `BlurView` directly. `expo-blur` disagreed across
  platforms: iOS ran a real `UIVisualEffectView` while Android painted a flat scrim unless a
  surface passed `experimentalBlurMethod`, and only some of ours did. `FrostedSurface` decides once
  per surface and applies the same treatment to both platforms, Android's opt-in included.
- A frosted surface blurs (`blur`) whenever anything with a hard edge passes beneath it, because a
  tint alone leaves that edge running straight through the surface: the Create Event cover chip and
  the cover-picker check badge (photography), and `AvatarEditBadge`, which straddles the avatar's
  rim so the blur mixes the page behind the avatar into the badge. Measured on the cover chip, the
  cover behind it varies by 46 (luminance sd); blurred that falls to 6, tinted alone it stays at 34.
  Do not judge this from a sample taken over a smooth patch of the backdrop - that is how the avatar
  badge was mistakenly first shipped tint-only. Surfaces over a uniformly smooth backdrop do tint
  through `src/theme/materials.ts`, whose multipliers were fitted to the iOS material within 1%
  (hero buttons sit over an already-blurred hero: 9 behind, 5 blurred). Prefer the tint where it
  holds: on Android a live blur captures the screen behind it every frame. `EventCard`'s badge strip
  stays tint-only regardless because it sits inside a `MaskedView`, the offscreen-capture pattern
  that hit a RenderScript crash.
  Pass the surface's existing `intensity` and keep its own background: the material composites over
  it. Android's blur radius is `intensity / blurReductionFactor`, and at the stock 4 it lands far
  weaker than the iOS material; `FrostedSurface` sets 2, which took the cover chip's residual cover
  texture from 0.40 of the backdrop to 0.21 (iOS 0.12). Tune that constant rather than adding a
  per-platform tint on top: the old `heroButtonTint` did that and pushed Android ~28/255 too dark.
  Measured on the WEIF emulator, whose software renderer is not proof of A56 output, the Android
  chip still reads ~15% lighter than iOS; confirm on a physical device before tuning further.
- Never put Android `elevation` on a translucent surface. Android tessellates an elevation shadow
  into a polygon and draws it behind the caster, so it shows through as a visible octagon; it is
  invisible only while something opaque (such as a `BlurView`) covers the interior, which is why
  `AvatarEditBadge` only showed it once its blur became a flat 60%-opaque fill. Even `elevation: 1`
  showed it on an A56. Use `boxShadow` there instead: it renders a real Gaussian shadow and measured
  within 3/255 of the iOS shadow's darkest point. `AvatarEditBadge` keeps its original iOS shadow
  props and takes `boxShadow` on Android only, so iOS is untouched.
- Approving a join request advances the approver's read cursor server-side and the client marks that conversation read for a short grace window, so approval-generated messages (intro, join announcement) never surface as unread for the host.
- Chat system-message copy: new rows say `<Name> joined the plan` and `Plan details updated`;
  `backfillSystemMessageCopy` in `server/repository_schema.go` idempotently rewrites legacy
  `joined the chat` / `Updated Event Detail` bodies (system kind only) so older threads and Messages
  previews match. The client still recognises both spellings for rows that predate the `kind` column.
- `ChatContext` exposes two error strings: `error` (socket or conversations-list failures, rendered by
  Messages) and `threadError` (socket, refresh, or send failures for the active thread, cleared when
  the active conversation changes). `ChatThreadScreen` renders `threadError`, never `error`, so a send
  failure cannot sit on top of the Messages list.
- When `ChatThreadScreen`'s active conversation is cleared underneath it (for example the conversations
  refresh no longer lists it), it leaves through `StackActions.pop(n)` sized to remove itself and every
  sheet stacked above it; a plain `goBack` would only dismiss the top sheet and strand the thread on its
  spinner.
- 1:1 chat member actions live in `useSingleEventMemberActions` and mirror the Event Details member
  flow: menu → `Report & block {name}?` confirmation → reason prompt with the shared placeholder and
  `getMemberReportError` copy. Never surface raw error text in that sheet; the remove failure keeps its
  specified alert copy.
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
  Lifecycle mutations eagerly invalidate related actions. Ended events (`isEventPast`) resolve chat,
  request-created (pending or already handled) and request-approved taps as `unavailable`/`event_ended` at tap time, routed to the
  same Discover `event_unavailable` notice as deleted events, because Messages no longer lists
  past-event conversations. Inbox and OS-push taps must both call
  the authenticated `POST /api/notifications/actions/resolve` boundary through
  `openNotification` in `src/context/pushRouting.ts`; never navigate from raw notification IDs or
  restore client-side entity access checks. Active request tasks land on the chat screen the request
  belongs to (the group `ChatThread`, or `OneToOneHub` for a 1:1 plan, keyed by the negative event id
  when no conversation exists yet) and then raise the `JoinRequest` Requests sheet over it once the
  push transition settles (`runAfterTransition` in `pushRouting.ts`); the server resolution carries
  `group_type` for this, and a resolution without it but with a conversation id is treated as Group
  (older servers only attach conversation ids to group requests). `JoinRequest` is the same transparent-modal sheet the in-chat requests badge
  opens (formerly `PendingRequests`); there is no full-page request review route, and `OneToOneHub`
  is 1:1-only. Inactive tasks remain as one muted historical group with no visible `Handled`/`Unavailable` status line. Read active tasks are
  never dropped from the inbox: they collapse into their own per-conversation/event group and render
  in the lighter read style, so opening a row or "Mark all as read" only lightens it. Push and inbox copy for
  known types is centralized in `notificationCopyFor` in `server/notification_payloads.go`; single
  inbox rows render stored bodies verbatim and collapsed join groups prefer structured
  `payload.senderName` over legacy body parsing.
  Every persisted inbox row is also emitted live as a `notification:new` frame over `/api/ws`
  (`emitNotificationNew` in `server/chat_hub.go`, carrying the same `NotificationView` the REST
  inbox returns); `NotificationsContext` subscribes through `useChat().subscribeToServerEvents`,
  prepends the row, bumps the unread count, and re-syncs the count on `socket:open`.
  Foreground in-app banners are removed; live inbox updates and device push notifications remain.
  Payloads carry `coverKey` for event-bearing types and `senderAvatar` only as a short remote URL
  (`payloadAvatar`), never inline base64, because the same map is the FCM data message.
  Inbox rows open through `useOpenNotifications` (`src/hooks/useOpenNotifications.ts`).
  `EventActionBadge` remains for local action confirmations.

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

Create/Edit Event sheets open on `keyboardWillHide` (from `react-native-keyboard-controller`'s
`KeyboardEvents`), not React Native's `keyboardDidHide`. The did-event only fires once the keyboard
has finished animating, so waiting on it forced the keyboard's exit and the sheet's entry to run
back to back; the will-event fires as the dismissal starts, letting the two overlap. React Native
emits the will-events on iOS only, which is why the keyboard-controller version is used. Do not
reintroduce a settle delay after the event, and keep the fallback timer for devices that never emit
it. `BottomSheet.startOpenAnimation` resets `keyboardOffset` because entry can now begin while a
previous field's keyboard is still on screen.

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

## Event shared transition (image-only expanding page)

- `EventSharedTransitionProvider` owns one image overlay and the progress shared with `EventSharedTransitionPage`. `EventSectionList` primes the source cover at press-in and preserves the `sharedCover` navigation argument. Priming also mounts the overlay invisibly (`primed`, private to the provider: consumers never observe it and must not re-render on press-in) so its bitmap decodes during the press instead of after the destination mounts; a primed overlay for another card or older than `primedFrameTtlMs` is dropped and the press measures afresh. Only the image is shared: never hide, measure, or fly a title for this transition.
- The page expands from the source image bounds with a rounded, clipped surface. Its fixed-size content compensates the shell's nonuniform scale, keeping text proportional. A temporary blurred backdrop separates the page from the retained list. `EventSharedTransitionSourcePage` wraps Main tabs and uses the Android 12+ native blur filter during return, keeping the source clear during opening; iOS uses a sibling BlurView. Older Android keeps the source clear. The image stays at `heroCoverSize`, with translate/scale/rotate; no animated bitmap layout sizes. Motion runs through Reanimated UI-thread shared values.
- `EventDetailsHero` reports its cover frame, rotation, and measurable cover ref. Opening waits for the cover destination and image readiness. The provider starts both timings itself: it writes the source and landing geometry to shared values, then calls `withTiming`; no React commit precedes motion. A bitmap that was ready before the destination landed starts its clock on the next animation frame (`requestAnimationFrame` after `land`), never in the destination's own commit turn, because that turn precedes the heavy mount frame and the following frame would jump ahead; a bitmap reported after landing starts directly. Motion phases (`flying`, `closing`) live only in the provider's ref: consumers observe `landing`, `retained` and `closed`, and every visual rule is progress-driven (a landing page whose progress leaves 0 is opening; a retained page whose progress leaves 1 is returning). Hero cover, card cover, page surface/content, iOS backdrop, Android source blur and overlay visibility all read progress on the UI thread, so a return that starts before any commit still hides and contracts everything on its first frame.
- Successful opening keeps the loaded overlay mounted and hidden over the hero (`retained`); the page is interactive in that phase. `beforeRemove` re-measures both endpoints, writes the shared values and starts the return timing in the same turn, with no React commit of its own; nothing is mounted or loaded, and the full `closing` commit is deferred to completion (`closed`). Hero-button materials are flat fills (`FrostedSurface`), so they are free to keep mounted through motion; the live-material gating that unmounted Android `BlurView`s at return start is gone, along with the 20–30 ms gaps those capturing BlurViews caused. Both timings use `withSteadyTiming` (`src/utils/steadyTiming.ts`, tokens `steadyFrames`/`steadyMaxStepMs` in `motion.ts`): a page at rest leaves the display at its idle cadence, and its switch back to 120 Hz costs ~30 ms between the first two frames after motion starts; a wall-clock `withTiming` turns that into a 15–20 % first step, while the bounded first steps turn it into a few milliseconds of delay. Do not start these timings one frame later to "warm up": frames without drawn content do not switch the display, and the gap then lands inside the motion. The contraction runs for `closeDurationMs` and dispatches the original navigation action once. The page stays hidden after contraction until removal to prevent a full-page flash. Measured on the Galaxy A56 (120 Hz): see `report/animation-repair/shared-transition-phone-report.md` for release/Back-to-first-motion before and after.
- Hero buttons carry a flat `FrostedSurface` fill, so nothing is captured per frame during a shared transition. Explicit hardware layer caching was rejected after release failures. Do not reintroduce live `BlurView`s here or capture them in a cached transform layer: release testing hit a RenderScript context crash. Source-image visibility and final blur clearing follow UI-thread progress so JS completion cannot leave an empty or blurred source. The contracted page surface must also reach opacity 0 at the source endpoint on the UI thread, before JS removes the image overlay. Keep progress at 0 after a completed return during unmount cleanup; resetting it to 1 can re-hide the source before native visibility updates settle.
- Re-measure both endpoints before return. Missing, offscreen, background-invalidated, or timed-out endpoints fall back to normal navigation. All callbacks are generation-scoped; background, viewport change, and unmount cancel outstanding work. Repeated back presses must not dispatch twice. Reduced motion uses a stationary fade.
- Card-origin stack options retain the source and use a transparent, zero-duration opening. Do not add a second stack-opening animation. Other entry points retain their existing navigation. All durations and radii belong in `src/theme/motion.ts`.
- Visual comparison, emulator measurements, and remaining limitations are recorded in `report/animation-repair/airbnb-implementation-report.md`; these are not evidence of physical-device or iOS FPS.

## Animation lifecycle and measurement contracts

- Create success (including queued guest creation) uses `StackActions.popTo('Main', ...)` with MyEvents selected. Never push another Main above the submitted form: the pop owns the downward close and preserves one Main route. MyEvents consumes the created-badge parameter once while focused, after navigation interactions settle.
- `EventsContext.addUserEvent` returns after POST/local insertion; list reconciliation runs asynchronously. Confirmed creations remain in `unreconciledCreations` until observed in a list response, are cleared on session-token change, and are removed after successful deletion. A slow/stale refresh must not hold the form open or remove the just-created event.
- `EventActionBadge` mounts its animated body before entry. A single hold starts after entry finishes, and opacity/travel dismiss together; unmount cancels animation/timers and guards queued completion callbacks. The submit shimmer and delayed ScalePressable feedback must stop on cleanup and respect reduced motion.
- Shared-flight source/image/completion callbacks are generation-scoped. Backgrounding, viewport change, and unmount invalidate outstanding measurements and cancel the animation; late callbacks cannot navigate or cancel a replacement flight.
- Expo public environment values must use static `process.env.EXPO_PUBLIC_*` access. Optional/computed access is not reliably inlined into a release bundle; verify the compiled build reaches the intended local server before emulator writes.
- Emulator performance capture lives in `scripts/performance/` (see its README). Preserve configuration and per-window traces/screenshots before/after; verify destination screenshots and distinguish app deadline misses from compositor jank. Emulator FPS is not physical-device performance. Mobile verdicts remain in `TEST_RUNS.md`.

- Create/Edit Event cover and blurred background use `expo-image` with `cachePolicy="memory-disk"`, matching card images so repeated opens can reuse decoded images. Keep their blur and image-transition design.
- `ConfettiOverlay` mounts its particle simulation only while active and motion is allowed. Hidden celebrations allocate no particle values and register no frame callback; the active simulation explicitly stops its frame callback on cleanup. Do not keep an idle simulation mounted in every My Plans instance.

- Successful event creation uses `completeEventCreation`: pass the hydrated `navigationRef.getRootState()`, select My Events with a targeted tab `jumpTo` and await its render opportunity before popping the form, so dismissal reveals My Plans directly. The helper guards against a changed top route during that wait. A stack-only state snapshot can omit the child key; `navigate` also changes parent focus. Keep the nested pop destination as the unmounted-tab fallback.

- Card-origin shared routes set `animation: 'none'` from initial mount. A successful image return dispatches removal immediately; zero-duration timing alone still retains React Navigation's closing lifecycle. Only failed/unavailable shared returns install `fallbackSharedCoverScreenOptions` (fade), allow two animation frames for the descriptor update, then dispatch once. Cancel pending fallback dispatch on unmount and suppress repeated Back actions. Preserve the existing UI-thread endpoint opacity and progress cleanup guards.
- Optional `EXPO_PUBLIC_TRANSITION_METRICS=true` release diagnostics and `scripts/performance/input-latency/` measure native input to the first sampled UI-thread motion on an isolated emulator. Normal builds leave this flag unset. Report opening delay, closing-start delay, and post-return input availability separately; these samples do not measure display presentation or phone FPS. See `report/animation-repair/input-latency-report.md`.

- Opening-latency diagnostics mount the UI progress probe during preparation and keep its key stable through motion. Compare builds with identical probes; destination-to-ready includes mounting/event scheduling, not just decoding. Rejected opening experiments and measured limits: `report/animation-repair/opening-latency/README.md`.

- Shared source blur derives a primitive radius from the flight phase and progress threshold, then builds its filter from that value. Android opening keeps the source clear (`openingBackdropBlur: 0`) to avoid the measured takeoff hitch; closing retains `backdropBlur: 4`. iOS retains its existing sibling BlurView. Preserve UI-thread clearing at progress ≤ 0.04; rebuilding an equal filter array on every progress tick bypasses Reanimated shallow equality and causes unnecessary updates. Keep the opt-in progress probe bounded and flush it once per completed flight. Evidence: `report/animation-repair/native-opening-investigation.md`.

- `usePrepareCreateEvent` prepares one hidden Create form after Main navigation interactions settle and the cover catalog finishes loading. Reuse an existing prepared route; never replace a live Create/Edit draft. Create-start analytics run on actual focus, and the initial default time is refreshed only when stale. Keep preparation cancellable on blur and keep hidden forms out of hit testing/accessibility through the stack preload mechanism. Create Event explicitly accepts horizontal back gestures across the screen width while retaining its upward opening/downward closing transition; short drags cancel and vertical form scrolling remains available.
