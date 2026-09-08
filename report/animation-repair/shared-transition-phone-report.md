# Shared cover transition on the phone — audit, measurements and optimization (8 September 2026)

Device: the user's Samsung Galaxy A56 (SM-A566E, Android 16, 1080×2340, 120 Hz), production endpoints, existing signed-in session, Discover showing one hosted card. Every number below is from this phone; nothing is emulator data. The user's phone is a personal device: two runs were interrupted by other apps (a Zomato order screen, an incoming call) and those cycles were discarded, and the runner now refuses to inject input unless our app owns the focused window.

## Audit of the implementation

The transition was built correctly: the flight lifecycle, generation guards, fallbacks, endpoint re-measurement and the `animation: 'none'` route handling all behaved as documented, and every measured cycle (7 per build, both directions) completed a shared open and a shared return. What cost time was structural, not a bug:

- Every stage between the tap and the first moving frame ran through a React commit: the destination mount, then a `flying` commit whose passive effect started the clock. On the return, Back mounted a fresh overlay, waited for its image, then committed `closing` (which re-rendered every card, the hero, the page and the source blur, and unmounted two BlurViews) before the clock started.
- The flying cover's bitmap could only start loading after the Details page's mount frame, because the overlay was mounted in the same commit as the page.
- Phase changes re-rendered every `EventCardRow` in the feed (one card here; more on a real feed).

## Baseline timeline on the phone (commit `d5cf1a7`)

Release-to-motion is the interval between native finger UP and the first UI-thread progress sample; Back-to-motion is the same from the native Back key. Seven cycles, median [min–max] in ms.

| Opening stage (relative to finger UP) | Baseline |
|---|---:|
| Tap reaches JS (`onPress`, navigate) | 13–14 |
| Details rendered and hero measured (`destination-measured`) | 111 [102–119] |
| Flying cover bitmap ready (`cover-ready`) | 168 [154–181] |
| `flying` commit and effect (`animation-requested`) | 183 [175–193] |
| **First UI-thread motion** | **191 [181–203]** |
| Endpoint | 689 |

| Return stage (relative to Back) | Baseline |
|---|---:|
| Back reaches JS (`close-request`) | 23 [12–35] |
| Return overlay mounted and its bitmap ready | 99 [68–110] |
| `closing` commit and effect | 120 [89–133] |
| **First UI-thread motion** | **131 [98–152]** |
| Endpoint | 530 |

Perfetto attribution of one opening: the JS thread renders the Details page for ~90 ms (navigate → hero layout report), the main thread then mounts it in one 34 ms frame (99 view inserts, 34 text-state updates, 104 layout updates, then Android layout and draw), the 600×600 cover decodes in 2 ms but only after that mount frame, and the takeoff commit plus UI pickup add ~25 ms. Once motion started, both directions already ran at ~114 fps presented cadence with at most one skipped frame at takeoff; the perceived lag was entirely pre-motion latency.

## Changes

1. **Primed overlay.** Press-in now mounts the flying cover invisibly (`primed`, private to the provider) so its bitmap decodes during the press; a primed overlay for another card or older than `primedFrameTtlMs` is dropped.
2. **Direct start.** The provider writes source/landing geometry to shared values and calls the timing itself; the moving phases live only in the ref, and every visual rule (hero cover, card cover, page surface/content, iOS backdrop, Android source blur, overlay visibility) is progress-driven, so no React commit precedes motion and consumers do not re-render at takeoff.
3. **Takeoff after the mount frame.** When the bitmap was ready before the destination landed, the clock starts on the next animation frame rather than in the destination's own commit turn (starting in that turn made the first evaluated frame the heavy mount frame and the next one jump 20 %).
4. **Retained return overlay.** After opening, the loaded overlay stays mounted and hidden over the hero; Back re-measures both endpoints, writes the shared values and starts the return timing in the same turn. The full `closing` commit is deferred to completion.
5. **Narrow material context.** `HeroButtonBlur` reads `useEventSharedTransitionMaterial`, so the two Android BlurViews unmount at return start through a commit that re-renders nothing else. Left live, they doubled per-frame main-thread traversal during the return and produced 20–30 ms gaps.
6. **Bounded-start timing.** `withSteadyTiming` (`src/utils/steadyTiming.ts`) bounds the first six frame steps to 12 ms. With motion starting ~30 ms after Back, the display is still at its idle cadence and its switch back to 120 Hz costs ~30 ms between the first two frames; the baseline hid that inside its 131 ms, while a wall-clock `withTiming` started early turned it into a 15–20 % first step. Frames without drawn content do not trigger the switch, so waiting a frame does not help.

Full Jest: 116 suites / 1,428 tests; typecheck; lint (8 pre-existing warnings on untouched lines, 0 new); Prettier on touched files.

## Results (final diagnostics build `f6d24d15…`, seven cycles each)

| Measurement | Baseline | Final | Change |
|---|---:|---:|---:|
| Release → first opening motion, median [min–max] | 191 [181–203] | **159 [143–176]** | −17 % |
| Back → first return motion, median [min–max] | 131 [98–152] | **31 [16–45]** | −76 % |
| Shared opens / returns completed | 7 / 7 | 7 / 7 | |
| Opening: largest progress step between samples | 0.048 | 0.048 | |
| Return: largest progress step between samples | 0.059 | 0.083 | bounded |
| Opening sample gap median / max | 8.3 / 11.2 ms | 8.3 / 11.5 ms | |
| Return sample gap median / max | 8.3 / 10.0 ms | 8.3 / 36.7 ms | see below |
| Return duration to endpoint from first sample | 397 ms | 405–424 ms | bounded steps |
| Return endpoint → page unmount | 29 [23–74] | 29 [27–76] | |

Perfetto motion windows (traced runs, six cycles): opening 112–114 fps presented cadence, gap max 17 ms, 2–3 app deadline misses per open at takeoff; return 114–118 fps, 1 deadline miss. The one remaining long gap (up to 37 ms) is the display's refresh-rate switch on the first return frame; the bounded timing keeps progress from jumping across it, so it shows as a few milliseconds of delay rather than a snap.

Visual check: a separate two-cycle recording of the final code shows a single cover leaving the card, the page growing from the card bounds, the return contracting over the blurred feed, and the blur clearing about 224 ms into the return as the cover settles. No duplicate cover, hole, flash or endpoint washout.

### Intermediate candidates (kept as evidence)

| Build | Open | Back | Note |
|---|---:|---:|---|
| Candidate 1 (primed + retained + direct start, `flying`/`closing` still committed) | 163 | 37 | closing commit landed on moving frames: 0.20 jump |
| Candidate 2 (moving phases ref-only) | 161 | 42 | BlurViews left live during the return: 0.15–0.23 jump |
| Candidate 3 (material context, return clock one frame later) | 164 | 63 | clock started between frames during the refresh switch: 0.15–0.20 first step |
| Candidate 4 (same-turn start + bounded timing) | — | — | crashed: custom-animation callbacks are not auto-workletized |
| Candidate 5 (bounded 3 frames) | 171 | 32 | first step ≤ 0.09, later 60 Hz-cadence steps 0.10 |
| Candidate 6 / final (bounded 6 frames) | 159 | 31 | table above |

## What is left

- The opening floor is the Details page itself: ~94 ms of JavaScript render plus the 34 ms mount frame before the hero can be measured and shown. The next lever is mounting below-the-fold Details content (host request tabs, member lists, overlays) after the flight; it changes when that content appears, so it was not done here.
- Back-key delivery costs 17–31 ms before JavaScript sees it (key down, IME round trip, React Native reacts on key up); the in-app back button is a tap and does not pay this.
- On a 60 Hz display or during the refresh switch the return's first steps are bounded to 12 ms, which extends the 400 ms return by up to ~25 ms.
- Not measured: iOS, other Android devices, feeds with many cards, cold process starts, uncached cover images.

## Evidence

All under `artifacts/animation-performance/shared-transition-phone-2026-09-08/` (ignored): `base-markers*`, `cand-markers*` … `cand6-markers` (events, trials, screenshots, `analysis.json`, progress analyses), `*-trace` folders with `trace.perfetto-trace` and `trace-summary.json`, `cand5-video/` (recording, frame contact sheets), `clean-blind-trace/` and `clean-video*/` (the untouched production build), APK hashes in `*-apk-sha256.txt`. Scripts: `phone-run.py`, `phone-stages.py`, `phone-trace-analyze.py`, `phone-trace-timeline.py`, `phone-video-analyze.py`. Analyzers from `scripts/performance/input-latency/` were reused unchanged.
