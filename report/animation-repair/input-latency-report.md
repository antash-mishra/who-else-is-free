# Event card input latency and rapid reopening — 2026-09-07

Scope: Discover event card → Event Details → Back → same event card. The user's phrase “notification detail” was interpreted as this card-opened Event Details flow; a separate notification entry path has not been benchmarked.

## Findings

A real missed-input problem was reproduced. The shared return finished visually, but the transparent Details route remained above the list while a second 240 ms stack fade and navigation cleanup ran. Native taps in that interval never reached the source card's `onPress`. This was not just the image moving slowly.

The retained fix disables the redundant stack animation from the shared route's initial mount (`animation: 'none'`). The custom 500 ms image opening and 400 ms return stay unchanged. A completed return immediately dispatches the original navigation action. Missing/stale endpoints still use the existing fallback fade, with a descriptor commit opportunity before dispatch. Repeated Back and unmount cleanup are guarded. The previous source-endpoint flicker guards remain intact.

## Measured normal opens and returns

Seven release-emulator trials per build, no screen recording during timing. Values are median [minimum–maximum], milliseconds. Baseline is commit `7fcdaca` plus identical opt-in diagnostics; final is this working-tree change.

| Interval | Before | After |
|---|---:|---:|
| Finger DOWN → first sampled image motion | 393.2 [329.1–483.2] | 458.5 [295.3–666.8] |
| Finger UP → first sampled image motion | 327.2 [264.1–403.2] | 387.5 [232.3–593.8] |
| Native Back → first sampled return motion | 107.5 [86.6–139.9] | 118.1 [85.9–205.1] |
| Return UI endpoint → React page unmount | 434.1 [316.3–524.8] | 37.0 [24.4–51.5] |
| Navigate → destination frame measured | 110.5 [76.0–145.2] | 151.4 [95.9–438.2] |
| Destination measured → takeoff ready | 104.4 [89.3–203.4] | 105.1 [15.7–188.5] |
| Takeoff ready → first sampled motion | 72.0 [57.7–180.4] | 104.2 [47.1–141.4] |

The median endpoint-to-unmount interval fell **91.5%**, from 434.1 to 37.0 ms (397.1 ms less). This is a route-removal measurement, not a guarantee that native hit testing is already ready at unmount. Actual retaps below test that distinction.

**Opening has not improved.** Release-to-motion measured 327.2 → 387.5 ms; closing startup measured 107.5 → 118.1 ms. The sample is small and emulator load varies, so do not attribute those differences conclusively to the code or advertise an opening gain. Layout/measurement, overlay image readiness, and the render-to-UI handoff contribute to the startup delay. Per-stage medians do not add to the end-to-end median. The probe observes the first intermediate progress after it mounts, which can lag the actual first presentation.

## Experiments retained as evidence

- Setting zero-close options and popping in one batch did not reliably update the closing route descriptor; hidden-route delay remained about 407 ms. Speculative opening layout-effect/deferred-content changes worsened the sample and were reverted.
- Waiting two animation frames for new zero-duration options reduced that interval to about 163 ms, but retained an avoidable wait.
- Configuring zero-duration close from mount reduced it to about 154 ms; React Navigation still maintained its closing animation lifecycle. This intermediate version missed 6 of 11 measured post-endpoint taps (one additional close had no shared endpoint).
- Explicit `animation: 'none'` avoids that lifecycle and gives the final 37 ms result. Fallback explicitly restores `animation: 'fade'` before navigation.

Raw diagnostics, trial boundaries, analyses and screenshot contact sheets live in [input-latency](input-latency/). Folder `no-stack-*` is the retained final version; `final-*` is the intermediate zero-duration-only experiment. `candidate-*` and `candidate2-*` are rejected/intermediate configurations.

## Method and limits

Android API 36 ARM64 emulator, 720×1600, density 280, two virtual CPUs, software SwiftShader renderer; isolated local fixture server, release APK, Hermes/Reanimated, OTA disabled for QA. Tests targeted `emulator-5554` only. The existing phone APK has not been updated by this task. No iOS claim.

A persistent Java input driver timestamps native touchscreen DOWN/UP and Back in Android uptime immediately before injection. Requested finger hold is 60 ms; actual native duration is retained. React Native native-event timestamps were checked against that clock. JS and UI worklet performance clocks aligned in this environment. The UI worklet timestamps progress observation itself, before logging crosses back to JS. This avoids counting host ADB command startup as app latency. Instrumentation remains opt-in and omits event/user content.

These are **input-to-first-sampled-UI-progress measurements, not tap-to-photon, frame time, FPS, or phone responsiveness**. Sampling/mount and instrumentation overhead are included in both builds. Run more paired physical-device trials before setting a product latency target. Reproduction tools: [scripts/performance/input-latency](../../scripts/performance/input-latency/).

One early baseline pilot tapped before the feed loaded and was excluded as setup error. A separate screen-recorded baseline opening exceeded the 700 ms landing deadline and fell back to ordinary Details; it is not a zero-latency shared success. Numeric batches therefore ran without recording or concurrent builds/tests. Final normal screenshots show all seven destinations and returned feeds; the first Details screenshot still had its background image settling. This task has not solved all rendering or image-readiness delays.

## Rapid retaps: remaining limitation

Both sweeps attempted eighteen timed retaps. Classify each using actual native DOWN relative to the measured closing endpoint, not the requested host delay:

| Outcome | Before | After |
|---|---:|---:|
| Taps after shared return endpoint | 9 | 11 |
| Reopened successfully | 1 | 9 |
| Missed despite being after endpoint | 8 | 2 |
| Taps during return (expected blocked) | 9 | 7 |

The after-build's two missed taps were **18.0 ms and 68.4 ms after the endpoint**. One arrived just 0.7 ms after React unmount, showing that unmount is not identical to native hit-test readiness. All nine sampled retaps at 121.7–490.6 ms after the endpoint reopened. This is a substantial reduction in the tested dead window, **not complete elimination**, and is not an estimated population failure rate (the timing distributions differ).

Once a retap was accepted, finger release → first sampled opening motion was **315.1 ms median, 217.7–410.2 ms, n=9**. The baseline accepted only one post-return retap, so it cannot support a meaningful before/after reopening-speed percentage. Missing taps did not produce a card `onPress`; this separates input interception from a slow accepted navigation.

Next work: reduce the residual native input handoff delay, then profile destination layout/image readiness with paired runs. Keep the accepted image-only motion and use explicit acceptance criteria for each interval. Do not shorten the visual animation and call that a reduction in tap startup latency.

## Validation and visual evidence

- Release build and emulator install passed. Full Jest suite: **117 suites / 1,431 tests passed**, including three new successful-return/fallback/cleanup regression cases. Typecheck passed; targeted ESLint has no errors and one pre-existing `React` namespace warning in ScalePressable. Diff whitespace check passed.
- Reviewed every normal/retap destination screenshot and all **85 captured frames** in a separate two-cycle recording. Both image expansions and returns remained present; no recurrence of the final white source-cover flash was seen. The recording is a visual regression check only; variable capture cadence cannot establish full display-frame coverage or tap-to-photon latency.
- [Two-cycle video](input-latency/input-latency-final.mp4), [frames 1–48](input-latency/input-latency-final-sheet-0.jpg), [frames 49–85](input-latency/input-latency-final-sheet-1.jpg), [normal destinations](input-latency/no-stack-normal/contact.jpg), [retap outcomes](input-latency/no-stack-retap/contact.jpg).
- Verdict: **measured post-return improvement; remaining very-early missed taps and opening startup latency unresolved**. The current change is in the workspace and emulator, not installed on the user's phone or committed/pushed.

Background/resume fallback was exercised separately on the emulator: the retained return was invalidated, Back dispatched once, and Discover was restored. [Fallback screenshot](input-latency/fallback/feed.png) and filtered markers are preserved. A final defensive unmount guard was added after numeric capture to prevent cancellation scheduling a fallback for an already removed page; it does not change the measured normal path.

After the defensive unmount guard: **27 focused shared-transition tests and typecheck passed**; targeted ESLint passed without warnings in the final modified transition/test/metrics files.

### Subsequent phone installation

At the user's request, the latest release was built with production endpoints and diagnostics disabled, installed on their Galaxy A56, and launched successfully. Installed APK hash was verified; see `TEST_RUNS.md`. This updates the earlier emulator-only installation status; no physical-device performance measurement was performed.
