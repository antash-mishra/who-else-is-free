# Issue 163: remaining latency and architecture follow-up

October 4, 2026. This follows the [first implementation report](./issue-163-date-picker-performance-results.md), which removed the deliberate blank loading stage but retained native modal presentation.

The remaining delay is primarily **after the press handler**, in mounting/layout of the picker and the native-modal presentation/startup handoff. It is not a network wait. The date picker is computed locally and this test used an offline guest form. The old Android path created a new native Dialog for each opening, then waited for its `onShow` event to reach JavaScript before starting the shared spring.

## How the cause was checked

Release/Hermes builds of the actual app used temporary stage probes, not a development build or a mocked picker. Probes bracketed routing, screen rendering, the modal adapter effect, shared host presentation, picker rendering, the native layout callback, native modal `onShow`, and animation start. A native input driver supplied the ACTION_UP timestamp. Device wall-clock timestamps were used across JavaScript/native input; JS monotonic timestamps are also preserved.

The layout probe is the **JavaScript delivery of a native layout callback**. The interval before it includes React reconciliation, native mounting/layout, and event delivery; it does not isolate pure native CPU time. Animation-start is also not a presented-pixel timestamp. Do not interpret these values as exact touch-to-visible-content latency.

Environment: the same Android API 36 ARM64 software-rendered emulator, 720 × 1600, density 280, animations 1×, separate package `com.whoelseisfree.issue163full`. Same offline guest Create Event path and 30-day date window. The app’s initial time followed its normal clock; captures were not frozen to an identical selected minute. No production backend or user account was accessed. Each five-opening numeric batch ran without video, builds, or tests in parallel.

### Cumulative time after touch release

| Stage (median of five openings)          | First fix: native modal | Overlay-only experiment | Final stage-probed overlay + bounded wheels + form memoization |
| ---------------------------------------- | ----------------------: | ----------------------: | -------------------------------------------------------------: |
| Open handler                             |                   10 ms |                    7 ms |                                                          16 ms |
| Shared host receives content             |                   27 ms |                   21 ms |                                                          34 ms |
| Picker function begins rendering         |                   37 ms |                   27 ms |                                                          41 ms |
| Picker native-layout callback reaches JS |                  252 ms |                  178 ms |                                                         181 ms |
| Native modal `onShow`                    |                  369 ms |          Not applicable |                                                 Not applicable |
| Shared animation starts                  |                  369 ms |                  183 ms |                                                         185 ms |

The controlled overlay-only experiment changed the presentation path while retaining the previous wheel content. It roughly halved the median time to start animation. This identifies modal/window startup and its callback handoff as a material architectural cost. It does not attribute the entire improvement to a single native function.

Perfetto also showed native text creation, Fabric mounting batches, window traversal, and software rendering costs. The native-modal trace created 440 RCTText views over its complete five-opening capture. The intermediate three-wheel virtualized trace created 235. These whole-capture counts include updates/closing and are supporting evidence, not per-opening latency or FPS. Slice durations nest; do not sum overlapping slices as independent costs.

### Every animation-start sample

| Opening                          | Native modal | Overlay-only | Final implementation |
| -------------------------------- | -----------: | -----------: | -------------------: |
| First opening in a fresh process |       425 ms |       368 ms |               389 ms |
| Repeat 1                         |       323 ms |       227 ms |               184 ms |
| Repeat 2                         |       369 ms |       183 ms |               185 ms |
| Repeat 3                         |       597 ms |       133 ms |               234 ms |
| Repeat 4                         |       263 ms |       158 ms |               157 ms |

Overall observed median: **369 → 185 ms**, approximately 50% lower. First opening: **425 → 389 ms**; the cold path remains much slower than 30 ms on this emulator. The repeated-opening medians are 346 → 185 ms. These small sequential samples are not population p95 values or a statistical equivalence test.

Two intermediate versions with three virtualized wheels, before final form memoization, had first openings of **1,036 ms** and **551 ms**; their five-opening medians were 203 and 214 ms. Those runs are retained, not excluded. The long sample included a 304 ms Fabric mounting batch and substantial runnable time, while software-rendered frames also remained expensive. The final first opening was better, but stable cold-start performance is not established across physical devices.

## Architecture and implementation

- The Android Create/Edit Event date picker requests an **inline presentation through the shared sheet host**, using the existing app window instead of a new native Dialog. iOS and other sheets retain native modal presentation. Standalone callers without a host continue to use a native modal.
- The shared host uses the existing sheet surface and spring. It blocks underlying touch/accessibility while the inline sheet opens or closes, handles hardware Back, and removes that listener when the sheet leaves. No second sheet library or application state platform was introduced.
- Date, hour, and minute columns now use bounded FlatLists with fixed 44-point item layout and selected initial indices. The two-item AM/PM column stays simple. The initial render window includes the two rows above selection, while `contentOffset` keeps selection centered, so neighboring rows do not need a later fill. Initial minute 59, selection, snapping, date bounds, wrapping, and resets remain covered by tests.
- The form fields are memoized so unrelated sheet-state changes can skip their rendering. Form value/callback changes still update the form normally.
- A presentation switch resets the native-show handshake: switching modal → inline → modal waits for the newly created modal’s own `onShow`. Existing modal entry semantics and spring constants are preserved.
- The previous immediate-content and stale drag-timer fixes remain in place. Temporary console/layout probes have been removed from production source.

## Verification

The overlay and presentation-switch regressions were reproduced against the old behavior, then proved green. Focused checks cover absence of a native Modal for hosted inline content, the shared spring, accessibility/touch isolation during closing, hardware Back/listener cleanup, Android-only routing, unchanged other-sheet routing, presentation switching, and picker selection/bounds/wrapping/reset behavior.

Final checks on the latest code:

- `npm test -- --runInBand --silent`: **127 suites, 1,483 tests passed**.
- Focused picker/host/sheet/screen checks: **4 suites, 49 tests passed**.
- `npm run typecheck`: passed.
- `npm run lint`: passed, **751 warnings and zero errors** (same warning count as the first implementation; no rule suppressions added).
- Touched-file Prettier and `git diff --check`: passed.
- Clean Android release build: passed. Production source contains no temporary stage probes.

The latest clean release (`clean-final3.apk`, including the initial-window and presentation-switch corrections) was recorded in `clean-final3-video/`. Its five-opening recording had values in the first frame where the selected center row was visible in all five cases. This means no observed blank frame, not exact zero milliseconds; the software-emulator video has variable frame timestamps and gaps.

Native checks exercise date/minute confirmation, reopening, hardware Back without leaving Create Event, fast minute/hour flings and confirmation, and opening/closing Group type, Gender, Age, and Location modals. A compressed UIAutomator accessibility tree excludes the underlying form while the inline picker is visible. Default uncompressed UIAutomator dumps can still inspect that view hierarchy, so the accessibility assertion uses the compressed tree. TalkBack itself was not exercised on a physical device.

An initial recording attempt began before preflight finished and missed the first opening; it is retained in `invalid-clean-video-startup/` and excluded. The uncompressed accessibility probe is retained in `smoke-uncompressed-probe/`; the compressed-tree check is the accepted accessibility check. Physical Android, iOS, and signed-in Edit Event validation remain outstanding. **A 30 ms full response is not demonstrated**, and further layout/rendering performance work should be measured on a physical device rather than inferred from software-emulator timings.

The [short clean-release recording](./issue-163/date-picker-overlay-transition.mp4) shows opening, changing the date/minute, confirming, and reopening. It is trimmed from the raw screen recording; timing analysis uses the original variable-frame-rate capture, not the presentation export.

The [follow-up issue note](https://github.com/antash-mishra/who-else-is-free/issues/163#issuecomment-5981673246) records the root cause, changes, measurements, and remaining device verification.

## Reproducibility

Raw stage logs, native input markers, five-opening screenshots, APKs, source snapshots, build logs, Perfetto traces, SQL, and analysis scripts are retained under ignored `.data/issue-163/architecture/`. Key batches: `modal-native/`, `inline-native/`, `optimized-native/`, `optimized2-native/`, and `final-native/`. `analyze-stages.py` contains the timestamp analysis; `instrument.py` records the temporary probe locations. Source archives have `.snapshot` suffixes so lint does not treat benchmark copies as production files.

The stage-probed APKs are diagnostic builds with extra logging. The last timed APK uses the final architecture but predates the two-row initial-window correction and presentation-switch safeguard; those are checked in the clean release build. The final clean build has no probes. This is a local implementation, not a deployment, and the issue remains open for release verification.
