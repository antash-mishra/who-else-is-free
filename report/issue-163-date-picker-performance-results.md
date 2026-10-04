# Issue 163: first implementation and verification

Implemented locally October 4, 2026, against `e5dc5ab`.

This records the first fix. The later [latency root-cause and architecture follow-up](./issue-163-date-picker-latency-root-cause.md) changes Android presentation and supersedes the implementation status here; the measurements below remain historical evidence.
Issue: [date picker #163](https://github.com/antash-mishra/who-else-is-free/issues/163).
The earlier [baseline and plan](./issue-163-date-picker-performance-plan.md) remains the investigation record; its original measurements used a component harness.

The date/time values now render during sheet entry. Removed the Create Event `onOpened` readiness gate for this picker and the picker’s additional interaction/two-frame wait. The long minute wheel uses a bounded FlatList, fixed 44-point item layout, and the selected middle-copy initial index. Pressable text removes an extra native view per wheel row. Avoided resetting an already-identical draft on initial mount. Closing, resetting, or unmounting cancels pending drag-settle timers, preventing a stale timer from overwriting a reopened selection.

Shared sheet springs and `onOpened` semantics are unchanged. The other sheets still use their existing readiness signals. No new dependency, backend change, permanently retained picker, or event submission was needed.

## Full Create Event measurements

Both builds used the actual `index.ts` app, providers, navigation, and Create Event form, in an Android API 36 ARM64 **release/Hermes** app with a separate package (`com.whoelseisfree.issue163full`). Same emulator: 720 × 1600, density 280, software rendering, animations 1×. Baseline was built before production edits from `e5dc5ab`; the final candidate includes the implementation above. APK SHA-256 values are preserved in `.data/issue-163/implementation/apk-sha256.txt`.

This was an offline guest flow with synthetic selections and no production backend. The fixture endpoint was compiled as local, but native cleartext restrictions prevented loading its cover catalog. Both builds therefore had the same empty cover state. Network was disabled during captures. The emulator is slow and variable; these are neither physical-device timings nor iOS results.

### Visible loading stage

Five openings per build were recorded separately from numeric native traces. The baseline header-to-wheel-values median was **677 ms**, range **544–874 ms**. A second inspection followed the moving sheet: from the first frame where the selected center row could be visible to its first populated frame, the baseline median was **642 ms**.

| Opening | Baseline visible-body blank interval |         Final candidate |
| ------- | -----------------------------------: | ----------------------: |
| 1       |                               823 ms | No observed blank frame |
| 2       |                               507 ms | No observed blank frame |
| 3       |                               642 ms | No observed blank frame |
| 4       |                               682 ms | No observed blank frame |
| 5       |                               582 ms | No observed blank frame |

In all five final openings, the selected hour and minute were already present in the first frame where the center row was visible. No blank center-row frame was observed.

The moving-body check matters: a header can enter the screen before the center row physically reaches the viewport. Counting that motion as loading overstates the candidate’s delay. Raw video has variable timestamps and gaps, so a same-frame result means **no observed blank frame**, not exact zero-millisecond latency. Adjacent frames and all destination screenshots were inspected. The supplied short video is a presentation copy; timings use the original frames and timestamps.

### Native input and frame diagnostics

Five openings without screen recording, builds, or test runs in parallel. A native Android input driver recorded the ACTION_UP event timestamp. Perfetto FrameTimeline used the actual app PID and newly created modal layer, within 2.2 seconds of each release. The emulator stayed awake so uptime and boot-time clocks could be compared.

This measures input release to the **first modal surface frame**, which can still precede visible sheet content. It is a diagnostic proxy, not exact touch-to-values latency.

| Opening | Baseline first modal frame | Final first modal frame | Baseline maximum frame duration | Final maximum frame duration |
| ------- | -------------------------: | ----------------------: | ------------------------------: | ---------------------------: |
| 1       |                     302 ms |                  331 ms |                          164 ms |                       108 ms |
| 2       |                     223 ms |                  236 ms |                          104 ms |                       113 ms |
| 3       |                     226 ms |                  230 ms |                           96 ms |                       117 ms |
| 4       |                     201 ms |                  208 ms |                          114 ms |                       103 ms |
| 5       |                     156 ms |                  223 ms |                          134 ms |                       152 ms |

Median first modal frame: **223 → 230 ms**. These samples do not establish a 30 ms response or a statistically equivalent opening time. The first unoptimized immediate-render candidate measured 345 ms median and 716 ms on its first opening; bounded rows and avoiding the redundant draft reset substantially reduced that cost.

Baseline: **58/122** app frame records marked App Deadline Missed (47.5%). Final: **62/111** (55.9%). Multiple surfaces can contribute records; these are not unique refreshes, FPS, or phone jank rates. Smoothness improvement is **not established**. Physical-device profiling is needed before calling the performance acceptance gates fully satisfied.

## Correctness and checks

- Regression tests were proved failing against the old behavior: no first-render wheels, the Create Event readiness gate, stale close/reopen timer updates, and an uncancelled unmount timer. Implemented the fixes, then proved green.
- Final focused tests: **2 suites, 16 tests passed**. Cover immediate rendering/confirmation, date bounds, date changes, 12 AM/PM, past-time rejection, slow drag, momentum/wrapping, changed external selection, close/reopen cancellation, unmount cleanup, and a bounded minute window at minute 59.
- `npm test -- --runInBand --silent`: **127 suites, 1,476 tests passed** on the final code.
- `npm run typecheck`: passed.
- `npm run lint`: passed with **751 warnings, zero errors**. Existing import/style/state-reset conventions continue to produce warnings; no suppressions were added.
- Touched-file Prettier and `git diff --check`: passed.
- Android release build: passed. Full Create Event opening, date/minute press selection, Done, reopen retention, and a slow native minute drag were checked using synthetic values. The short recording shows opening, changing the selection, confirmation, and reopening.

Not run: physical Android, iOS, signed-in Edit Event, native keyboard-to-picker handoff, full other-sheet smoke coverage, or exact native-input-to-presented-values profiling. The standalone picker shares the tested content, but its native modal path was not manually exercised. These remain release verification work; the issue remains open and this change is not deployed.

## Evidence and excluded runs

Raw APKs, build logs, Java input driver output, Perfetto traces, SQL, frame CSVs, videos, timestamp lists, screenshots, and boundary montages remain under ignored `.data/issue-163/implementation/`. Final trace batch: `full-candidate4-native/`. Final video batch: `full-candidate4-video/`. Earlier candidates are retained so the optimization sequence is reviewable.

The initial candidate video accidentally captured a native location-permission prompt; it is retained in `invalid-candidate1/` and excluded. A trace was briefly queried before its capture finished; that partial query produced no accepted measurements and was replaced after the final trace flushed. Emulator-only permission flags and a verified Create Event accessibility tree prevented subsequent prompt captures.

Presentation recording: [date picker transition](./issue-163/date-picker-transition.mp4). All dates and form contents are synthetic. The separate app and input driver are removed after verification, and the emulator’s network settings are restored.

Posted the authorized [verification note](https://github.com/antash-mishra/who-else-is-free/issues/163#issuecomment-5981035177) on the issue; it remains open.
