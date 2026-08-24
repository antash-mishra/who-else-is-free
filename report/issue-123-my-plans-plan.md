# Issue #123: My Plans Fix Plan

## Goal

Bring My Plans in line with the copy and load-state behavior requested in
[GitHub issue #123](https://github.com/antash-mishra/who-else-is-free/issues/123), while preserving
the existing tabs, event filtering, navigation, refresh behavior, and signed-out sign-in sheet.

## Baseline And Findings

- Baseline commit: `ae0e49e` (`feat: resolve stale notification actions`). The worktree was clean
  when this plan was prepared, and that commit does not change `MyEventsScreen`.
- Signed-out copy currently says `No plans yet` / `Sign in to see the plans you've created or
joined`; the requested copy is `Your plans are waiting` / `Get started to create or join plans.`
  The existing `Get started` action and sign-in sheet behavior can remain unchanged.
- The signed-in Hosting empty state already has the requested title, `No plans hosted`, but its
  description must change from `Create a plan and get things started.` to
  `Your hosted plans will appear here.`
- The event-card comma-to-middle-dot production change is already present from commit `68ee869`
  through the shared `EVENT_INFO_SEPARATOR` used by `EventCard` and event-display formatters. No
  second production punctuation change is needed. However,
  `src/screens/__tests__/MyEventsScreen.rendering.test.tsx` still expects `Group, 18-35`; the
  targeted test currently fails because the UI correctly renders `Group · 18-35`.
- `EventsContext` already exposes `isLoading`, `error`, and `refreshEvents`. `MyEventsScreen` does
  not consume the first two, so an empty initial request renders a false empty state and a failed
  request renders no error or recovery action.
- Discover already defines the desired visual and behavioral contract: initial spinner, then an
  accessible error icon, `Unable to load plans.`, and `Try again`. Its implementation is currently
  local to `HomeScreen`, so copying it into My Plans would create two versions of the same state.

## Scope Decisions

- Apply the loading/error gate only to signed-in My Plans. Signed-out users continue to see the
  sign-in empty state regardless of authenticated event-request state.
- Treat `/api/events` as the screen-level source for this issue. Do not expand the work into new
  per-tab error APIs for chat-derived Joined data or `/api/chat/requests/me`; those are separate
  state-model changes not requested by issue #123.
- Show the full content-area error only when the event request failed and there is no cached event
  data, matching Discover. If cached events exist, retain the lists during a background refresh or
  transient refresh failure.
- Keep the My Plans header and segmented tabs visible while the content area is loading or in
  error, as shown in the issue analysis. Replace only the pager/list content.
- Preserve the current three tab-specific empty states other than the requested Hosting copy.

## Implementation Plan

### 1. Share Discover's event-list load state

- Add a small component under `src/components/events` that owns the event-list loading and error
  presentation: centered `ActivityIndicator`, accessible error icon, error text, and shared
  `AppButton` retry action.
- Export it from `src/components/events/index.ts`.
- Replace the local loading/error markup and duplicate styles in `HomeScreen` with the shared
  component, preserving Discover's current appearance, copy, and retry behavior.
- Document the shared primitive in `report/shared-components-refactor-guide.md`, `AGENTS.md`, and
  `CLAUDE.md`, as required when introducing a shared component.

### 2. Apply explicit state precedence in My Plans

- Destructure `isLoading` and `error` from `useEvents()` in `MyEventsScreen`.
- Track the same successful-data/initial-load guard used by Discover so background refreshes do not
  unnecessarily replace cached content.
- Derive mutually exclusive signed-in states in this order:
  1. initial loading with no cached events;
  2. load error with no cached events;
  3. the existing pager, whose individual tabs may then render genuine empty states.
- Render the shared load-state component below the floating header. Wire `Try again` to the existing
  refresh orchestration so a retry refreshes the event data and, where applicable, requested-event
  data without creating a second request path.
- Leave pull-to-refresh behavior and per-tab refresh indicators unchanged once list content exists.

### 3. Apply the requested copy

- Signed out:
  - Title: `Your plans are waiting`
  - Description: `Get started to create or join plans.`
  - CTA: `Get started` (existing action still opens `BottomSheetModal` with `SignInButtons`)
- Signed in, Hosting tab:
  - Title: `No plans hosted`
  - Description: `Your hosted plans will appear here.`
- Do not change Joined or Requests copy because issue #123 specifies only Hosting for signed-in
  users.

### 4. Close the punctuation regression gap

- Update the stale My Plans rendering assertion to expect `Group · 18-35`.
- Add or retain an assertion for the location/time line (for example,
  `Central Park · 10:00`) so both event-card metadata rows are protected by the shared separator.
- Do not modify saved addresses or prose punctuation; `EVENT_INFO_SEPARATOR` remains limited to
  compact metadata.

## Test Plan

### Automated coverage

- Add focused tests for the new shared load-state component:
  - loading spinner renders without error controls;
  - error icon/message/retry button render;
  - the icon has an accessible label;
  - pressing retry invokes the callback.
- Extend `MyEventsScreen.rendering.test.tsx` to cover:
  - exact signed-out title, description, and CTA;
  - exact signed-in Hosting title and description;
  - initial loading does not show a tab empty state;
  - failed uncached load shows `Unable to load plans.` and `Try again`, not `No plans hosted`;
  - retry calls the intended refresh functions;
  - cached content remains visible during background loading/error;
  - both event-card metadata lines use the middle dot.
- Keep/update `HomeScreen.rendering.test.tsx` assertions to prove the shared extraction did not alter
  Discover's loader, error message, retry action, or cached-data behavior.
- Run, in order:
  - `npx jest src/components/events/__tests__/<load-state-test> --runInBand --silent`
  - `npx jest src/screens/__tests__/MyEventsScreen.rendering.test.tsx --runInBand --silent`
  - `npx jest src/screens/__tests__/HomeScreen.rendering.test.tsx --runInBand --silent`
  - `npm run typecheck`
  - `npm run lint`
  - Prettier/check formatting on touched files only.

### Android emulator verification

- Follow the repository's `test-on-device` workflow and record the verdict in `TEST_RUNS.md`.
- Verify signed out: no tabs, new copy, and `Get started` opens the sign-in sheet.
- Dev-login with an account that has no hosted plans and verify the Hosting empty-state copy.
- Verify a populated event card uses middle dots for location/time and compact audience metadata.
- With a stored authenticated session and no cached events, make the backend unavailable, reopen My
  Plans, and verify the header/tabs remain visible while the content shows the same error state as
  Discover. Restore the backend, press `Try again`, and verify the real list or genuine empty state
  replaces the error.

## Expected Files

- `src/components/events/<shared-load-state>.tsx` (new)
- `src/components/events/index.ts`
- `src/components/events/__tests__/<shared-load-state-test>.tsx` (new)
- `src/screens/HomeScreen.tsx`
- `src/screens/MyEventsScreen.tsx`
- `src/screens/__tests__/HomeScreen.rendering.test.tsx`
- `src/screens/__tests__/MyEventsScreen.rendering.test.tsx`
- `report/shared-components-refactor-guide.md`
- `AGENTS.md`
- `CLAUDE.md`
- `TEST_RUNS.md` after device verification

## Acceptance Criteria

- All issue #123 copy matches exactly.
- Event-card metadata uses `·` and the stale My Plans test is green.
- Signed-in My Plans never presents an uncached loading or failed `/api/events` request as a genuine
  empty state.
- My Plans and Discover use the same loading/error presentation and accessible retry control.
- Retry recovers after the backend becomes available, while cached lists remain usable during later
  refresh failures.
- Targeted tests, typecheck, lint, touched-file formatting, and Android device verification pass.
