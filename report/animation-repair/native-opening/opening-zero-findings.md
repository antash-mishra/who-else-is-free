# Opening radius 0, return radius 4 — measured opening improvement

A retained stable blur radius 4 in both directions. B disabled source blur only during opening, retaining radius 4 on return, the existing page/backdrop opacity, the 500 ms opening duration, and the accepted release implementation. ABBA provided six repeated and three process-first openings per build. Process-first means first Details after process restart with existing caches, not first-ever installation.

## Targeted first-200-ms results

Values are medians of per-trial maxima; ranges retain every complete trial.

| Metric | A: opening radius 4 | B: opening radius 0 |
|---|---:|---:|
| Repeated worst early gap | 77.4 ms [58.1–89.6] | **33.8 ms [30.6–41.1]** |
| Repeated maximum early progress jump | 30.3% [21.0–35.5] | **13.7% [9.6–16.9]** |
| Process-first worst early gap | 123.4 ms [97.1–148.1] | **59.7 ms [48.7–74.6]** |
| Process-first maximum early progress jump | 32.0% [29.7–41.9] | **21.6% [15.7–29.3]** |

Both candidate repeated blocks reproduce the improvement. Every repeated candidate trial had a worst early gap below 50 ms and maximum early progress jump below 20%, satisfying the proposed repeated-opening targets. Process-first improved substantially, but its median remains above the proposed 50 ms / 20% targets. Do not describe all first-opening hitches as fixed.

The improvement concerns the initial motion, not release-to-start latency. Repeated release-to-first-motion was **379.4 → 383.9 ms**, effectively unchanged. Process-first was **561.8 → 498.9 ms**, a tentative improvement with only three observations per build. First-sample-to-completion medians stayed approximately **532 → 509 ms** repeated and **495 → 526 ms** process-first; configured duration remained 500 ms. No shortening was used to obtain the cadence result.

## Existing return behavior checked

Repeated return median per-trial gap was **19.1 → 19.8 ms**, p95 **54.9 → 57.5 ms**. Process-first return median gap was **25.9 → 21.6 ms**, but p95 increased **61.5 → 73.3 ms**. These do not support a blanket claim of improved or unchanged return tails.

Back-to-first-return-motion medians were **202.1 → 119.1 ms** repeated and **146.1 → 133.8 ms** process-first. Endpoint-to-unmount medians were **49.4 → 39.3 ms** repeated and **78.7 → 32.4 ms** process-first. A completed nine of nine shared returns; B completed eight, with one recorded fallback. The accepted release path was not modified; no new retap work was performed for this experiment.

**Recommendation: retain for visual review as a substantial opening-hitch improvement**, provided the opening appearance is acceptable. Do not claim complete first-process-opening repair, eliminated fallback behavior, or a release-latency improvement. This differs from the rejected radius-1 experiment: radius 0 reproducibly removes the repeated opening stall.

## Method and evidence

These are native-input and buffered Reanimated UI progress measurements on the software-rendered emulator, not hardware display FPS or phone performance. Early intervals start before 200 ms relative to the first buffered motion sample; a boundary-straddling interval is retained in full. First and terminal progress observations can occur slightly after the corresponding animation callbacks. All 18 opening trials had complete buffers; no capped samples were excluded. There were 17 complete shared returns and one fallback.

The time-gap results support the progress-jump comparison: ease-out cubic naturally produces larger early increments even at constant cadence. Percentage jumps therefore are not used alone as evidence of jank. Sample sizes are small, and sequential blocks cannot eliminate host-load variation.

- [Progress and latency aggregate](opening-zero-abba-progress-summary.json)
- [First-200-ms segments](opening-zero-segments.json)
- [APK hashes and matrix metadata](opening-zero-abba/comparison.json)
- Raw diagnostic events, trial boundaries, analyses, and representative/fallback screenshots: [capture directory](opening-zero-abba/). Duplicate readiness screenshots and APKs are excluded from this curated copy.
