# Header Consistency — Proof of Completion

Verified on the Android emulator (`WEIF_API_36`, `emulator-5554`) against the
running dev build connected to Metro, with the backend in dev-login mode.
All header subtitles now follow one consistent shape across JoinRequestsScreen
and the ChatThreadScreen.

## Consistent Header Format

| Screen | Mode | Title (above) | Subtitle (below) |
|---|---|---|---|
| JoinRequestsScreen | 1:1 | Event Name | `N People, DD Mon Wed` |
| JoinRequestsScreen | Group | Event Name | `N Members, DD Mon Wed` |
| ChatThreadScreen | 1:1 | Person Name | `One to one, DD Mon Wed` |
| ChatThreadScreen | Group | Event Name | `N Members, DD Mon Wed` |

The date uses `formatAbsoluteDateLabel(eventDate)` → `08 Jun Mon` style.
The `1:1` people count = approved joiners + 1 host.
The group members count = `conversation.memberIds.length`.

## Device Screenshots

All screenshots below are in this same directory.

### 1. JoinRequestsScreen — 1:1 mode
**File:** [`01-joinrequests-1to1.png`](01-joinrequests-1to1.png)

- Reached from **Messages → tap "1:1 Event B (Edited)"** (tester hosts the 1:1 event).
- Header title: `1:1 Event B (Edited)`
- Header subtitle: **`2 People, 14 Jul Tue`** ✅ (1 approved guest + 1 host; event date 2026-07-14 → `14 Jul Tue`)
- Previously this subtitle was `{date}, {time} at {location}`.

### 2. JoinRequestsScreen — Group mode
**File:** _(no device screenshot — surface not reachable from the app UI)_

`JoinRequests` is only ever navigated with `groupType: 'Single'` (see
`src/screens/MessagesScreen.tsx`, `src/screens/event-details/useEventDetailsActions.ts`,
`src/context/pushRouting.ts`), so the group-mode header has no user-facing entry
point to drive on the emulator. The change is verified by the unit test
**`JoinRequestsScreen.rendering.test.tsx` → "should render member count and date
subtitle in group mode"** which asserts the subtitle renders as
`3 Members, <date>` (replacing the old static `"Join Requests"`).

### 3. ChatThreadScreen — Group chat
**File:** [`03-chatthread-group.png`](03-chatthread-group.png)

- Reached from **Messages → tap "Group Event A (Edited)"** (3 members).
- Header title: `Group Event A (Edited)`
- Header subtitle: **`3 Members, 12 Jul Sun`** ✅ (event date 2026-07-12 → `12 Jul Sun`)
- Previously this subtitle was `{date}, {time} at {location}`.

### 4. ChatThreadScreen — 1:1 chat
**File:** [`04-chatthread-1to1.png`](04-chatthread-1to1.png)

- Reached from **JoinRequests 1:1 → tap the approved member row**.
- Header title: `Tester` (the counterpart's name)
- Header subtitle: **`One to one, 14 Jul Tue`** ✅ (event date 2026-07-14 → `14 Jul Tue`)
- Previously this subtitle was `{eventTitle}, {date}`.

## Connection state (no longer hijacks the subtitle)

Before this change, a reconnecting WebSocket replaced the entire subtitle with a
bare `Connecting…` line, hiding the member/date info. Now the member/date
subtitle stays visible at all times, and a subtle pulsing-dot
`ConnectionStatusIndicator` ("● Connecting") appears in the header's right area
only while `isConnecting` is true, then disappears. Covered by the tests
`ChatThreadScreen.rendering.test.tsx` → "should keep the member/date subtitle
visible while connecting" and "should show the connection status indicator
when isConnecting is true".

## Code changes

- `src/utils/chatHeaderSubtitle.ts` (new) — shared `buildEventMemberSubtitle` and
  `buildOneToOneSubtitle` helpers.
- `src/components/ConnectionStatusIndicator.tsx` (new) — pulsing-dot pill for the
  connecting state.
- `src/screens/JoinRequestsScreen.tsx` — 1:1 + group headers use the shared
  subtitle helper; removed the old time/location subtitle memo.
- `src/screens/ChatThreadScreen.tsx` — 1:1 + group subtitles use the shared
  helpers; connection state moved from the subtitle into
  `ConnectionStatusIndicator`.
- Tests: `src/utils/__tests__/chatHeaderSubtitle.test.ts` (new), plus updated
  assertions in `JoinRequestsScreen.rendering.test.tsx` and
  `ChatThreadScreen.rendering.test.tsx`.

## Validation

- `npm run typecheck` — clean.
- `npm test` (full suite) — **1164 tests, 71 suites, all pass**.
- `npm run lint` — 0 errors; new files add no new warnings.
- Device: all three reachable surfaces render the expected title/subtitle text
  exactly as specified (verified via `mobile_dump_ui` text nodes and the captured
  PNGs above).
