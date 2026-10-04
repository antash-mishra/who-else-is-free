# Issue 163: date/time picker baseline and fix plan

Measured October 3, 2026. Issue: [date picker #163](https://github.com/antash-mishra/who-else-is-free/issues/163).
Baseline source: `bc1ffd3004ec91c4960a07884d2a4d1bee52140d`.

The reported blank sheet is reproducible with the current picker. The implementation deliberately prevents the wheels from mounting until the sheet's spring has completely settled, then adds another interaction wait and two animation frames. Repeated opening does not avoid this sequence because closing unmounts the picker.

## What was measured

An isolated Android **release** app imported the unchanged `EventDateTimePickerContent`, `CreateEventBottomSheet`, and shared `BottomSheet` from this checkout. Its synthetic screen reproduced Create Event's `activeSheet && isSheetReady` visibility gate, the `onOpened` callback, and 320 ms content-unmount delay. It used a 30-day window and an initial 7:30 PM selection. Fonts were loaded before input.

Environment: `WEIF_API_36`, Android API 36 ARM64 emulator, 720 × 1600, density 280, software rendering, animation scales 1×. Hermes and the native React Native release runtime were used. Separate package `com.whoelseisfree.issue163`; OTA updates disabled in the benchmark manifest. Network disabled during capture. No account, production backend, or real user data was used. The separate benchmark app was removed afterwards and network settings restored.

This is a **component-path baseline**, not a measurement of the entire Create/Edit Event screen, an iPhone, or a physical Android phone. The harness does not include the app's providers, navigation, keyboard handoff, or iOS sheet host. Host load and software rendering affect absolute timings.

### Visible blank interval: five openings with video

Measured from the first detected sheet header to the first recorded frame containing wheel values. Every destination and the adjacent transition frames were visually checked. Video uses variable frame timestamps; the bounds below account for the preceding captured frames at both endpoints. They are capture bounds, not statistical confidence intervals.

| Opening                         | Observed blank interval | Capture bounds |
| ------------------------------- | ----------------------: | -------------: |
| First picker opening in process |                  908 ms |     472–954 ms |
| Repeat 1                        |                  756 ms |     481–847 ms |
| Repeat 2                        |                1,539 ms |   876–1,611 ms |
| Repeat 3                        |                  697 ms |     403–739 ms |
| Repeat 4                        |                2,116 ms | 1,838–2,300 ms |

The observed median is **908 ms**. Sparse recording and recording overhead limit precision: do not present these as exact device latency or population p95. The slowest opening occurred on a repeat, so this is not solely a first-use issue.

### Scheduling gate: separate five openings without video

Synthetic harness markers bracketed the JS press handler and the shared sheet's `onOpened` callback. These timestamps use the same JS monotonic clock. They measure how long the picker is prevented from **starting** wheel rendering, not native touch latency or time to presented content.

| Opening | Press handler → `onOpened` |
| ------- | -------------------------: |
| 1       |                     822 ms |
| 2       |                     593 ms |
| 3       |                     656 ms |
| 4       |                     622 ms |
| 5       |                     585 ms |

Median: **622 ms**, range **585–822 ms**. The additional `InteractionManager` wait, two frames, React rendering, native mounting, and presentation all occur after this gate. Their individual contributions have not been measured; do not infer them by subtracting numbers from different capture batches.

### Native frames: same batch without video

Perfetto FrameTimeline was queried by the actual app PID, within five windows from immediately before ADB input through 3.2 seconds later. These approximate windows include modal creation, opening, and wheel appearance; screenshots and closing were outside them.

| Opening | App frame records | App deadline misses | Maximum actual frame duration |
| ------- | ----------------: | ------------------: | ----------------------------: |
| 1       |                20 |                   9 |                        199 ms |
| 2       |                18 |                  11 |                        104 ms |
| 3       |                18 |                  12 |                        119 ms |
| 4       |                16 |                  11 |                        156 ms |
| 5       |                21 |                   8 |                        111 ms |

Total: **51/93 app frame records marked App Deadline Missed (54.8%)**. These can include multiple app surfaces and are not unique refreshes, FPS, or phone jank rates. They show that opening performance must be checked alongside content latency. They do not attribute a particular frame to date formatting or wheel mounting.

Raw synthetic evidence, source/APK hashes, harness, build script, capture script, SQL, frame CSV, video, timestamps, boundary montage, screenshots, and markers are preserved locally under ignored `.data/issue-163/`. The key files are `provenance.json`, `entry.tsx`, `benchmark.init.gradle`, `baseline.mp4`, `video-measurements.json`, `verified-boundaries.png`, and `trace-run/`.

An earlier restored-snapshot run was invalid: ADB stalled and later destinations were the underlying screen/launcher. Its artifacts remain in `failed-run/` and are excluded. The accepted batches followed a cold emulator boot and ADB recovery. An attempted auxiliary Jest render-cost probe failed on test-renderer lifecycle handling; it produced no accepted timings and is excluded.

## Code findings

1. `src/screens/create-event/CreateEventSheetContent.tsx:116` passes `visible={activeSheet === 'dateTime' && isSheetReady}`. `CreateEventScreen` sets readiness only from the sheet's `onOpened` callback.
2. `src/components/sheets/BottomSheet.tsx:179` delivers that callback only when the opening spring reports completion. A visually near-resting sheet can therefore still have no wheel values.
3. `src/components/EventDateTimeModal.tsx:160` then waits for `InteractionManager.runAfterInteractions` plus two `requestAnimationFrame` callbacks. The placeholder has the full wheel height, making the empty period clearly visible.
4. The picker eagerly maps **249 wheel rows**: 31 dates, 36 looped hours, 180 looped minutes, and 2 AM/PM values. Each has a Pressable and Text. The five-row viewport does not bound mounting work. This is a plausible source of mount cost, not a proven timing attribution.
5. Closing the Create Event sheet unmounts its content after 320 ms. `wheelContentReady` is therefore recreated as false on the next opening. Blindly retaining it across sessions would require careful selection and date-bound resets.
6. The picker needs no network request to produce its date/time values. Backend caching is not a fix for this path.

## Proposed implementation order

1. **Lock down selection behavior and capture the full screen baseline.** Add focused tests exercising the real picker and Create Event sheet composition; current rendering tests mock parts of this flow and `DateSelectionIntegration.test.ts` does not exercise the wheel component. Cover first open, reopen, changed external value, date bounds, 12 AM/PM conversion, loop wrap, slow drag without momentum, fast fling, confirm, past-time rejection, and closing while preparation is pending. Capture full Create and Edit Event openings, including a keyboard-visible case, before changing production behavior. Reuse the component harness for controlled comparisons.
2. **Remove the redundant second deferral first.** When the existing outer readiness gate opens, render wheel content without another `InteractionManager`/two-frame wait. Give the actual readiness requirement one owner. Measure this small candidate before combining it with other changes. It cannot remove the measured 622 ms outer gate, but establishes whether the extra deferral and mount cause the remaining visible gap.
3. **Make the wheel content cheap enough to show during entry.** If eager mounting causes a hitch, replace the minute/hour rows with a bounded, fixed-height virtualized wheel implementation. Preserve 44-point row geometry, center padding, initial middle-copy offset, snap behavior, loop recentering, press selection, gradients, and accessibility. Use fixed item layout and a small measured render window so an initially selected minute far into the array is present immediately. Keep the small date/AM-PM columns simple unless profiling supports changing them. Measure initial position correctness and fast scrolling; virtualization must not introduce another empty viewport.
4. **Remove the date picker's outer animation-completion gate.** Once mounting is verified, allow this picker to prepare/render when `activeSheet === 'dateTime'`, with immediate draft initialization from the current value and bounds. Values should rise with the sheet. Keep shared `onOpened` semantics for keyboard focus and other sheets; do not change the global spring to conceal this picker-specific delay. Test the standalone `EventDateTimeModal` path as well.
5. **Compare, qualify, and document.** Alternate baseline/candidate release batches using identical harnesses and devices. Measure native-input-to-content as well as sheet-header-to-content so work cannot simply move before the sheet appears. Collect video separately from numeric traces. Then verify full Create/Edit screens, keyboard handoff, rapid close/reopen, and other sheets on Android and iOS. Only adopt date-label caching or broader memoization if an attributable remaining cost justifies it.

Do not keep the entire 249-row picker mounted permanently as the first fix: it would shift work and memory to Create Event entry, and would need stale-draft/date-window handling. No new picker package, backend change, or shared animation overhaul is required by the evidence so far.

## Proposed acceptance gates

- Correct selected date/time appears as the sheet enters; no deliberate wait for animation completion or a second deferred scheduler on the date picker path.
- On a consistently sampled video, target a header-to-values gap of **100 ms or less** for both first and repeated openings. This is a proposed product target, not a measured result or an existing requirement. If capture gaps exceed 100 ms, use a better capture before claiming it passed.
- Native-input-to-values improves in matched full-screen batches; native-input-to-sheet appearance does not regress. Report every trial and uncertainty rather than hiding a slower first opening in an average.
- Opening frame deadline misses and frame duration distribution improve or remain within repeat-baseline variation. Check fast wheel scrolling too. No trade of the blank interval for a frozen entry animation.
- Selection, confirmation, rejection of past times, date bounds, wheel wrapping, draft resets, cancellation, and keyboard behavior retain their contracts on Android and iOS.
- Run focused tests, the frontend suite, typecheck, lint, and touched-file formatting. Smoke-test the shared sheets. Physical-device validation is required before declaring the user-facing issue fixed.

## Checks run for this investigation

- Release benchmark build: successful; unchanged production components imported into an isolated synthetic entry point. Initial benchmark setup builds failed on Gradle configuration and the alternate package's Google Services lookup; corrected locally before accepted capture.
- `jest src/utils/__tests__/dateTime.test.ts src/screens/create-event/__tests__/useCreateEventSheets.test.ts src/components/__tests__/BottomSheet.test.tsx --runInBand --silent`: **3 suites, 53 tests passed**.
- Video: five valid openings; all destinations and boundary frames inspected. Separate native trace: five valid openings; all destination screenshots inspected.
- `git diff --check`: run after writing this report.
- Full frontend suite, typecheck, lint, iOS tests, physical-device tests, and full-screen Create/Edit baseline: **not run**. No production code was changed and no fix has been implemented.
