# Code Refactoring and Consistency Plan

Generated: June 7, 2026

## Purpose

Before doing performance optimization, reduce code redundancy, visual drift, and implementation inconsistency in the React Native app. The goal is not a redesign. The goal is to make the existing app easier to change safely by introducing shared primitives, clearer feature boundaries, and enforceable coding standards.

## Current Snapshot

The app already has useful foundations:

- Strict TypeScript is enabled in `tsconfig.json`.
- Path aliases exist for core folders such as `@components`, `@screens`, `@context`, `@theme`, `@utils`, and `@api`.
- Shared theme files exist in `src/theme`.
- Reusable components already exist for screen containers, headers, event cards, segmented controls, empty states, bottom sheets, and avatars.
- There is broad Jest coverage across screens, contexts, components, and utilities.

The main issue is that those foundations are only partially applied. Many screens still define their own styling, interaction behavior, haptics, form controls, buttons, list scaffolding, and API state handling.

Rough codebase measurements from this audit:

| Metric | Current observation |
| --- | --- |
| App TypeScript/TSX lines, excluding tests | About 21,794 |
| Largest app file | `src/screens/EventDetailsScreen.tsx`, 2,734 lines |
| Other large files | `ChatContext.tsx` 1,273, `CreateEventScreen.tsx` 1,188, `ChatThreadScreen.tsx` 875, `AppNavigator.tsx` 816 |
| `StyleSheet.create` usage | 42 app files |
| Hardcoded color hits outside `src/theme` and tests | About 321 |
| Direct `Haptics.*` calls outside tests | About 122 |
| Animation calls outside tests | About 75 |
| `setTimeout` calls outside tests | About 29 |
| Console calls outside tests | About 61 |
| Lint/format config | Not present |

## High-Level Findings

### 1. Design Tokens Exist, But Are Too Thin

`src/theme/colors.ts`, `spacing.ts`, `typography.ts`, and `springs.ts` exist, but the app still repeats many raw values:

- Colors such as `#000000`, `#FFFFFF`, `#F4F4F4`, `#E6E6E6`, `#999999`, `#FF383C`, and many rgba overlays are repeated in components and screens.
- Border radii such as `20`, `26`, `28`, `32`, and `999` are repeated.
- Button heights such as `51` and `52` are repeated.
- Common overlay/backdrop styles are repeated between sheet and action components.
- Shadows are defined inline in multiple places.

Examples:

- `src/components/EmptyState.tsx` defines its own primary and secondary buttons, colors, dimensions, and haptics.
- `src/components/help/HelpForm.tsx` repeats input, checkbox, and submit button styles.
- `src/components/BottomSheetModal.styles.ts` and `src/components/CreateEventBottomSheet.tsx` duplicate sheet dimensions, radius, backdrop, shadow, and close-button styling.
- `src/components/SegmentedControl.tsx` uses hardcoded animated colors instead of theme tokens.

### 2. Shared Components Exist, But Their Responsibilities Are Uneven

Reusable components are present, but some are too narrow and some are too broad:

- `ScreenContainer` centralizes safe area and horizontal padding, but still hardcodes white instead of using `colors.background`.
- `ScreenHeader` is useful, but there is no broader screen shell for floating headers, scroll padding, page title rows, or tabbed list screens.
- `ScalePressable` centralizes press scale, but haptics still live in every caller.
- `EmptyState` includes button styling and haptics internally, duplicating button behavior instead of using a shared button primitive.
- `SegmentedControl` solves one tab UI, while `EventDetailsScreen` implements a separate tab/underline system inline.
- `EventActionOverlay` is a single large union component that renders many variants internally. It is reusable, but the implementation is hard to evolve and hard to test variant-by-variant.

### 3. Multiple Bottom Sheet Systems Are Competing

There are at least three sheet paths:

- `BottomSheetModal` for generic modal sheets.
- `CreateEventBottomSheet` for Create/Edit event sheets.
- Navigation-managed sheet wrappers in `AppNavigator`.

They overlap heavily in shape and styling but differ in animation, mounting, keyboard behavior, and Android behavior. This makes UI consistency hard and increases the chance of fixing one sheet while another drifts.

### 4. Same Visual Patterns Do Not Always Share The Same Behavior

Several UI patterns look like the same design but are implemented separately, so they can feel different at runtime. A shared component should own the complete behavior, not just the static styles.

Examples to consolidate:

- Pressable cards and buttons should share press scale, haptic feedback, disabled state, loading state, and accessibility behavior.
- Segmented controls and tab headers should share underline/selection animation instead of each screen writing a local tab animation.
- Bottom sheets should share open/close timing, backdrop behavior, keyboard handling, close affordances, and Android/iOS behavior.
- Action menus and confirmation prompts should share destructive, primary, secondary, loading, and disabled behavior.
- Empty states should share layout, optional illustration/icon rendering, CTA behavior, and button animation.

This is the core consistency goal: if two pieces of UI are conceptually the same interaction, they should use the same component or hook so styling, animation, haptics, accessibility, and tests move together.

### 5. Event List Screens Repeat Data and UI Scaffolding

`HomeScreen`, `MyEventsScreen`, and `PastEventsScreen` repeat:

- Event-to-card mapping.
- Date grouping and section building.
- `SectionList` configuration.
- Section headers and separators.
- Empty state wrappers.
- Refresh controls.
- Event card press handling.
- Floating header spacing.

Examples:

- `HomeScreen` has its own `toEventCardItem`, `buildSections`, `EventCardItem`, and three repeated `SectionList` blocks.
- `MyEventsScreen` has a separate `toEventCardItem`, `buildSections`, `EventCardItem`, and three repeated `SectionList` blocks.

This is a good first feature-level refactor because the behavior is well bounded and the payoff is immediate.

### 6. Large Screens Are Mixing Too Many Concerns

The biggest files combine data loading, normalization, business rules, UI state, animations, haptics, list rendering, modal routing, and styles in one component.

Primary candidates:

- `src/screens/EventDetailsScreen.tsx`
  - Contains event data selection, host request actions, member management, reporting, invite sending, chat navigation, inline tabs, overlays, pinned CTAs, read-only state, and a large stylesheet.
  - Renders request and member collections with `.map()` inside the screen.
  - Implements a custom inline pager where both pages are always rendered.
  - Contains a hook dependency suppression around auto-sending an invite after sign-in.

- `src/screens/CreateEventScreen.tsx`
  - Owns form state, edit mode mapping, sheet routing, keyboard timing, shimmer animation, submission logic, location selection, cover selection, and rendering.
  - Uses many individual `useState` calls for one form that could be a reducer or form hook.

- `src/navigation/AppNavigator.tsx`
  - Owns route registration, stack animation specs, Android sheet wrappers, tab icons, custom tab button animation, analytics, tab styles, and navigation theme.

- `src/context/ChatContext.tsx`
  - Owns WebSocket connection, reconnect behavior, conversation refresh, message refresh, join request actions, member reporting, payload normalization, unread state, and active conversation state.

- `src/context/EventsContext.tsx`
  - Owns event fetching, request state, report state, guest event queueing, create/update/delete, API mapping, analytics, sorting, and navigation side effects.

### 7. Haptics Are Not Semantic

There are about 122 direct `Haptics.*` calls outside tests. Most calls choose `Light`, `Medium`, `Success`, `Warning`, or `Error` locally.

This makes feedback inconsistent because every feature decides what "select", "submit", "delete", "success", or "error" feels like. It also makes testing and disabling haptics harder.

### 8. API and Normalization Logic Is Repeated

There are repeated patterns for:

- Request timeouts using `AbortController`.
- Auth headers.
- JSON parsing with fallback.
- `snake_case` to `camelCase` conversion.
- Error message extraction.
- Request-id race protection.
- Logging errors.

Examples:

- `EventsContext.tsx` and `ChatContext.tsx` each define their own `createRequestTimeout` and `isAbortError`.
- `ChatContext.tsx` normalizes raw payloads with `any` in several places.
- `AuthContext`, `EventsContext`, `ChatContext`, `PushContext`, hooks, and screens all make API calls directly.

### 9. Type Safety Has Escape Hatches

Strict TypeScript is enabled, but several places bypass it:

- `RootStackParamList.Main` is `any`.
- Navigation wrappers use `(props: any)`.
- Some navigation calls cast `navigation as any`.
- Push routing casts `navigationRef as any`.
- Chat payload normalization uses `raw: any`.
- Expo metadata access uses `(Constants.manifest2 as any)` and `(Constants.manifest as any)`.

Some `any` use may be practical around external APIs, but it should be isolated in typed adapters rather than spread across feature code.

### 10. Tooling Cannot Enforce The Intended Style Yet

There is no ESLint config, no Prettier config, and no lint script in `package.json`. That means the style guidelines in `AGENTS.md` are manual conventions only.

There is also slight alias drift:

- `tsconfig.json` and `jest.config.js` include aliases such as `@api` and `@constants`.
- `babel.config.js` does not include all of the same aliases explicitly.

## Recommended Target Structure

This should be introduced incrementally. Avoid a large folder migration in one pass.

Proposed additions:

```text
src/theme/
  colors.ts
  spacing.ts
  typography.ts
  springs.ts
  radii.ts
  shadows.ts
  layout.ts
  components.ts

src/components/ui/
  AppText.tsx
  AppButton.tsx
  IconButton.tsx
  TextField.tsx
  CheckboxRow.tsx
  Surface.tsx
  Badge.tsx
  ListSeparator.tsx

src/components/motion/
  ScalePressable.tsx
  AnimatedTabs.tsx
  PressFeedback.tsx

src/components/sheets/
  BottomSheet.tsx
  SheetHeader.tsx
  SheetActionList.tsx

src/components/events/
  EventSectionList.tsx
  EventListPage.tsx
  eventListSections.ts
  EventMemberRow.tsx
  EventRequestRow.tsx

src/services/
  haptics.ts
  logger.ts

src/api/
  client.ts
  errors.ts
  timeout.ts
  mappers/
    events.ts
    chat.ts
    auth.ts
```

Alternative: use `src/features/events`, `src/features/chat`, and `src/features/profile` later. For the first refactor, prefer smaller moves under existing folders to reduce import churn.

## Refactoring Principles

Use these rules while implementing the plan:

1. Preserve behavior unless a task explicitly says otherwise.
2. Refactor one user-visible area at a time.
3. Add or update tests before extracting high-risk logic.
4. Keep route names and navigation params stable during UI extraction.
5. Prefer shared primitives over copy-pasting styles.
6. Use semantic tokens, not raw colors or magic numbers.
7. Shared UI primitives must own their motion, haptics, disabled behavior, loading behavior, and accessibility contract.
8. Do not create a new local animation for an existing interaction pattern unless the component API cannot support it yet.
9. Keep API normalization outside components and contexts.
10. Remove `any` by adding small adapter types, not by spreading casts.
11. Make each PR small enough to verify manually on device.
12. After visual refactors, run the same mobile smoke path: Discover, My Events, Create, Messages, Profile, Event Details, sheets, and Back navigation.

## Phase Plan

### Phase 0 - Guardrails First

Goal: make style and type expectations enforceable before touching many files.

Tasks:

- Add scripts to `package.json`:
  - `typecheck`: `tsc --noEmit`
  - `lint`
  - `format`
  - `format:check`
- Add ESLint for React Native and TypeScript.
- Add Prettier and a small repo config.
- Add import ordering rules matching `AGENTS.md`: React -> external libraries -> internal aliases.
- Add rules or warnings for:
  - Direct `expo-haptics` imports outside `src/services/haptics.ts`.
  - Hardcoded colors outside theme files.
  - `any` outside approved adapter files.
  - Unused styles and imports.
- Align aliases across `tsconfig.json`, `babel.config.js`, and `jest.config.js`.
- Fix the current typecheck blockers before relying on `typecheck` as a gate.

Acceptance criteria:

- `npm run typecheck` passes.
- `npm run lint` passes or produces only documented warnings.
- `npm test -- --runInBand --silent` has a known baseline, ideally green before large refactors.
- No behavior changes.

### Phase 1 - Expand Theme Tokens

Goal: create the missing "shared CSS" layer for React Native.

Tasks:

- Add `radii.ts`:
  - `sm`, `md`, `lg`, `xl`, `pill`, `sheet`.
- Add `shadows.ts`:
  - `card`, `floating`, `sheet`.
- Add `layout.ts`:
  - screen horizontal padding, tab bar height helpers, hit slop presets, common z-indexes.
- Add `components.ts` or component token groups:
  - button heights, input heights, icon sizes, avatar sizes, overlay opacities.
- Convert obvious hardcoded values in low-risk shared components first:
  - `ScreenContainer`
  - `ScreenHeader`
  - `EmptyState`
  - `SegmentedControl`
  - `BottomSheetModal.styles`
- Keep brand-specific tokens for Create Event separate, but still named.

Acceptance criteria:

- New tokens are used by shared components.
- No visual behavior changes intended.
- Hardcoded color count outside theme begins trending down.

### Phase 2 - Shared UI Primitives

Goal: stop every screen from defining buttons, inputs, checkboxes, and separators differently.

Tasks:

- Create `AppText` variants:
  - `title`, `subtitle`, `body`, `caption`, `button`, `error`.
- Create `AppButton` variants:
  - `primary`, `secondary`, `destructive`, `ghost`.
  - Built-in loading state.
  - Built-in disabled state.
  - Uses semantic haptics.
  - Owns press animation instead of each caller composing local press behavior.
- Create `IconButton`:
  - Consistent hit slop, size, background, accessibility label requirement.
- Create `TextField`:
  - Single-line and multiline variants.
  - Shared placeholder color, input background, radius, error text.
- Create `CheckboxRow`.
- Create `ListSeparator` and `SectionHeaderText`.
- Create shared animated tab/segmented primitives so screens do not reimplement underline, count, and selected-state motion.
- Update `EmptyState`, `HelpForm`, `SignInButtons`, and simple profile/help screens to use these primitives.

Acceptance criteria:

- At least one full low-risk flow uses the shared primitives end-to-end. Good candidates: Help screens or Profile signed-out state.
- Button height/radius/color duplication drops.
- Similar-looking buttons, tabs, inputs, and empty states also share the same animation and feedback behavior.
- Direct haptic calls in converted components are removed.

### Phase 3 - Semantic Haptics and Pressables

Goal: make interaction feedback consistent and testable.

Tasks:

- Add `src/services/haptics.ts` with functions such as:
  - `selection()`
  - `lightImpact()`
  - `submit()`
  - `success()`
  - `warning()`
  - `error()`
  - `destructive()`
- Make the service no-op gracefully on unsupported platforms.
- Add a `HapticPressable` or extend `ScalePressable` with a `haptic` prop.
- Replace direct `Haptics.*` calls in shared components first.
- Then replace direct calls screen-by-screen.

Acceptance criteria:

- No direct `expo-haptics` imports in converted screens/components.
- Haptic meaning is chosen semantically at call sites.
- Tests mock one haptics service instead of mocking Expo haptics everywhere.

### Phase 4 - Unify Sheets and Overlay Actions

Goal: one bottom sheet foundation with predictable behavior.

Tasks:

- Create one `BottomSheet` component that supports:
  - title or content-only mode.
  - snap height.
  - keyboard avoidance.
  - consistent backdrop.
  - consistent close button.
  - Android-safe behavior.
- Move common sheet styles from `BottomSheetModal.styles` and `CreateEventBottomSheet` into shared sheet tokens.
- Replace `CreateEventBottomSheet` with a configured `BottomSheet` if possible.
- Revisit navigation-managed sheet wrappers after generic sheets are stable.
- Split `EventActionOverlay` variants into small components:
  - `InvitePrompt`
  - `ManageEventMenu`
  - `ConfirmActionSheet`
  - `ResultPrompt`
  - `PendingRequestMenu`
  - `ReportPrompt`
  - `ActionMenu`
  - `IntroMessagePrompt`
- Keep a facade `EventActionOverlay` if that reduces call-site churn.

Acceptance criteria:

- Generic sheets and Create Event sheets share one visual/animation base.
- `EventActionOverlay.tsx` is small enough to understand at a glance or delegates all variants.
- Existing overlay tests still pass with updated component boundaries.

### Phase 5 - Event List Refactor

Goal: remove duplication from Discover, My Events, and Past Events before performance-specific list work.

Tasks:

- Extract event list data helpers:
  - `toEventCardItem`
  - `buildEventSections`
  - `buildSingleEventSection`
  - `sortEventsByCreatedAtDesc`
- Create `EventSectionList`:
  - Receives sections, render event press, empty state, refresh state, header padding, bottom inset.
  - Owns section separators, item separators, footer spacing, and refresh control defaults.
- Create `EventListPage` for pager children.
- Convert `HomeScreen` three list pages.
- Convert `MyEventsScreen` three list pages.
- Convert `PastEventsScreen` if the API shape allows it.
- Keep `AnimatedPager` behavior unchanged in this phase.

Acceptance criteria:

- Home/My Events list UI still matches current behavior.
- Repeated `SectionList` blocks are removed.
- Event section helpers are covered by unit tests.

### Phase 6 - Event Details Decomposition

Goal: split the highest-risk screen into testable pieces without changing behavior.

Suggested extraction order:

1. `useEventDetailsData`
   - Event lookup, snapshot behavior, conversation lookup, owner/member/request derived state.
2. `useEventDetailsActions`
   - Invite send, cancel request, leave event, delete event, report event, chat open.
3. `useHostRequestActions`
   - Accept, decline, report/remove member.
4. UI components:
   - `EventDetailsHero`
   - `EventDetailsInfo`
   - `EventDetailsCTA`
   - `HostRequestTabs`
   - `RequestRow`
   - `MemberRow`
   - `EventDetailsOverlayRoutes`
5. Move styles next to extracted components.

Keep the first extraction mechanical. Do not combine this with list virtualization or navigation changes.

Acceptance criteria:

- `EventDetailsScreen.tsx` becomes a thin container.
- No hook dependency suppressions remain unless they have a documented technical reason.
- Host and member action tests cover the extracted hooks.
- Existing Event Details rendering tests are updated and passing.

### Phase 7 - Create/Edit Event Form Refactor

Goal: reduce form and sheet complexity in `CreateEventScreen`.

Tasks:

- Move form state into `useCreateEventForm`.
  - Consider `useReducer` because the form has many related fields.
  - Represent `selectedDateTime`, location, age range, group type, gender, and cover as one typed state.
- Move submit/edit mapping into helpers:
  - `createFormStateFromEvent`
  - `createEventInputFromForm`
  - `updateEventInputFromForm`
- Move sheet routing into `useCreateEventSheets`.
- Extract render pieces:
  - `CreateEventHeader`
  - `CreateEventTextFields`
  - `CreateEventOptionRows`
  - `CreateEventSubmitButton`
  - `CreateEventSheetContent`
- Replace `CreateEventBottomSheet` with the unified sheet once Phase 4 is done.

Acceptance criteria:

- `CreateEventScreen.tsx` is primarily composition and navigation.
- Create and edit flows keep existing behavior.
- Form mapping helpers have unit tests.

### Phase 8 - API Client and Context Boundaries

Goal: separate data transport from UI state.

Tasks:

- Add `src/api/client.ts`:
  - `requestJson`
  - auth header support.
  - timeout support.
  - consistent error type.
  - JSON fallback behavior.
- Move timeout helpers out of contexts.
- Add mappers:
  - `mapApiEventToUserEvent` -> `src/api/mappers/events.ts`
  - chat conversation and join request mappers -> `src/api/mappers/chat.ts`
  - auth user mapper -> `src/api/mappers/auth.ts`
- Split large contexts by concern:
  - `EventsDataContext` for arrays and loading.
  - `EventsActionsContext` for mutations.
  - `ChatConversationsContext`
  - `ChatMessagesContext`
  - `ChatActionsContext`
- Remove navigation side effects from contexts where possible; push routing should live in navigation or route handlers.

Acceptance criteria:

- Context files shrink and read as state orchestration, not transport implementation.
- Payload normalization is unit-tested outside React.
- `any` use is isolated to adapter boundaries.

### Phase 9 - Navigation Cleanup

Goal: make route setup easier to reason about without changing route names.

Tasks:

- Move tab icon components to `src/navigation/TabIcons.tsx`.
- Move tab button animation to `src/navigation/TabBarButton.tsx`.
- Move stack/sheet transition specs to `src/navigation/transitions.ts`.
- Move Android sheet wrappers to `src/navigation/SheetRoutes.tsx`.
- Replace `props: any` wrappers with typed screen props or direct component registration where possible.
- Replace `RootStackParamList.Main: any` with a typed nested navigator param.
- Keep `enableScreens(false)`, `lazy: false`, and `detachInactiveScreens: false` unchanged until the later performance phase.

Acceptance criteria:

- `AppNavigator.tsx` focuses on route declarations.
- Navigation tests still pass.
- No route param type regressions.

### Phase 10 - Final Consistency Pass

Goal: finish the style cleanup after the major extractions are stable.

Tasks:

- Replace remaining hardcoded colors with tokens or documented exceptions.
- Replace remaining repeated radii/shadows/button dimensions.
- Remove unused styles and stale comments.
- Normalize quote style and import ordering through tooling.
- Audit accessibility:
  - Required labels on icon-only buttons.
  - Correct roles for tabs, buttons, checkboxes, and menu items.
  - Disabled state announced where relevant.
- Audit error handling:
  - User-facing error text where useful.
  - Dev-only logging routed through `logger`.
  - No swallowed errors without a reason.

Acceptance criteria:

- Hardcoded style values are exceptions, not the norm.
- New UI work has obvious primitives to use.
- Lint, typecheck, Jest, and manual mobile smoke checks pass.

## Suggested First Pull Request

Start with the smallest foundation PR:

1. Add lint/format/typecheck scripts and configs.
2. Align Babel aliases with TypeScript/Jest aliases.
3. Add `src/theme/radii.ts`, `shadows.ts`, and `layout.ts`.
4. Update only low-risk shared components:
   - `ScreenContainer`
   - `ScreenHeader`
   - `EmptyState`
5. Add `src/services/haptics.ts`.
6. Convert `EmptyState` to use semantic haptics.

Why this first:

- It creates guardrails.
- It touches low-risk components.
- It starts reducing redundancy.
- It gives later refactors shared tokens and conventions to build on.

## Validation Checklist For Each Refactor PR

Run:

```sh
npm run typecheck
npm test -- --runInBand --silent
cd server && go test ./...
```

Manual mobile smoke:

- Launch app.
- Visit Discover, My Events, Create, Messages, Profile.
- Open and close a generic bottom sheet.
- Open Create Event sheet options.
- Open Event Details from Discover.
- Use Back navigation.
- Confirm no crash in the connected emulator.

For visual refactors:

- Compare spacing, button height, typography, and sheet animation against the previous build.
- Check both signed-in and signed-out states where relevant.
- Check at least one empty state and one populated list state.

## Tracking Metrics

Track these after each phase:

| Metric | Direction |
| --- | --- |
| Direct `Haptics.*` calls outside haptics service | Down to zero or documented exceptions |
| Hardcoded colors outside theme | Down substantially |
| `any` usages outside adapters/tests | Down substantially |
| Largest screen file size | Down |
| Repeated `SectionList` scaffolds | Down |
| Distinct bottom sheet implementations | Down to one base |
| Local one-off animations for shared UI patterns | Down substantially |
| Typecheck/Jest/lint status | Green |

## Refactor Backlog By Area

### Theme And Styling

- Add semantic tokens for radii, shadows, overlays, disabled states, destructive states, input backgrounds, separators, and button dimensions.
- Replace hardcoded white/black/gray values in shared components.
- Convert `ScreenContainer` to use `colors.background`.
- Normalize button height and radius across `EmptyState`, `HelpForm`, `SignInButtons`, `MessagesScreen`, `ProfileScreen`, and Event Details CTAs.
- Normalize text field styles across Help, Edit Profile, Onboarding, Chat, Event Details, and Create Event.
- Move avatar palette from `src/utils/avatar.ts` into theme or document it as brand color data.

### Components

- Convert `EmptyState` buttons to shared `AppButton`.
- Convert `HelpForm` inputs, checkbox, and submit button to shared primitives.
- Convert action buttons in `EventActionOverlay` to shared `AppButton`.
- Convert close buttons in sheets and screens to `IconButton`.
- Let `ScalePressable` own optional haptics through a semantic prop.
- Replace inline `style={{ flex: 1 }}` wrappers in pagers with a `PagerPage` component.

### Interaction And Motion

- Inventory repeated visual interactions before editing screens: buttons, cards, tabs, sheets, menus, empty states, form rows, and CTAs.
- For each repeated interaction, choose one owner component or hook.
- Move animation constants into theme or component tokens.
- Move press, selection, loading, disabled, and destructive feedback into the owner component.
- Convert call sites to props instead of local animation/haptic code.
- Keep local animation only for genuinely unique moments, such as screen-specific hero transitions or one-off celebration effects.

### Event Lists

- Extract event card mapping helpers from Home/My Events.
- Extract section building helpers.
- Create shared `EventSectionList`.
- Normalize empty states across Discover, My Events, and Past Events.
- Normalize refresh control tint and separators.

### Event Details

- Extract data derivation hooks.
- Extract host/member/request row components.
- Extract CTA component.
- Extract overlay/menu state.
- Replace inline custom tabs with shared segmented/tab primitive.
- Move styles into component-level files as pieces are extracted.

### Create/Edit Event

- Move form state to reducer/hook.
- Move submit payload mapping to pure helpers.
- Move sheet routing to hook.
- Replace custom sheet with shared sheet.
- Replace repeated option rows with shared form rows.

### Navigation

- Split icons, tab button, transition specs, and sheet route wrappers.
- Remove `props: any` wrappers.
- Type nested Main route.
- Keep performance-sensitive navigator options unchanged until the performance phase.

### API And State

- Create shared API client and timeout helper.
- Move API mappers out of contexts.
- Split context values into data/actions where high-churn data causes broad rerenders.
- Remove navigation side effects from contexts.
- Replace raw payload `any` with adapter-level unknown parsing.

### Testing And Tooling

- Add lint/format/typecheck scripts.
- Fix existing typecheck blockers.
- Keep screen rendering tests focused on behavior, not internal implementation.
- Add unit tests for pure mappers and event-list helpers.
- Add component tests for shared primitives.
- Add a short manual test checklist to PR descriptions.

## Open Questions

- Should the project adopt a `src/features/*` structure now, or wait until after the first component extractions?
- Should shared primitives live under `src/components/ui` or `src/components/core`?
- Should color tokens stay flat, or move to semantic groups such as `colors.text.primary`, `colors.surface.default`, and `colors.action.destructive`?
- Should the app introduce visual regression screenshots later, or rely on mobile smoke checks for now?
- Should API runtime validation use a library such as Zod later, or stay with typed mapper functions for now?

## Recommended Next Step

Begin with Phase 0 and Phase 1 together in one small foundation branch. After that, refactor the event list screens before touching Event Details or Create Event. This gives the codebase a cleaner shared surface and reduces duplication in a low-risk area before the more complex screen extractions.
