# Remaining Refactoring Review

Generated: June 11, 2026 (implementation results appended the same day)

Branch: `refactor/code-consistency-shared-components`

## Purpose

Code review of the codebase against `report/code-refactoring-consistency-plan.md`, checking which
phases are complete and which refactoring work remains. This document records the findings and the
implementation plan for the remaining work.

Baseline at review time: `npm run typecheck` passes, `npm test` passes (64 suites, 1,108 tests),
`npm run lint` has 0 errors and a 1,195-warning baseline (mostly hardcoded-color warnings).

## Phase Status Summary

| Phase | Goal | Status |
| --- | --- | --- |
| 0 | Guardrails (lint/format/typecheck, aliases) | Done |
| 1 | Theme tokens (radii, shadows, layout, components) | Done |
| 2 | Shared UI primitives (`src/components/ui`) | Done |
| 3 | Semantic haptics | Done — zero direct `expo-haptics` imports outside the service |
| 4 | Unified sheets and overlay actions | Done — `BottomSheet` base, host provider, `EventActionOverlay.prompts` split |
| 5 | Event list refactor | Done — `EventSectionList`, `EventListPage`, `eventListSections` |
| 6 | Event Details decomposition | **Not done** — only `EventDetailsOverlayRoutes`, `EventRequestRow`, `EventMemberRow`, `SlidingTabs` extracted; screen is still 2,197 lines |
| 7 | Create/Edit Event form refactor | **Partial** — `createEventForm.ts` mappers done; screen still 1,038 lines with 12 `useState` calls and inline sheet routing |
| 8 | API client and context boundaries | **Not done** — no `src/api/client.ts`, no `src/api/mappers/`, `raw: any` normalization in `ChatContext` |
| 9 | Navigation cleanup | **Partial** — `Main` route typed, no `props: any`; but icons, tab button, transitions, and sheet wrappers are still inline in the 823-line `AppNavigator.tsx` |
| 10 | Final consistency pass | **Partial** — ~202 hardcoded color hits outside theme/tests, no `logger` service (61 `console.*` calls), several values that already have tokens |

## Detailed Findings

### Phase 6 — Event Details (not done)

`src/screens/EventDetailsScreen.tsx` is 2,197 lines. Structure today:

- Data derivation (event snapshot, conversation lookup, member/request filtering, going
  participants): spread across lines ~108–487.
- Guest actions (`handleSendInvite`, cancel request, leave, delete, report, open chat): ~559–1156.
- Host actions (accept/decline request, member menu, remove/report member): ~608–797.
- Inline JSX for hero, info, host tabs + custom pager (both pages always rendered), overlay member
  lists, read-only members, pinned CTAs: ~1208–1627.
- ~360-line `StyleSheet` at the bottom with ~20 hardcoded colors that already have token
  equivalents (`#808080` → `colors.subText`, `#F4F4F4` → `colors.inputSurface`, `#E6E6E6` →
  `colors.secondaryButtonBackground`, `rgba(0,0,0,0.4)` → overlay token, etc.).
- One effect (auto-send invite after sign-in, ~line 910) omits `handleSendInvite` from its
  dependency array — no eslint suppression, but it must be handled deliberately during extraction.

Safety net: `EventDetailsScreen.test.tsx` (action flows) and
`EventDetailsScreen.rendering.test.tsx` (1,776 lines of rendering coverage).

Planned extraction (all under `src/screens/event-details/`):

| New file | Contents |
| --- | --- |
| `useEventDetailsData.ts` | Event lookup/snapshot, conversation lookup, derived owner/member/request state, going participants, read-only members fetch |
| `useEventDetailsActions.ts` | Invite send (with sign-in redirect + auto-send effect), cancel request, leave, delete, report event, edit, open chat |
| `useHostRequestActions.ts` | Accept/decline request, expand toggle, member menu, remove member, report member |
| `EventDetailsHero.tsx` | Background image, blur, overlays, elevated cover card |
| `EventDetailsInfo.tsx` | Title, host line, going avatars, detail rows, description |
| `HostRequestTabs.tsx` | `SlidingTabs` + animated pager + request/member lists |
| `EventDetailsMembers.tsx` | Group overlay members and read-only members lists |
| `EventDetailsCTA.tsx` | Pinned Interested/Pending/Go-to-Chat CTAs with gradient |
| `EventDetailsScreen.styles.ts` | Styles moved out, hardcoded colors replaced with tokens |

`EventDetailsScreen.tsx` should end as a thin container (~300–400 lines).

### Phase 7 — Create/Edit Event (partial)

Done: `createEventForm.ts` (payload/hydration mappers, unit-tested), `CreateEventBottomSheet` on
the unified sheet system.

Remaining in `src/screens/CreateEventScreen.tsx` (1,038 lines):

- 12 individual `useState` calls for one form (lines ~148–161).
- Sheet routing state machine with 4 timer refs and keyboard settle logic (~163–334).
- Submission and primary-action logic (~491–666).
- Monolithic render helpers (`renderHeader`, form content, sheet content switch).
- `ref={primaryButtonRef as any}` at line ~830 — typeable with a `View` ref.
- 19 hardcoded colors across the screen and `CreateEventScreen.styles.ts`; most need new
  `create*` brand tokens (field card surfaces, dividers, pill backgrounds, shimmer, error text).

Planned extraction (all under `src/screens/create-event/`):

| New file | Contents |
| --- | --- |
| `useCreateEventForm.ts` | Reducer-based form state (name, description, group type, gender, age range, date/time, location fields, cover) with apply/reset helpers |
| `useCreateEventSheets.ts` | Sheet routing, keyboard settle timers, present/close helpers |
| `CreateEventHeader.tsx` | Fixed title + close header |
| `CreateEventFormFields.tsx` | Cover card, name/description inputs, option rows |
| `CreateEventSubmitButton.tsx` | Shimmer button, error text, layout measurement (typed ref) |
| `CreateEventSheetContent.tsx` | Sheet title + content switch |

New theme tokens in `colors.ts`: `createFieldCardBackground`, `createFieldCardBorder`,
`createFieldCardInnerBackground`, `createFieldDivider`, `createFieldValuePillBackground`,
`createTextPlaceholder`, `createErrorText`, shimmer highlight.

### Phase 8 — API client and context boundaries (not done)

Findings:

- Auth-header boilerplate repeats 14 times across `ChatContext`, `EventsContext`, `AuthContext`,
  `PushContext`, `useSingleEventMemberActions`.
- Timeout handling: 4 call sites use `createRequestTimeout`; 8 fetches have no timeout at all.
- JSON-parse-with-fallback and error extraction repeat in 6 places with no shared error type.
- `ChatContext` normalizes payloads with `raw: any` (lines ~250, ~259, ~545) and duplicates event
  normalization that `EventsContext.mapApiEventToUserEvent` already does.
- Navigation side effect: `AuthContext.handleSessionExpired` calls `resetToLogin()` directly.

Planned work:

| New file | Contents |
| --- | --- |
| `src/api/client.ts` | `requestJson` with auth header, timeout, JSON fallback, typed `ApiError` |
| `src/api/errors.ts` | `ApiError` type + response error extraction |
| `src/api/mappers/events.ts` | `mapApiEventToUserEvent` moved out of `EventsContext` |
| `src/api/mappers/chat.ts` | `normalizeParticipant`, `normalizeJoinRequest`, conversation event mapping, typed raw-payload adapters replacing `any` |

Then convert `EventsContext`, `ChatContext`, `AuthContext`, `PushContext`, and
`useSingleEventMemberActions` fetch call sites to the client.

Deliberately deferred (documented decision, not an oversight):

- Splitting `ChatContext`/`EventsContext` into data/actions contexts: ~103 consumer call sites
  each; high churn for a re-render benefit that has not been measured as a problem. Revisit during
  the performance phase.
- Runtime payload validation (Zod): typed mappers are sufficient while the API contract is stable.

### Phase 9 — Navigation cleanup (partial)

Done: `RootStackParamList.Main` is typed, no `props: any` wrappers remain.

Remaining: `AppNavigator.tsx` (823 lines) still inlines:

- Transition interpolators/specs (lines ~77–163) → `src/navigation/transitions.ts`.
- `SheetWrapper`, `AndroidSheetRoute`, sheet route components (~174–239) →
  `src/navigation/SheetRoutes.tsx`.
- Five tab icons (~323–489) → `src/navigation/TabIcons.tsx`.
- `VibratingTabBarButton` (~490–522) → `src/navigation/TabBarButton.tsx`.

Token fixes while moving: sheet radius `28` → `radii.sheet`, backdrop opacity `0.4` → shared
overlay token, icon sizes into component tokens. Route names, params, and navigator options must
not change. Safety net: 25 structural tests in `src/navigation/__tests__/AppNavigator.test.tsx`.

### Phase 10 — Final consistency pass (partial)

Hardcoded colors (~202 outside theme/tests) fall into three buckets:

1. **Already have tokens — replace mechanically.** Examples: `#808080` → `colors.subText`,
   `#707070` → `colors.iconColor`, `#000000` → `colors.text`, `#E6E6E6` →
   `colors.borderSubtle`/`secondaryButtonBackground`, `#F4F4F4` → `colors.inputSurface`,
   `#1C1C1E` → `colors.text` (LocationPicker). Top files: `ProfileScreen` (23),
   `EventDetailsScreen` (22), `EditProfileScreen` (13), `LocationPickerModal.styles` (12).
2. **Need a small number of new tokens.** Profile/onboarding gradients, `#FF9C9C` create-event
   error text, muted-gray variants in EventCreated/LocationPicker.
3. **Legit brand/artwork data — document as exceptions.** `src/constants/covers.ts` (26 gradient
   pairs), `src/utils/avatar.ts` (19-color avatar palette), `ConfettiOverlay` palettes.

Logging: no `src/services/logger.ts`; 61 `console.*` calls outside tests, all mechanical
`console.error`/`console.warn` logging. Plan: add a small dev-only logger service and route
contexts/screens through it.

`setTimeout` audit: all 35 calls are legitimate animation/keyboard/debounce timing; no action.

## Implementation Order

One area at a time, validating (`npx jest <area>`, `npm run typecheck`) after each step:

1. **Navigation split (Phase 9)** — mechanical file moves, lowest risk.
2. **API client + mappers (Phase 8 core)** — `client.ts`, `errors.ts`, mappers, convert contexts,
   remove `raw: any`, move session-expired navigation out of `AuthContext`.
3. **Create/Edit Event (Phase 7)** — form reducer hook, sheets hook, render components, new
   `create*` tokens, remove `primaryButtonRef as any`.
4. **Event Details (Phase 6)** — data/actions/host hooks, UI components, styles file with token
   replacements.
5. **Consistency pass (Phase 10)** — `logger` service + console conversion, mechanical color-token
   replacements, new tokens for the small remaining set, document artwork exceptions.

Each step preserves behavior; no route names, params, API payloads, or visual output change.

## Acceptance Criteria

- `EventDetailsScreen.tsx` and `CreateEventScreen.tsx` become thin containers.
- `AppNavigator.tsx` focuses on route declarations.
- No `raw: any` payload normalization; remaining `any` casts isolated to documented adapter
  boundaries (`api/config.ts` Expo manifest access, Google sign-in result, Firebase badge API).
- Hardcoded colors outside theme are only documented artwork exceptions.
- Typecheck and full Jest suite stay green; lint warning baseline decreases.

## Implementation Results

All five steps were implemented on this branch on June 11, 2026. Existing screen tests
(including the 107 Event Details tests and the Create Event rendering tests) pass unmodified.

What was created:

- Navigation: `src/navigation/transitions.ts`, `SheetRoutes.tsx`, `TabIcons.tsx`,
  `TabBarButton.tsx`.
- API: `src/api/client.ts` (`requestJson` + auth header + timeout + `fetchImpl` composition with
  `authFetch`), `src/api/errors.ts` (`ApiError`, `extractServerErrorMessage`),
  `src/api/mappers/events.ts`, `src/api/mappers/chat.ts` (typed raw-payload adapters, no `any`),
  each with unit tests. `AuthContext` session-expired navigation moved to an `onSessionExpired`
  prop wired in `App.tsx`.
- Create/Edit Event: `src/screens/create-event/useCreateEventForm.ts` (reducer over
  `CreateEventFormState`), `useCreateEventSheets.ts`, `CreateEventHeader.tsx`,
  `CreateEventFormFields.tsx`, `CreateEventSubmitButton.tsx` (typed ref, no `as any`),
  `CreateEventSheetContent.tsx`; new `create*` field/error tokens in `colors.ts`.
- Event Details: `src/screens/event-details/useEventDetailsData.ts`,
  `useEventDetailsActions.ts`, `useHostRequestActions.ts`, `EventDetailsHero.tsx`,
  `EventDetailsInfo.tsx`, `HostRequestTabs.tsx`, `EventDetailsMembers.tsx`,
  `EventDetailsCTA.tsx`, `EventDetailsScreen.styles.ts`.
- Consistency: `src/services/logger.ts` (dev-only) replacing every `console.*` call outside
  tests; profile/onboarding gradient tokens; mechanical token substitutions in Profile,
  Edit Profile, Event Created; artwork-exception comments + eslint overrides for
  `constants/covers.ts`, `utils/avatar.ts`, `ConfettiOverlay.tsx`.

Metrics before → after:

| Metric | Before | After |
| --- | --- | --- |
| `EventDetailsScreen.tsx` | 2,197 lines | 582 lines |
| `CreateEventScreen.tsx` | 1,038 lines | 552 lines |
| `AppNavigator.tsx` | 823 lines | 450 lines |
| `ChatContext.tsx` | 1,185 lines | 986 lines |
| `EventsContext.tsx` | 772 lines | 641 lines |
| Hardcoded color hits outside theme/tests | ~202 | 146 (mostly documented artwork data) |
| `any` outside tests | 9 | 5 (documented adapter boundaries) |
| `console.*` outside tests | 61 | 0 (all routed through `logger`) |
| Lint warnings (0 errors throughout) | 1,195 | 902 |
| Jest | 64 suites / 1,108 tests | 68 suites / 1,137 tests |

Deferred with reasons (see Phase 8 section): context data/actions splits, Zod validation.
