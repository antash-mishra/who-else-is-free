# Empty tab state flicker on Galaxy A56 — 2026-09-24

## Capture

- Device: connected Samsung Galaxy A56, Android release APK, empty Discover and Messages account.
- Repeated Discover ↔ Messages tab taps three times per build. Recorded the screen and sampled it at 10 fps; reset and read `dumpsys gfxinfo` after each tap.
- The before and after videos and contact sheets are saved in this task's local visualization artifacts under `empty-state-flicker/`.

## Findings

| Destination           | Before                                                                                                      | After                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Discover empty state  | Header and tabs appeared while the illustration and copy were absent for roughly 0.6–0.8 seconds on return. | Illustration and copy remained visible throughout all three returns. |
| Messages empty state  | Empty artwork briefly disappeared during the focus refresh.                                                 | Empty artwork remained visible throughout all three returns.         |
| Discover frame pacing | 9 janky frames / 347 rendered; 95th percentile 8 ms on each tap.                                            | 7 janky frames / 348 rendered; 95th percentile 7–10 ms.              |
| Messages frame pacing | 6 janky frames / 347 rendered; 95th percentile 5–7 ms.                                                      | 5 janky frames / 348 rendered; 95th percentile 6–7 ms.               |

The frame pacing was already generally smooth. The visible flicker came from rendering logic: Discover considered only a nonempty first response “loaded,” then hid its empty state during every events refresh. Messages hid its empty state whenever the conversations refresh was busy.

## Change

- `EventsContext.hasLoadedEvents` records when the first events request settles, including empty and failed results.
- Discover uses that settled state to keep a resolved empty pager visible through later refreshes.
- Messages waits for its first focus refresh for the current user, then keeps its empty state visible during subsequent refreshes.

The A56 recording verifies the empty-state flicker is gone for these tab switches. This capture does not establish a broader navigation speed improvement; frame pacing changed only slightly and the sample is six taps per build.

## Validation

- `npm run typecheck` passed.
- `npm test -- --runInBand --silent` passed: 117 suites, 1,410 tests.
- Targeted ESLint on changed TypeScript files passed.
- Release APK installed and checked on the connected A56.
