# Event Details Swipe Back Status

Last updated: 24 September 2026

## Goal

Event Details opens with the existing right-to-left stack transition. A rightward swipe from the left screen edge should close Event Details and reveal the previous screen. The host Requests/Members (or Requests/Accepted) section must retain its own horizontal page swipe, and vertical drags anywhere on the page must scroll it.

## Root cause of the scroll and tab-swipe regressions

`@react-navigation/stack` (7.6.12, and still in 7.11.2) configures its back-swipe `PanGestureHandler` with the gesture-handler v1 props `minOffsetX: 5` and `maxDeltaY: 20`. Gesture-handler 2.28 no longer accepts those names and drops them without a warning, so the stack pan fell back to its default: activate after touch slop in **any** direction. Whenever that pan received a touch, a vertical drag activated it, which cancelled RNGH's root handler and with it the native `ScrollView`.

Where the stack pan received touches explains the inconsistent symptoms:

- **50dp edge (previous commit):** normally only the edge strip. But the host pager's inner row is two pages wide, so it overflows its parent, and RNGH's `extractAncestorHandlers` then checks the stack's edge `hitSlop` against the row instead of the screen. On the **Requests** tab most of the pager counted as "inside the edge", so vertical drags there did not scroll and a leftward drag was claimed by the stack (~8dp) before the pager (12dp): Requests → Members did not work. On the **Members** tab the row is shifted a page left, the bounds miss, and both scrolling and Members → Requests worked.
- **Full screen width (uncommitted experiment):** every touch reached the stack pan, so vertical scrolling stopped across the whole page.
- The transparent full-height edge layer also swallowed vertical drags that started near the left edge.

Evidence (WEIF_API_36 emulator, temporary JS logs): the pager went BEGAN → FAILED on vertical motion and the `ScrollView` then received `touchCancel` without `onScrollBeginDrag`; with the stack gesture disabled the same drag produced `beginDrag` and scrolled. Mapping the props to v2 names fixed the same drag with the stack gesture enabled.

## Current implementation

- `patches/@react-navigation+stack+7.6.12.patch` (applied by the `postinstall` `patch-package` hook) maps `minOffsetX`/`maxDeltaY` to `activeOffsetX`/`failOffsetY` (and `minOffsetY`/`maxDeltaX` to `activeOffsetY`/`failOffsetX`). The stack pan now activates only for a rightward drag and fails on vertical movement, for every stack screen. `src/navigation/__tests__/stackGestureActivation.test.ts` fails if the patch is missing. Re-create the patch when upgrading `@react-navigation/stack`.
- `eventDetailsScreenOptions` enables the horizontal back gesture within `EVENT_DETAILS_BACK_EDGE_WIDTH` (50dp) in `src/navigation/transitions.ts`.
- `HostRequestTabs` fails its pan immediately when a touch starts inside that edge, leaving the edge swipe to the stack. Everywhere else it `blocksExternalGesture`s the stack pan (`GestureHandlerRefContext`), so interior horizontal drags always change tabs, in both directions and on both tabs.
- There is no edge touch layer over the `ScrollView`.

## Verified behavior (WEIF_API_36 emulator)

1. A vertical drag beginning in the Requests rows, or in the empty area of the Members page, scrolls the outer page in both directions.
2. Interior horizontal drags change Requests → Members and Members → Requests. An interior rightward drag on Requests does not navigate back.
3. A rightward edge swipe closes Event Details from the details area, the Requests rows and the Members tab. A short edge drag cancels.
4. Vertical drags starting at the left edge scroll and do not navigate back.
5. The header back button works, and Create Event's full-width back swipe still closes the form.

Full Jest (118 suites, 1415 tests), TypeScript and Prettier pass. Details are in `TEST_RUNS.md`.

## Remaining

- Confirm on the Galaxy A56 (needs a build that includes the patch: a dev client against Metro or a new release build).
- iOS is untested. The patch changes the iOS stack pan too, to the direction lock React Navigation intended.
