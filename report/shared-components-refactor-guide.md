# Shared Components Refactor Guide

Updated: June 8, 2026

Branch: `refactor/code-consistency-shared-components`

Reviewed through: `8c92001 Fix member mobile layout issues`

Related docs:

- `report/code-refactoring-consistency-plan.md`
- `report/member-pending-requester-mobile-issues.md`
- `report/shared-components-refactor-guide.html`

## Why This Doc Exists

This refactor introduced shared React Native UI foundations so screens stop rebuilding the same
buttons, tabs, bottom sheets, empty states, event lists, haptics, and request helpers in slightly
different ways.

The goal is not a redesign. The goal is consistency:

- same-looking UI should behave the same way
- shared interactions should own their animation and haptics
- repeated styling should live in theme tokens or shared components
- screens should mostly compose shared pieces instead of rebuilding them

## Current Status

The branch contains both implementation work and docs. It is not docs-only.

The latest mobile QA pass found a few issues in the first shared-component implementation. Those
were documented in `member-pending-requester-mobile-issues.md` and fixed in
`8c92001 Fix member mobile layout issues`.

Important follow-up from that commit:

| Mobile issue | Fix added | Rule going forward |
| --- | --- | --- |
| Event Details action sheet had too much empty space | `EventActionOverlay` only enables keyboard avoidance for input prompts. `BottomSheet` now uses explicit keyboard listeners. | Non-input sheets should not avoid the keyboard. Input sheets should. |
| My Events empty states looked cropped/broken | `EmptyState`, `EventSectionList`, and My Events image sizing were adjusted. | Empty states should be centered by the list wrapper, not by forcing the empty component to fill the whole screen. |
| Discover could look blank while location was loading | Discover no longer blocks all event rendering on viewer-location loading when event data exists. | Loading gates should not hide usable data. |
| Inactive tabs were exposed to accessibility | `TabAccessibilityBoundary` and `AnimatedPager` hide inactive scenes/pages from accessibility and pointer events. | Hidden tabs/pages should not be reachable by screen readers or tests. |
| Event Details overlay was cramped near the bottom safe area | Overlay bottom padding was added for sheet mode. | Overlay content needs safe-area padding when no pinned CTA is present. |
| Destructive confirmation was not exposed as a button | `HoldToConfirmButton` now sets button accessibility role/state. | Custom pressables must expose role, label, state, and disabled behavior. |

## What To Use Now

Use this table first when building or refactoring a screen.

| Need | Use | Do not do this anymore |
| --- | --- | --- |
| Common CTA button | `AppButton` | Rebuild local button height, radius, disabled style, loading state, or haptic handling. |
| Icon-only close/back/action button | `IconButton` | Recreate hit slop, size, accessibility label, and press feedback locally. |
| Text variants | `AppText` | Repeat title/body/caption/error font styles in every screen. |
| Text input | `TextField` | Recreate input surface, placeholder color, multiline padding, and error text. |
| Checkbox row | `CheckboxRow` | Build custom checkbox visuals inside a form. |
| Tabs or segmented controls | `AppTabs` or `SegmentedControl` | Add another local tab animation or selected-state style. |
| Press scale and haptic feedback | `ScalePressable` with `haptic`, or `triggerHaptic` | Import `expo-haptics` directly. |
| Bottom sheet | `BottomSheetModal`, `CreateEventBottomSheet`, or `BottomSheet` | Create a new sheet wrapper with separate backdrop, keyboard, and safe-area behavior. |
| Sheet action menu | `SheetActionList` | Rebuild action rows, destructive labels, disabled/loading states, and haptics. |
| Event card list | `EventListPage` and `EventSectionList` | Rebuild section headers, separators, refresh control, empty wrapper, and footer spacing. |
| Event list data mapping | `buildEventSections`, `buildEventItemSections`, `buildSingleEventSection` | Repeat date grouping, sorting, and badge selection in screens. |
| Create/Edit Event payload mapping | `createEventForm.ts` helpers | Build API payloads directly inside `CreateEventScreen`. |
| API timeout handling | `createRequestTimeout`, `isAbortError` | Recreate `AbortController` timeout boilerplate in contexts. |
| Navigation params | `src/navigation/types.ts` | Add `navigation as any` or untyped nested route jumps. |

## Main Shared Components

### UI Primitives

Files:

- `src/components/ui/AppButton.tsx`
- `src/components/ui/AppText.tsx`
- `src/components/ui/TextField.tsx`
- `src/components/ui/CheckboxRow.tsx`
- `src/components/ui/IconButton.tsx`
- `src/components/ui/AppTabs.tsx`
- `src/components/ui/ListSeparator.tsx`
- `src/components/ui/SectionHeaderText.tsx`

Before this refactor, screens and forms often used local `Pressable`, `TouchableOpacity`, `Text`,
`TextInput`, and style objects for the same visual patterns.

Now, the shared UI primitives own common visual states:

- default
- pressed
- disabled
- loading
- selected
- destructive
- error
- accessibility state
- haptic feedback where relevant

Example:

```tsx
<AppButton
  label="Send message"
  onPress={handleSubmit}
  loading={isSubmitting}
  disabled={isSubmitting}
  haptic="submit"
/>
```

### Sheets And Overlays

Files:

- `src/components/sheets/BottomSheet.tsx`
- `src/components/sheets/SheetHeader.tsx`
- `src/components/sheets/SheetActionList.tsx`
- `src/components/BottomSheetModal.tsx`
- `src/components/CreateEventBottomSheet.tsx`
- `src/components/EventActionOverlay.tsx`
- `src/components/EventActionOverlay.prompts.tsx`

Before this refactor, the app had multiple bottom-sheet implementations with different animation,
keyboard, backdrop, and safe-area behavior.

Now, `BottomSheet` is the shared foundation. Existing wrappers keep their public APIs but share the
same mechanics underneath.

Important keyboard rule after mobile QA:

- input overlays, such as invite and report prompts, should use `avoidKeyboard`
- non-input overlays, such as action menus and confirmations, should not use keyboard avoidance

`EventActionOverlay` now applies that rule automatically.

### Event Lists And Empty States

Files:

- `src/components/events/EventListPage.tsx`
- `src/components/events/EventSectionList.tsx`
- `src/components/events/eventListSections.ts`
- `src/components/EmptyState.tsx`

Before this refactor, Discover, My Events, and Past Events each owned their own list shape,
empty-state placement, section headers, separators, and event-card mapping.

Now, screens pass sections and callbacks to the shared list components.

After mobile QA, the empty-state rule is:

- `EmptyState` should render its content
- `EventSectionList` should center the empty state in the list
- screen-specific empty illustrations should pass explicit image dimensions when needed

Example:

```tsx
const sections = useMemo(
  () => buildEventSections(userEvents, () => 'Hosting'),
  [userEvents],
);

return (
  <EventListPage
    sections={sections}
    onEventPress={handleEventPress}
    emptyState={<EmptyState title="No events yet" description="Events you host will appear here" />}
  />
);
```

### Haptics

Files:

- `src/services/haptics.ts`
- `src/components/ScalePressable.tsx`

Before this refactor, screens imported `expo-haptics` directly and each caller chose its own
feedback type.

Now, only `src/services/haptics.ts` imports `expo-haptics`. Callers use semantic names:

- `selection`
- `light`
- `submit`
- `success`
- `warning`
- `error`
- `destructive`

Example:

```tsx
<ScalePressable haptic="light" onPress={openMenu}>
  <Text>Open menu</Text>
</ScalePressable>
```

### Navigation And Hidden Content

Files:

- `src/navigation/AppNavigator.tsx`
- `src/navigation/types.ts`
- `src/context/pushRouting.ts`
- `src/components/AnimatedPager.tsx`

The refactor tightened navigation params and moved navigation colors into theme tokens.

The mobile QA fix also added a rule for hidden UI:

- inactive bottom tabs should be hidden from accessibility and pointer events
- inactive pager pages should be hidden from accessibility and pointer events

This matters because automated mobile tests and screen readers should only see the active screen.

## Before And Now

### Before

Common UI patterns looked similar but were implemented separately:

- buttons had different press feedback, disabled styles, and loading states
- bottom sheets had different keyboard and safe-area behavior
- event lists duplicated section/list scaffolding
- empty states were centered differently per screen
- haptics were imported directly from `expo-haptics`
- navigation code still had loose casts in some places

### Now

Shared foundations own repeated behavior:

- `AppButton` owns common CTA behavior
- `AppTabs` owns repeated tab behavior
- `BottomSheet` owns sheet mechanics
- `SheetActionList` owns menu rows
- `EventSectionList` owns event-list rendering
- `EmptyState` owns empty content, while list wrappers own placement
- `triggerHaptic` owns semantic haptics
- typed navigation params live in `src/navigation/types.ts`

## Visual References

The screenshots below were captured during the earlier shared-component review. They are links
instead of inline images so this Markdown file stays easy to scan.

| Surface | Screenshot |
| --- | --- |
| Discover event list and shared tabs | `report/screenshots/shared-components-discover-event-list.png` |
| My Events shared tabs and event list | `report/screenshots/shared-components-my-events-tabs.png` |
| Create Event sheet | `report/screenshots/shared-components-create-event-sheet.png` |
| Help form primitives | `report/screenshots/shared-components-help-form.png` |
| Event action confirmation sheet | `report/screenshots/shared-components-event-action-confirm.png` |
| Member action-sheet issue evidence | `report/member-event-action-sheet-extra-space.png` |

## Validation Notes

Latest reviewed implementation commit:

- `8c92001 Fix member mobile layout issues`

That commit added or updated tests for:

- `AnimatedPager`
- `BottomSheet`
- `EmptyState`
- `EventActionOverlay`
- `AppNavigator`
- `HomeScreen`

Recommended validation before merging more changes:

```sh
npm run typecheck
npm run lint -- --quiet
npm test -- --runInBand --silent
```

For future mobile UI changes, smoke test:

- Discover first app open
- My Events empty Hosting, Joined, and Requested tabs
- Event Details member action menu
- Event Details pending requester action menu
- Leave Event confirmation
- Chat entry from Event Details
- Chat event-details overlay near the bottom safe area
- Profile with inactive tabs hidden from accessibility

## Remaining Follow-Up

- Continue migrating matching one-off CTAs to `AppButton`.
- Continue migrating repeated inputs to `TextField`.
- Keep non-input sheets from using keyboard avoidance.
- Keep inactive tabs and pager pages hidden from accessibility.
- Keep direct `expo-haptics` imports restricted to `src/services/haptics.ts`.
- Keep `AGENTS.md` updated when new shared primitives or validation rules are added.
