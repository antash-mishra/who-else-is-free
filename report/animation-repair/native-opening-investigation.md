# Shared animation investigation — 8 September 2026

The final Android change keeps the retained list clear during opening and updates its native blur only when the derived radius changes. The image-only expanding transition, 500 ms opening, 400 ms return, return blur, and accepted input/endpoint cleanup remain intact. iOS behavior is unchanged.

The alternating opening-only comparison reduced the median worst pause in the first 200 ms from **77.4 to 33.8 ms** on repeated opens (56.3% lower, n=6 per build). Process-first improved **123.5 to 59.7 ms** (n=3); the pre-motion tap delay is not proven fixed. These are emulator UI progress observations, not phone FPS.

This investigation separates startup latency, motion pacing, and visual staging. Three agents audited native slices, timing/pacing, and lifecycle risks. The previously committed return-input/flicker fixes remain the baseline. No diagnostic APK was installed on a physical phone.

## Confirmed findings

1. Startup contains substantial JavaScript execution and CPU scheduling delay. In the traced first open (1,064 ms release→first motion), JS ran for 489 ms and was runnable but unscheduled for 392 ms. A 398 ms readiness→animation-request interval contained 207 ms JS execution and 191 ms runnable waiting. These are overlapping thread-state measurements, not image decode time. Repeated successful opens also contain both costs.
2. Rendering is a separate bottleneck during motion. In six shared openings, 48 of 53 app frame records whose start fell within motion missed the app deadline; closing had 42 of 54. RenderThread occupied 74% of pooled opening windows and 80% of closing windows, while median closing JS execution was only 0.23 ms. Therefore moving more work off JS alone cannot fix the entire experience.
3. The full-page source blur materially worsens UI motion cadence on this emulator. The controlled blur ablation below preserves animation duration and other production behavior.
4. A fresh recording reproduces the gray hero background before its separate blurred image appears. The foreground shared cover is ready earlier; the background has its own loading/150 ms crossfade path. A late background can make the transition look unfinished independently of foreground geometry.
5. The configured 500 ms ease-out opening has a long settling tail: the last 5% of geometry uses approximately 184 ms. This is a perceptual hypothesis, not proof that duration should change; the supplied reference also expands for approximately 500 ms. Shortening duration before addressing sparse frames can create larger jumps.

Native evidence: [pipeline attribution](native-opening/pipeline-analysis/findings.md), [timing/pacing data](native-opening/latency-analysis/results.json), [trace manifest](native-opening/trace-manifest.json). Raw trace is retained under ignored `artifacts/animation-performance/native-opening/`; SQL and extracted results are included with the report.

## Controlled source-blur ablation

A is the unchanged transition with expanded opt-in probes. B temporarily disables only the Android source-page blur. B is a diagnostic build, not a proposed removal of the design. ABBA blocks plus one extra process-first trial per build produce n=3 process-first and n=6 repeated opens per build. Both APKs use identical progress sampling; no screen recording, tests or builds ran during the comparison.

| Repeated motion metric | Baseline blur | Blur disabled | Change |
|---|---:|---:|---:|
| Opening median trial sample gap | 57.5 ms | 26.5 ms | 53.9% lower |
| Opening median trial p95 gap | 87.9 ms | 38.8 ms | 55.8% lower |
| Closing median trial sample gap | 50.3 ms | 19.2 ms | 61.9% lower |
| Closing median trial p95 gap | 61.5 ms | 34.4 ms | 44.0% lower |
| Closing median maximum progress jump | 0.27 | 0.13 | 53.3% lower |

Both B blocks improve cadence relative to both A blocks. Durations remain approximately 500 ms opening/400 ms closing. This is more intermediate motion updates, not a shorter timer. It establishes a substantial cost from the source-blur path, but does not isolate native blur computation from redundant property submissions.

Startup is not solved by this ablation: repeated release→motion was 443.9→370.2 ms, but process-first was 457.8→609.2 ms. Both variants had one closing fallback across nine trials (A repeated, B process-first). Repeated successful return cleanup was 47.4→52.1 ms; no zero-regression claim is made.

See [timing summary](native-opening/blur-abba-summary.json), [progress summary](native-opening/blur-abba-progress-summary.json), [APK hashes and block outcomes](native-opening/blur-abba/comparison.json), and reviewed endpoint contacts [A](native-opening/blur-abba/A-contact-0.jpg) / [B](native-opening/blur-abba/B-contact-0.jpg). These screenshots establish navigation outcomes, not transient frame correctness.

## Measurement limits

API 36 ARM64, 720×1600, two virtual CPUs, SwiftShader software rendering, local fixture data. Host load varies; alternating builds limits but does not eliminate that noise. Process-first retains disk cache and follows a verified loaded feed. Native trace clock snapshots establish MONOTONIC→BOOTTIME offset of −83/−84 ns; timestamps were aligned explicitly.

Native frame records, sampled UI progress gaps and reported compositor display-end gaps are different measurements. None is phone FPS or touch-to-photon latency. The UI probe collects bounded samples on the UI runtime and flushes once after completion; buffers with drops/caps are excluded from cadence aggregation. The terminal reaction may occur just after the animation completion callback, so both durations and their lag are reported. Failed/cancelled flights are retained as separate outcomes. Native tracing and Hermes profiling add overhead; their timings are attribution evidence and are not pooled into the untraced A/B latency result.

## Retained implementation and results

Hermes sampling confirmed synchronous React/Fabric work in the startup path: 40 of 74 opening-window samples included synchronous rendering, and native `completeRoot` was the largest specific leaf (12 samples). All seven samples between readiness and animation request involved synchronous rendering/commit work. Individual component counts were too sparse to blame one component. See [symbolicated findings](native-opening/hermes/findings.md). Sample counts are not CPU milliseconds, and this profiled capture is separate from the Perfetto trace.

The completed retained-design comparison evaluated A baseline; B a derived boolean that changes the blur property only at its threshold; C adds source-only hardware caching and memoized row bodies to B. B/C keep the blur strength, image geometry, and durations. Candidate C combines two additional changes, so its timing differences cannot be attributed exclusively to either one. The source-only cache excludes Details and its live blur, unlike the earlier rejected hierarchy. A separate 99-frame recording showed no blank screen, source-image hole, duplication, or endpoint washout in two cycles; this alone does not establish cache reliability.

The 500 ms cubic → 400 ms quadratic pacing alternative was analyzed but not implemented: it shortens the last 1% from 108 to 40 ms, but starts 16.7% slower. It is a duration/design tradeoff, not a demonstrated CPU improvement. The curve remains unchanged.


The first retained-design comparison selected **B: threshold-only source-blur updates**, which becomes the baseline for the opening-only follow-up below. The extra source cache and row memoization experiment was removed; patches and its test are preserved as research artifacts. At this stage, B retained the same blur, cover/page geometry, opening/closing durations, and return lifecycle. It derived blur enablement separately so an equal filter array was not resubmitted on every progress tick. The later opening-only change below additionally avoids activating the Android source blur during takeoff.

| Repeated measurement, n=6 per build | A baseline | B retained |
|---|---:|---:|
| Opening median trial sample gap | 60.6 ms | 27.8 ms |
| Opening median trial p95 gap | 104.4 ms | 74.4 ms |
| Closing median trial sample gap | 48.1 ms | 18.5 ms |
| Closing median trial p95 gap | 77.5 ms | 56.4 ms |
| Release → first UI motion | 391.5 ms | 390.3 ms |
| Return endpoint → React unmount | 35.9 ms | 39.4 ms |

Typical sampled motion gaps fell **54.1% opening / 61.6% closing**, with both B blocks independently better than both baseline blocks. The p95-gap medians fell 28.8% / 27.3%; occasional large jumps remain. All **27 openings and 27 returns** across A/B/C completed shared motion, with no capped sample buffers.

Process-first release→motion was 509.8→442.1 ms (n=3 each), but ranges overlap and repeated startup is unchanged. This is not a proven first-opening fix. B's repeated cleanup maximum was 122.6 ms versus baseline 58.4 ms, so those measurements do not establish a zero-regression claim for rapid retaps. The user subsequently confirmed that release/reopen behavior feels correct; no further release-path changes were made. The implementation does not change the proven closing dispatch or endpoint visibility guards.

C's extra cache/memo combination provided no convincing additional benefit: repeated opening p95 gap 77.4 ms versus B 74.4 ms; closing p95 68.8 versus B 56.4 ms; process-first opening 460.6 versus B 442.1 ms. Avoiding that additional native caching risk is justified by the measured comparison, not by assuming it cannot work.

See [full timing results](native-opening/retained-design-abccba-summary.json), [progress results and block comparisons](native-opening/retained-design-abccba-progress-summary.json), and [APK hashes/outcomes](native-opening/retained-design-abccba/comparison.json).


## Native corroboration of threshold-only blur updates

The retained B build completed three shared opening/return pairs in a second native trace. The baseline trace contains six completed pairs and one watchdog failure. Both captures use the same sources/categories and emulator configuration; their recording durations differ (45 seconds baseline, 35 seconds B). All numbers below use the transition marker windows, not whole-trace averages.

| Native motion metric | Baseline | Retained B |
|---|---:|---:|
| Opening median RenderThread CPU execution | 403.6 ms | 271.5 ms |
| Closing median RenderThread CPU execution | 342.5 ms | 261.1 ms |
| Opening median trial display-end gap | 76.8 ms | 28.3 ms |
| Closing median trial display-end gap | 69.0 ms | 22.2 ms |
| Opening app deadline misses / frame records | 48 / 53 | 23 / 45 |
| Closing app deadline misses / frame records | 42 / 54 | 9 / 50 |

The lower RenderThread CPU execution (32.7% opening, 23.8% closing in these captures) supports the rendering-cost mechanism found by the alternating matrix. It does **not** establish paired statistical proof: sample sizes are small, runs are unpaired, and host scheduling varies. Main-thread drawing waits remain. Frame-record deadline fractions and display-end cadence use different cohorts and neither measures phone FPS.

Native commit instrumentation is absent in both traces, so commit counts are unavailable. Fabric mount-batch counts actually increase during motion (median 8→13 opening, 8→15 closing), alongside more rendered intermediate frames. They are not React commit counts and must not be advertised as reduced rendering work. Batch elapsed time falls, but includes descheduled time rather than exclusive CPU execution.

Startup remains separate and unproven: release→first sampled motion is 387.3→491.8 ms in these traces. B's individual observations are 827.1, 491.8 and 219.5 ms. The untraced alternating comparison above remains the primary startup evidence; the trace is used to locate work and waiting.

See [final native findings](native-opening/final-native-analysis/findings.md), [per-window native comparison](native-opening/native-comparison.json), [B trace results](native-opening/final-native-analysis/results.json), and [raw trace hashes/configuration](native-opening/trace-manifest.json). The [parameterized analyzer](native-opening/analyze-native.py) accepts trace, event-log, PID and output arguments; the [comparison helper](native-opening/compare-native.py) preserves unavailable metrics as null.

## Remaining stalls at the beginning of motion

Buffered UI-thread progress and the final native trace show a real pause **after** animation starts, independently of the pre-motion wait. In B's first trace trial, progress advances from 14.2% to 51.9% across an 81.5 ms gap. Another trial starts with 10.2/14.1 ms gaps, then jumps from 25.4% to 59.4% across 87.7 ms. These are sampled shared-value changes, not proof of exact screen-presentation times.

During the first 200 ms, JS CPU execution is only 0.10–0.31 ms across the three trials. Fabric mount-batch wall time totals 2.93–5.24 ms and image installation 0–2.83 ms. In contrast, RenderThread executes for 85.3–120.7 ms, with additional runnable scheduling delay. The first large gap contains a 78.1 ms main-thread `postAndWait` span and expensive Skia command flushing. The other contains approximately 71 ms waiting in `dequeueBuffer`, identifying presentation-buffer backpressure. Nested native spans overlap and must not be added together.

This narrows the remaining beginning-of-animation issue to native drawing/presentation in the observed windows. Faster JS effects or decoded-image preloading alone cannot explain or remove those particular pauses. The source blur activates at progress greater than 0.04 immediately before these initial frames, making its opening activation a bounded hypothesis to test; the trace does not prove it owns every buffer wait. No additional radius, curve, or opening-stage design decision is established by this section. The accepted return and interaction cleanup remain separate requirements.

See [early-motion findings](native-opening/early-motion-analysis/findings.md), [exact opening progress samples](native-opening/early-motion-analysis/samples.json), [thread-state evidence](native-opening/early-motion-analysis/states.csv), and [native slices with offsets](native-opening/early-motion-analysis/slices.csv).


## Final opening-only change

The lighter radius-1 experiment was rejected: repeated worst-first-200-ms gap worsened from 70.7 to 83.5 ms, with inconsistent startup results. See [radius-1 progress](native-opening/opening-radius-abba-progress-summary.json) and [segments](native-opening/opening-radius-segments.json). Reducing blur strength was insufficient on this renderer.

The next comparison retained the stable derived-radius implementation and set **Android opening source blur to 0**, while preserving closing radius 4. This affects only the list behind the expanding page; the shared image, page geometry, page/content opacity, hero backdrop, timing curve and durations remain intact. iOS uses a different blur path and is unchanged.

| Median per-trial initial-motion measurement | Opening blur 4 | Final opening blur 0 |
|---|---:|---:|
| Repeated worst gap in first 200 ms, n=6 | 77.4 ms | **33.8 ms** |
| Repeated largest early progress jump | 30.3% | **13.7%** |
| Process-first worst gap, n=3 | 123.4 ms | **59.7 ms** |
| Process-first largest early progress jump | 32.0% | **21.6%** |
| Repeated release → first sampled motion | 379.4 ms | 383.9 ms |

Repeated worst initial gaps improved **56.3%**, with every candidate repeat between 30.6 and 41.1 ms and both candidate blocks reproducing the gain. Process-first still has a residual hitch: 48.7–74.6 ms in this small sample. Release-to-start delay is effectively unchanged. These are separate limits; the patch must not be described as an overall 56% faster app or a proven cold-start fix.

Closing logic and blur remain unchanged. Repeated return median sample gaps were 19.1→19.8 ms and p95 54.9→57.5 ms. Process-first p95 was 61.5→73.3 ms, so return-tail equivalence is not established. All 18 openings completed shared motion; baseline had 9/9 shared returns, candidate 8/9 with one fallback. The fallback occurred during return preparation, before any closing animation request. This is retained as an outcome, not silently excluded or proven to be caused by the opening change.

Full results, sample ranges, methodology, and raw evidence: [opening-only findings](native-opening/opening-zero-findings.md), [progress aggregate](native-opening/opening-zero-abba-progress-summary.json), [first-200-ms segments](native-opening/opening-zero-segments.json), [APK hashes](native-opening/opening-zero-abba/comparison.json).

## Visual and interaction checks

The final candidate was recorded separately from timing capture. All **107 encoded frames** across two openings and returns were reviewed. Neither cycle showed a source-image hole, duplicate cover, blank page, or endpoint flash. The retained list is clear during opening and blurred during return. It is fully clear after return at frame 34 (5.058922 s) and frame 91 (12.295944 s), remaining stable afterward. See [recording, timestamps and contact sheets](native-opening/final-opening-zero-visual/README.md).

A separate existing visual limitation remains: the first recording's hero backdrop is gray briefly before its blurred photograph appears; the second opening has the photograph already cached. This is independent of the shared foreground cover and was not changed by the source-filter optimization. Screen recording adds overhead and these frames are used for visual correctness, not the numerical performance comparison.

Earlier rapid-retap probes were conducted before the latest user confirmation and are preserved for completeness: [original baseline](native-opening/baseline-retap/analysis.json) and [stable-blur candidate](native-opening/final-retap/analysis.json). Baseline accepted 7/11 post-endpoint probes; stable blur accepted 8/12. Both missed four very early probes, with different timing distributions; these are not a matched acceptance-rate comparison. The user subsequently confirmed release/reopen behavior was good. The final opening-only work makes no additional release-path changes or new rapid-retap claim.


## Final validation and delivery state

- Full frontend Jest: **117 suites, 1,433 tests passed**.
- TypeScript typecheck passed.
- Targeted ESLint and Prettier checks passed for the shared transition, its tests, and motion tokens; `git diff --check` passed.
- Regression tests cover clear opening, unchanged return radius at progress 1, UI-thread cleanup at 0.04, cancellation, generation guards, fallback and endpoint visibility.
- Final diagnostic APK remains installed on the isolated emulator only. It uses local fixture services and is not a phone-distribution build. No phone installation, new commit, or push was performed for this opening-only patch.

Logs: [Jest](native-opening/opening-zero-full-tests.log), [typecheck](native-opening/opening-zero-full-types.log), [lint](native-opening/opening-zero-lint.log). The reusable [first-200-ms analyzer](native-opening/analyze-opening-segments.py) operates on the saved progress aggregate; sample acquisition is documented in `scripts/performance/input-latency/README.md`.


### Subsequent phone delivery

On user request, a fresh production-endpoint release APK was installed successfully with `adb install -r` on `192.168.1.9:44269`, preserving app data. Transition diagnostics and OTA loading are disabled for this test build. APK: `artifacts/animation-performance/opening-smooth-phone.apk`; SHA256 `de41c3e68efa020dd9054abec06e406789866d3908bd4b45d5d314bb9e452f11`. The earlier emulator-only delivery state above describes the measurement stage. Phone performance is not yet measured.
