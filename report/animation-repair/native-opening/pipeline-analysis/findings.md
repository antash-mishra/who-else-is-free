Native pipeline analysis — stock trace, PID 16838

Clock validation: clock_snapshot shows BOOTTIME is MONOTONIC minus 83–84ns.
SQL uses input/JS/UI uptime milliseconds ×1e6 minus84ns. This sub-microsecond
correction is negligible beside input timestamp's millisecond resolution, but
explicitly verified. No suspended-time offset appears in captured snapshots.

Completed input→first-motion windows: cycle0 1064ms; repeated cycles1/2/3/4/6
334/287/441/252/661ms. Cycle5 first motion occurred at2060ms but opening did
not complete and watchdog cancelled it; retain it as a failed transition,
not an ordinary successful latency sample. These traces themselves run slower
than several earlier untraced benchmarks and should not replace their medians.

Confirmed attribution:
- Longest successful first window: JS executes489ms and is runnable but not
  scheduled392ms. Main executes330ms and is runnable276ms. Thread times overlap
  across threads and MUST NOT be summed as sequential delay components.
- First takeoff-ready→animation-requested gap398ms contains207ms JS Running
  and191ms JS Runnable. This is a direct native scheduler attribution; it is
  neither image decoding nor waiting solely for another native measurement.
- Repeated JS Running spans136–368ms and Runnable80–241ms. The post-readiness
  gap itself is also split between JS execution and runnable waiting.
- Main mount-dispatch elapsed spans25–71ms in completed repeats. These spans
  include time descheduled and are NOT pure mount CPU time.
- Main postAndWait elapsed spans19–53ms in completed repeats. Drawing waits
  exist but do not explain the entire release-to-motion gap.
- Every opening initiates three image requests. In repeats, two complete in
  0.1–2.6ms while one takes81–896ms. Cycle2's long request completes after its
  287ms first-motion point, proving that request is not gating takeoff there.
- Fast resource completion precedes the image-install callback: request ends
  during mount/layout work; callback is deferred until the main loop can run its
  front-of-queue work. Example cycle1 has requests ending around128/142ms after
  release and initial onResourceReady callbacks around171ms.
- Exact image-view identity is absent from these slices. The slower request is
  consistent with the backdrop's disk-only/blur path, but cannot be attributed
  definitively without a per-view diagnostic. Do not claim backdrop cache alone
  fixes first-opening latency from this trace.
- First open includes ~20.6ms JS-side lazy ExpoHaptics module setup. This is a
  real but small cold-only cost, not the dominant ~1s delay.

Remaining attribution gap:
JS CPU is substantial but largely lacks named slices; Perfetto does not identify
which React components/hooks/worklets occupy it. A Hermes sampling profile on
a matched diagnostic build is needed before naming EventDetails render as the
CPU culprit. Reanimated profiling sections are compiled out in stock release.

Artifacts: clocks.sql/csv; states.sql/csv (whole windows and adjacent phases);
slices.sql/csv (all app thread slices); async_images.sql/csv; windows.json;
markers.json; summary.json; analyze.py and summarize.py are reproducible.
