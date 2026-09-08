# First-opening latency investigation — 7 September 2026

The first-opening delay is **not fixed**. Five implementation candidates were tested and rejected. Production opening behavior is restored to `e197e53`; its previously committed closing/input-release and flicker fixes remain intact. Only the opt-in measurement probe is improved. No experimental opening build was installed on the phone.

## Final controlled comparison

Times are milliseconds from injected native touch UP to the first sampled UI-thread animation progress. Smaller is better. Candidate F combines early overlay staging with starting timing directly when ready.

| Scenario | Baseline A median [range] | Candidate F median [range] | Samples per build |
|---|---:|---:|---:|
| First Details open after process restart | 446.4 [433.7–672.7] | 540.0 [400.6–605.5] | 3 |
| Repeated opening | 385.7 [305.7–573.3] | 366.3 [288.0–431.1] | 6 |
| Successful return endpoint → React unmount, repeated | 42.8 [33.8–103.1] | 43.3 [27.0–101.2] | A: 5, F: 6 |

F's repeated-open sample median improved 5.0%, but its process-first median worsened 21.0%. These small samples and overlapping ranges do not establish a reliable first-open improvement. Repeated block medians were A 387.6/383.8 versus F 362.1/370.5. All 18 openings reached a shared endpoint; baseline had one closing fallback, candidate none. F was rejected because it did not meet the first-opening objective.

The final matrix uses labels A=baseline and B=F. See [raw results and APK hashes](opening-combined-abba/comparison.json), [aggregated measurements](opening-combined-abba-summary.json), and reviewed endpoint screenshots: [baseline 1](opening-combined-abba/A-contact-0.jpg), [baseline 2](opening-combined-abba/A-contact-1.jpg), [candidate](opening-combined-abba/B-contact-0.jpg). Screenshots establish destination/return outcomes; they do not establish absence of transient flicker or frame pacing.

## Other candidates

| Candidate | Process-first UP→UI median | Repeated UP→UI median | Decision |
|---|---:|---:|---|
| Overlay staging only | 431.8 vs baseline 468.6, n=3 each | 352.1 vs 341.3, n=7 each | Rejected; exploratory unbalanced runs, no consistent total gain |
| Direct start from provider (B) | 572.0 vs A 505.9 | 439.3 vs A 390.2 | Rejected |
| Direct start + cached root frame (C) | 536.3 vs A 505.9 | 412.7 vs A 390.2 | Rejected |
| Press-in image predecode (D) | Pilot miss: 583.0, n=1 | 422.2 overall, n=7; ready-image hits 395.5, n=5 | Rejected; first tap can miss, hits do not establish improvement |
| Early overlay + direct start (F) | 540.0 vs A 446.4 | 366.3 vs A 385.7 | Rejected; first-open objective failed |

B/C used a balanced A-B-C-C-B-A order plus one additional process-first trial per build: n=3 process-first and n=6 repeated each, 27 open/return pairs. All openings completed shared motion; 26 returns were shared and one B return fell back. See [summary](opening-abccba-summary.json). Both this matrix and final F matrix used identical stable probes. Exploratory staging results used older probes and must not be directly pooled with these matrices.

Predecode hit/miss results are descriptive, not randomized cache strata. See [stratification](opening-predecoded-stratified.json). Rejected implementations and regression tests are preserved as `.patch`/`.txt` research artifacts, not live source. Visible-card prewarming was considered but not implemented because decoded-image hits still failed to demonstrate meaningful benefit.

## What the evidence establishes

The delay exists before motion begins; changing the animation duration cannot remove it. Readiness has multiple stages: input delivery, source measurement, navigation and destination mounting, overlay readiness, then UI execution.

Staging moved work between stages rather than reliably removing it. In the final repeated runs, destination→ready fell from 134.8 to 0.1 ms, but UP→navigate increased from 16.2 to 90.0 ms and ready→first UI increased from 62.7 to 118.1 ms. Stage medians are separate distributions and should not be summed as one representative trial.

Already-decoded native image references still took a median 99.3 ms from destination measurement to overlay readiness (five hits, range 77.1–141.4 ms). Consequently, calling this entire interval “image decoding” is incorrect. It includes mounting/layout and event scheduling. The exact split between React work, Android main-thread work, image-event delivery and UI scheduling remains unproven.

An audit also found that mounting the diagnostic probe only at the flying phase could miss early progress after a direct start. The retained measurement-only change mounts it during preparation and keeps it stable through takeoff/return. Normal builds have diagnostics disabled, so this does not change their transition behavior.

## Method and limits

- API 36 ARM64 emulator, 720×1600, density 280, two CPUs, SwiftShader software rendering; local fixture backend. All performance input targeted `emulator-5554`.
- Release APKs; diagnostics enabled equally in controlled variants. Install `-r` preserved data. Process-first means force-stop/relaunch and first Details open after a verified feed plus five seconds; it does **not** mean empty disk cache or first-ever installation.
- Persistent native input driver, approximately 60 ms press. Twenty clock-audit trials matched React Native event timestamps to injected native DOWN exactly; diagnostic clock alignment was within approximately 3 ms. Injection logging/dispatch overhead remains included.
- No builds, tests, or screen recording during numeric windows. Screenshots taken afterward. Alternating build order limits temporal drift but does not eliminate emulator noise.
- First sampled UI progress is not first displayed pixel, hardware touch latency, FPS, jank percentage, or iOS/phone performance. No confidence interval or physical-device gain is claimed.
- F's endpoints were reviewed; no dedicated frame-by-frame flicker or rapid-retap qualification was completed for F because it failed the opening performance gate and was removed.

## Retained changes and checks

- Prior closing fix already committed and pushed as `e197e53918ef5538cee8349d161225d9eaeb40f8`.
- All five experimental runtime files restored to that baseline; only the stable opt-in probe remains in `EventSharedTransition.tsx`.
- After restoration: three relevant suites, 32 tests passed; TypeScript check passed. These include existing close/flicker lifecycle guards.
- Candidate F previously passed 32 focused transition tests and typecheck. A full run had 116 passing suites and one failing asynchronous-navigation assertion; that assertion was corrected and its two-test suite passed. Those experimental assertions were subsequently restored with the rejected implementation.
- New measurement artifacts and this report remain uncommitted for review. The phone remains on its earlier closing-fix build.

## Next implementation gate

Capture a native system trace around process-first input alongside the existing phase markers. Attribute the longest interval to React/JS execution, Fabric/native mount, Android main-thread scheduling, image event delivery, or Reanimated work. Optimize the demonstrated owner of that interval, then repeat the same alternating release matrix. Do not retain a change solely because an intermediate readiness marker improves. A candidate must improve process-first end-to-end latency without worsening repeated opens or the existing return/flicker/input behavior; then qualify frame pacing, rapid retaps, idle/resume and phone behavior separately.
