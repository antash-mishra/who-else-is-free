Final retained B — opening startup versus first200ms of actual motion

Three trials, same final trace/markers. Exact shared-value progress timestamps,
not JS log-arrival times, delimit motion. Clock mapping uses validated−41.5ns.

Before first motion:
- readiness→animation request143.8/32.8/40.8ms.
- animation request→first sampled motion45.4/12.9/29.5ms.
- Initial native UPDATE_PROPS batch includes44instructions in trials1/2 and
  consumes2.3/9.8ms; no long image installation in that request→first interval.
- These waits precede motion and are separate from the stutter described below.

Actual beginning-of-animation stutters:
- Trial0 first three progress samples4.8%,14.2%,51.9%. Gaps30.3ms then81.5ms.
  During second→third gap JS sleeps the entire81.5ms. Main postAndWait78.1ms;
  RenderThread runs62.0ms and is runnable19.5ms. No image callback in the gap.
- Trial1 first3samples1.7%,11.3%,20.2%; gaps12.4/24.9ms, better initially.
- Trial2 first3samples7.7%,16.9%,25.4%; gaps10.2/14.1ms, then an87.7ms gap
  jumps from25.4% to59.4%. Main postAndWait84.9ms spans this startup stall.

Across first200ms:
- JS CPU0.27/0.31/0.10ms: React work is not blocking this phase.
- RenderThread CPU120.7/91.4/85.3ms, plus runnable70.0/32.6/37.8ms.
- Fabric mount-batch wall totals5.24/2.93/3.15ms.
- Image installation totals2.83/1.17/0ms.
- Trial0 RenderThread flush commands spans57.9ms during its major initial stall;
  Skia/Ganesh work appears underneath. Trial2's major stall instead includes
  eglSwapBuffersWithDamageKHR72.0ms / dequeueBuffer71.1ms: presentation-buffer
  backpressure. Nested durations overlap and must not be summed.

Conclusion:
There are two distinct issues: pre-motion preparation/scheduling, and initial
native rendering/presentation stalls after motion has already begun. The latter
will not be fixed by faster React effects or preload alone. Shared progress
advances on elapsed time after missed callbacks, producing large visible jumps.

Opening-only next hypothesis, not a shipping recommendation:
The retained source's Android blur effect activates atprogress>.04, immediately
before the expensive initial render frames. An isolated diagnostic disabling this
effect ONLY during landing/flying (keeping closing and interaction cleanup exactly
unchanged) can test how much first activation/effect workload contributes. Compare
first200ms flush/dequeue spans and progress jumps, not totalflightdurationalone.
Source blur activation is a hypothesis; trace cannot prove it owns allbufferwaits.
If nativebufferbackpressurepersists, inspect SurfaceFlinger/renderer scheduling
before another app-code change. Do not add previously rejected hardware caching
of trees containing live BlurViews; that caused native failures earlier.

Artifacts: samples.json, states.sql/csv, slices.sql/csv. Generator is
/tmp/weif-opening-native/early-motion.py. Small emulator trace, no phoneFPS claims.
