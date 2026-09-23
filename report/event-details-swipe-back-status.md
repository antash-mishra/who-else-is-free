# Event Details Swipe Back Status

Last updated: 24 September 2026

## Goal

Event Details opens with the existing right-to-left stack transition. A rightward swipe from the left screen edge should close Event Details and reveal the previous screen. The host Requests/Members (or Requests/Accepted) section must retain its own horizontal page swipe.

## Current implementation

- `eventDetailsScreenOptions` enables React Navigation's horizontal back gesture within a shared 50dp left-edge boundary.
- `HostRequestTabs` immediately fails its horizontal pager gesture when a touch starts inside that boundary, leaving the edge gesture to the parent stack.
- Non-overlay Event Details renders a transparent, full-height 50dp edge layer above the outer `ScrollView`. This prevents the `ScrollView` from claiming an edge swipe before the stack gesture can activate.
- Event Details overlays do not render the edge layer.

The shared boundary is `EVENT_DETAILS_BACK_EDGE_WIDTH` in `src/navigation/transitions.ts`.

## Verified behavior

- A rightward edge swipe over the title and plan-details area closes Event Details.
- A rightward edge swipe in the host tabs area closes Event Details instead of changing tabs.
- The production release was installed and the details-area swipe was verified on the connected Galaxy A56.
- The focused navigation, Event Details rendering, and host-tab suites pass: 3 suites and 123 tests.
- TypeScript, touched-file formatting, and `git diff --check` pass.

## Open issue: vertical scrolling from Requests/Members

Vertical scrolling that begins in the Requests/Members content area has stopped working, as reported during physical-device testing. The page can still present the section, but dragging vertically from that bottom content does not move the outer Event Details scroll view.

The regression appeared after adding the full-height edge touch layer and changing gesture ownership at the pager boundary. The exact Android responder path still needs to be isolated. Likely areas are the transparent edge layer retaining touches and the nested `HostRequestTabs` pan waiting before it fails to the parent `ScrollView`.

## Required follow-up

The next change must satisfy all of these checks on Android:

1. A vertical drag beginning in Requests/Members scrolls the outer Event Details page in both directions.
2. An interior horizontal drag in that section changes Requests ↔ Members (or Requests ↔ Accepted).
3. A rightward drag beginning inside the 50dp left edge closes Event Details from the hero/details area and the tab-content area.
4. Vertical drags beginning near the left edge still scroll and do not accidentally navigate back.
5. The header back button, menu button, pinned CTA, overlays, and iOS behavior remain usable.

Test this on the Galaxy A56 after emulator verification. Keep the edge width shared between navigation and the tab pager, and add a regression test for the final gesture arrangement.
