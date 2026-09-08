# Create Event preparation and swipe-back — 8 September 2026

The phone candidate reduces Create Event opening work and enables horizontal back gestures from the middle of the form. **It does not achieve 16 ms tap-to-motion latency or eliminate every opening hitch.** The release APK is installed on the user's Samsung Galaxy A56 (SM-A566E), with app data preserved.

## Changes

- `usePrepareCreateEvent` prepares one hidden form after Main navigation interactions settle and the cover catalog loads. Preparation cancels on blur and skips an existing prepared or live Create/Edit route, preserving drafts and avoiding rebuilding the form after unrelated screen visits.
- Create-start analytics now run on actual focus. A default date that became stale while prepared is refreshed on first focus without resetting the prepared cover and views.
- Create Event accepts horizontal back gestures across the current screen width. The existing upward opening/downward closing spring remains. Short horizontal drags cancel; vertical scrolling retains the form. The original configuration relied on the stack's edge activation area; edge swipes already worked.

## Phone measurements

Baseline: release `0b97d56`. Candidate: same production configuration plus these changes. Six native open/Back trials per build; separate timestamped videos with two openings per build. All openings in the table are in an already-running app. The candidate had time to prepare offscreen. The display operated near 120 Hz; settings were not forced to 60 Hz.

| Metric                                                  |          Before | Final candidate |                      Observed change |
| ------------------------------------------------------- | --------------: | --------------: | -----------------------------------: |
| Release → first visible header, two samples             |    118 / 125 ms |     98 / 110 ms | Mean 121.5 → 104 ms, about 14% lower |
| Release → visually settled layout                       |    352 / 358 ms |    331 / 343 ms |    Mean 355 → 337 ms, about 5% lower |
| Visible header → visually settled header                |    234 / 233 ms |    233 / 233 ms |                Essentially unchanged |
| Median per-trial largest presentation gap, first 200 ms |         49.8 ms |         33.2 ms |                    About 33% smaller |
| Largest opening gap observed across six trials          |         58.1 ms |         49.9 ms |                       Hitches remain |
| App deadline misses, first 600 ms                       | 18 / 358 (5.0%) | 13 / 349 (3.7%) |                 Lower in this sample |
| Presentation cadence, 200–700 ms after release          |     115–120 fps |     117–120 fps |        Later frames generally smooth |
| JS CPU execution, first 200 ms                          |       99–112 ms |        48–57 ms |      Substantially less opening work |
| Main-thread CPU execution, first 200 ms                 |       97–124 ms |        78–88 ms |         Less work, still substantial |

Final per-trial maximum gaps in the first 200 ms: **49.9, 33.2, 16.7, 33.2, 33.2, 41.5 ms**. An average above 60 fps does not imply every frame meets the 16.7 ms budget. These are small, sequential, unpaired samples, not stable population percentiles or a guarantee across phones. CPU execution is summed separately for each thread, not wall-clock latency.

An intermediate candidate measured a 25.1 ms median worst gap but had 19/352 deadline misses. It omitted final prepared-route reuse and redundant date-update guards. Only the final candidate's measurements support the headline results; run-to-run variability prevents assigning causality to those small guard changes.

## Timing and interpretation

Native DOWN/UP input logs align to the device-clock video overlay using 179 usable timestamp samples. First visible motion is represented by the first visible Create plan header. Settling uses an approximately two-physical-pixel header-position tolerance and stability across subsequent frames. Boundaries have approximately one video frame (8.3 ms) uncertainty; this is not a touchscreen sensor-to-photon measurement. The first recorded candidate form already shows its cover when layout settles, but random cover selection and cache state prevent claiming a general image-loading improvement.

Preparation moves React work ahead of the tap, rather than removing all work. Main-thread rendering, focus/navigation updates and remaining Fabric mount batches still occur at opening; individual mount batches reach approximately 15 ms. The measurements support reduced initial rendering work, but do not attribute the entire remaining 98–110 ms input delay to one function. Achieving 16 ms would require another investigation of the input/focus/native presentation path. Increasing spring speed would shorten travel, not remove that delay.

Keeping a form prepared also retains its state and views in memory. Memory cost, immediate taps before preparation, process-cold startup, keyboard transitions and iOS performance were not benchmarked. No universal 16 ms claim is warranted.

## Validation and evidence

- Full frontend suite after runtime changes: **115 suites / 1,421 tests passed**. Final test-harness cleanup: **2 suites / 24 tests passed**. Typecheck and touched-source formatting passed; targeted lint has no errors and only the two pre-existing date-picker memo warnings.
- Phone: six Create/Back cycles passed; edge swipe, center swipe, short-drag cancellation, vertical-scroll retention and reopening passed. These were performed with the app open well beyond 40 seconds. No events were submitted.
- Two shared-event open/Back cycles passed destination/return checks after the Create changes. This is a navigation smoke check, not a new shared-animation FPS or flicker benchmark. The first smoke assertion incorrectly expected the retained Discover accessibility subtree to disappear; the corrected check uses the detail-only Plan details marker.
- One initial capture tapped before the post-install UI was ready, failed its Create-screen assertion and was excluded. Its logs are retained separately; it is not counted as a successful latency trial.
- Native tracing and screen recording ran separately. No builds, tests or concurrent scripted UI actions ran during the valid performance captures. Phone touch-indicator settings were restored.
- [Native frame summary](create-event-preparation/native-summary.json), [visual timings](create-event-preparation/visual-timings.json), [CPU attribution](create-event-preparation/early-attribution.json), [gesture checks](create-event-preparation/gesture-results.json), [APK and capture manifest](create-event-preparation/manifest.json).
- Baseline methods and limitations: [original phone report](create-event-phone-measurements.md).
- Reproduction scripts, traces, XML checks, input logs, videos and extracted screenshots stay locally in ignored `artifacts/animation-performance/create-event-preparation-phone-2026-09-08/`. Raw phone screens are not published in this report.
