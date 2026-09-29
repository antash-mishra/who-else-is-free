# Issue #157: Past Plans and read-only Event Details scrolling

Date: 2026-09-29

Issue: https://github.com/antash-mishra/who-else-is-free/issues/157

## Scope and current status

The metadata fix is implemented: Past Plans now supplies `EventCard.metaLine` through
`formatEventCardMetaLine`, matching Discover and My Events. Unrestricted plans display `Group`
or `1:1`; restrictions display compact gender/age text. Hosting/Joined badges, newest-date-first
sections, and navigation to `EventDetails` with `readOnly: true` are preserved.

The first implementation now includes 25-item cursor pagination, guarded endless scrolling with
an inline retry, cancellation/session reset, merged date sections, unchanged-item reconciliation,
and a bounded entry policy across sections/pages. Immediate returns reuse loaded pages; after
60 seconds, focus refresh reconciles the loaded depth. Pull-to-refresh starts a new first page.
Read-only Event Details now uses one animated FlatList with a dynamic hero/info header and
virtualized shared member rows. Active-plan and overlay scroll paths retain their existing behavior.

These changes address bounded response/mapping size and unbounded member mounting. Device
scrolling measurements are still pending: no emulator was connected. Keep issue #157 open until
the acceptance checks below pass; no physical-device smoothness improvement is claimed yet.

API rollout: deploy the backend before shipping the paginated client. Requests with `limit` or
`cursor` return `{data,next_cursor}`; no-query requests preserve the complete response for older
installed apps. New clients tolerate an older server's missing cursor by treating it as a complete
response, but cannot get bounded requests until that server is upgraded. Viewer ownership and
membership indexes limit eligibility work to that user's history; SQLite still sorts that history's
keys to select a page, so cursor pagination bounds transport/hydration, not all database work.

## Findings from the current code

| Surface                   | Observed behavior                                                                                                                                                                              | What to measure                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PastEventsScreen.tsx`    | Fetches the complete `/api/events/past` result on focus, maps every record, and builds new date sections. Cached nonempty content stays mounted during loading.                                | Mapping/grouping time, unnecessary row renders, and offset stability when returning from details.                     |
| `EventSectionList.tsx`    | Uses a virtualized `SectionList`, memoized `EventCard`, and a `Placed`/`ScalePressable` wrapper per row. The entry index restarts for every date section.                                      | Entry/layout work when scrolling into many short sections; animation cost on first visits versus repeat visits.       |
| `Placed.tsx`              | Seen IDs and rows beyond the section stagger window take the static path. IDs are recorded globally with a 500-ID cap. Initially animated rows retain their animated component while mounted.  | Whether unseen date sections start animations during scrolling, and whether registry rollover affects long histories. |
| `EventDetailsScreen.tsx`  | Past events missing from the active events context require a detail request before content mounts. A UI-thread scroll handler drives hero parallax.                                            | Separate opening/network latency from steady-state scrolling; detect layout changes during member arrival.            |
| `EventDetailsMembers.tsx` | Read-only members are rendered with `members.map` inside the outer `Animated.ScrollView`. All rows/avatars mount together.                                                                     | Mount time, memory, and scroll cost as group size grows.                                                              |
| `EventDetailsHero.tsx`    | Displays a blurred backdrop and cover with parallax and image fades; the card already uses memory/disk caching, while the hero does not explicitly specify that policy.                        | Cold versus warm image decoding, backdrop cost, and parallax cost in isolation.                                       |
| `useEventDetailsData.ts`  | Read-only members load after the detail snapshot mounts. Host-request polling and viewer-intro fetches are already gated off for this route. Events/chat context updates still reach the hook. | Request sequencing and unrelated context-driven renders; verify existing polling gates stay intact.                   |

The table records the pre-implementation observations that motivated this plan. Implemented
changes are described above; the remaining image/parallax/cache candidates still require traces.
These observations are not proof of the reported lag's cause.
The September 5 measurements in `TEST_RUNS.md` concern Discover and do not establish a Past
Plans or read-only details baseline.

## 1. Establish a reproducible baseline

Use a local test backend and dedicated emulator following `docs/dev-login.md` and
`scripts/performance/README.md`. Use a release build with verified local API/WS URLs for timing;
use the debug build for React profiling and functional checks. Keep fixture data, AVD, display
refresh rate, renderer, image state, animation settings, and host load identical between builds.

Prepare deterministic local fixtures through the existing repository/API paths:

- Histories of 20, 100, and 500 plans: both many one-plan date sections and dense date sections.
- A mix of Group/1:1, Hosting/Joined, unrestricted/restricted audiences, repeated/distinct covers,
  long names, and missing cover/avatar fallbacks.
- Read-only group details with 1, 20, and 100 members; 1:1 details; a long description that can
  expand; local slow/offline member responses. Keep test fixtures out of production.

Measure each surface independently:

1. Open Past Plans, wait for its initial request and layout, then perform a fixed down/up swipe
   sequence. Repeat on previously seen rows, then on new date sections.
2. Open a visible past plan, measure tap-to-first-content separately, then wait for members and
   perform the same detail scroll sequence with the description collapsed and expanded.
3. Scroll immediately while members are still loading, back out, and return. Repeat with a
   slow/offline backend and with reduced motion enabled.
4. Return from details to a list scrolled well below the top; check for offset jumps, entry
   replay, and scroll interruption as the focus refresh completes.

Record cold image/first-open runs separately from warm runs. Use at least three baseline and
candidate batches with ten complete cycles each, alternating build order to expose drift.
Capture Perfetto FrameTimeline, per-window gfxinfo, screenshots outside the timed windows,
request counts/durations, React commit counts in the profiling build, and memory before/after
long scroll sessions. Exclude idle time; distinguish app deadline misses from compositor jank.

Reuse `transition_scenarios.py` with inspected emulator coordinates and complete cycles. Its
`--window` is the wait after each input, so include gesture duration when interpreting the
recorded interval. Use `summarize_trace.py` and `compare_transitions.py` for trace comparisons;
do not label ADB command duration as touch latency. Preserve raw traces and configuration under
`report/issue-157-scrolling/` and record device verdicts in `TEST_RUNS.md`.

## 2. Improve Past Plans, one measured change at a time

Start with refresh and rendering work if traces show JS/layout stalls:

- Move past-event transport/mapping into the existing `src/api` boundaries using `requestJson`
  with `authFetch`. Add cancellation and latest-response protection so overlapping focus/pull
  refreshes cannot overwrite newer data or update a departed/session-changed screen.
- Preserve unchanged item identities and section data across equal responses. Keep the list and
  resolved empty state mounted during refresh, preserve the scroll offset, and avoid showing the
  initial full-page loader on every return. Keep pull-to-refresh, retry, ordering, and safe-area
  behavior intact; do not simply disable the existing refresh policy.
- If new section entries correlate with missed frames, give the shared `EventSectionList` a
  bounded entry policy based on absolute row position or the initial visible rows, rather than
  restarting the stagger window for every date. Preserve press feedback and reduced motion.
  Compare a local animation-disabled experiment before choosing the final policy.
- Stabilize separator/header callbacks and memoize row wrappers only if profiling demonstrates
  avoidable renders. Preserve callbacks when event content changes.

Tune virtualization only after those checks: compare initial batch size, batch interval, and
window size against fast-fling blank areas and memory. Keep current layout semantics and shared
defaults unless cross-screen evidence supports changing them. Any `getItemLayout` optimization
must account for section headers/separators and font scaling; do not assume a uniform row height.

Cursor pagination has been implemented at the user's request to bound future history growth,
without waiting for a measured API bottleneck. It uses stable schedule/creation/ID ordering,
a fixed cutoff across pages, cross-page date grouping, de-duplication, refresh reset, and inline
loading/error states. Measure database latency separately as eligible history grows; pagination
does not eliminate the cost of sorting that history.

## 3. Improve read-only Event Details

First isolate image and layout cost. Compare warm/cold opens and scroll traces with parallax
temporarily disabled and with a static backdrop. Keep the scroll handler on the UI thread;
raising `scrollEventThrottle` or sending offsets to React state is not a planned optimization.
If image decode dominates, test explicit memory/disk caching on both hero images, then consider
decode dimensions that preserve cover sharpness. Keep the existing visual treatment in the
final version unless an intentional design change is agreed.

If member count drives mount/scroll cost, introduce one virtualized vertical scroll owner for
the read-only route: an animated list with the hero/info/description/member heading as its header,
member rows using the existing `EventMemberRow`, and existing loading/error/empty presentation.
Do not nest a same-direction virtualized list inside the existing ScrollView. Keep active-plan
`HostRequestTabs` and overlay routes on their current path for this first change.

Preserve rounded card/background continuity, inset padding, host presentation, member order,
description expansion, read-only restrictions, and accessible scrolling through every member.
Do not use fixed header heights: long titles, expanded descriptions, and font scaling change
the measured height. Cancel in-flight member loads on departure and prevent stale event/user
responses from replacing the current roster.

If opening latency remains high, evaluate a session-scoped cache of full past-event snapshots
and members populated from existing authorized responses. Key it by user/event, clear it on
logout, and reconcile with server results, including deletion/access failures. Keep route params
typed and ID-based; do not add bulky event objects to navigation params. This cache is conditional
on measurements, not a prerequisite for fixing scroll performance.

## 4. Validation and completion gates

Proposed performance targets, to be checked against the recorded baseline:

- In a release build, aim for at most 2% app deadline misses during each steady scroll scenario
  and p95 app frame duration within two refresh intervals. Use the actual refresh rate, not a
  hardcoded 60 Hz assumption. If the baseline misses these goals, aim for at least a 30% reduction
  in its missed-frame rate; report any remaining target miss instead of claiming completion.
- No consistent regression over 10% in median trial p95 frame duration or opening latency on
  small histories/rosters. Report per-trial ranges and cold/warm results separately.
- No blank-row flashes, offset resets, duplicate requests for a single refresh/open, stale data after logout,
  growing retained member/list instances after repeated open/back cycles, or accidental back
  navigation on vertical/diagonal scrolling. Gesture tests include the current 100dp back zone.

Add focused behavior tests only for implemented refresh/cancellation/cache/virtualization
contracts. Run targeted Past Plans and read-only Event Details tests, then typecheck, touched-file
lint/format checks, and shared event-list/motion tests when those primitives change. Smoke test
Discover, My Events, active group host Requests/Members gestures, overlay details, and reduced
motion after shared changes. Confirm iOS separately; emulator timings do not prove physical-phone
smoothness, so a representative physical-device validation remains part of final acceptance.

Update `AGENTS.md`, `CLAUDE.md`, and the shared-components guide for any new shared primitive or
architectural contract. Link the final before/after evidence to issue #157 when the scrolling
work is complete; retain separate list/detail verdicts.

## Implementation validation

- Full frontend suite: 121 suites / 1,439 tests passed. Three subsequently added API/cancellation
  cases also passed in their targeted suites; the relevant list, hook, and detail suites passed
  after the final source changes.
- Full backend suite: `go test ./...` passed, including cursor ordering, mutation stability,
  authorization, legacy-client compatibility, limits, and index initialization tests.
- Typecheck, touched-source Prettier checks, and `git diff --check` passed. New API/hook/list
  files introduce no lint warnings; existing Event Details warning debt remains.
- The checked-in navigation dependency patch and gitignored cover assets were restored locally
  to run the existing test gates. Neither changes deployment state.
- No connected emulator was available. Mobile interaction checks, before/after release traces,
  and physical-device performance acceptance remain pending. The issue has not been closed.
