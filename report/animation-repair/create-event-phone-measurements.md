# Create Event opening — physical phone measurements, 8 September 2026

Measured the installed release from commit `0b97d56` on the user's Samsung Galaxy A56 (SM-A566E), 1080×2340. No application code or device refresh-rate setting was changed. Six blank-form open/Back cycles were traced without screen recording, followed by separate visual recordings. No events were submitted. This is an already-running app, not a controlled process-cold launch.

## Click to visible form

The timestamped recording has two openings. Native DOWN/UP logs and the device-clock video overlay establish timing; the frame intervals near each boundary are approximately 8.3 ms. Values describe visible output, not a JS readiness callback or a touchscreen sensor-to-photon laboratory measurement.

| Measurement | Opening 1 | Opening 2 |
|---|---:|---:|
| Tap release → first visible Create plan header | 118 ms | 125 ms |
| First visible header → visually settled header | 234 ms | 233 ms |
| Tap release → visually settled form layout | 352 ms | 358 ms |
| Touch down → visually settled form layout | 434 ms | 441 ms |
| Tap release → cover fully visible | approximately 601 ms | already visible by 358 ms |

The header position was checked frame by frame against its final position (approximately 2 physical pixels tolerance, using OCR bounding boxes and visual inspection). Tiny spring changes can continue after visual settling; these values are **not** native animation-completion callbacks. First visibility is bracketed by adjacent frames, so avoid sub-millisecond precision.

The first recorded cover is still a gray placeholder when the form settles. It starts becoming visible later and finishes its crossfade around 600 ms after release. The second cover is already visible when the layout settles. Different randomly selected cover assets and network/cache state can change this wait. The uninstrumented recording also showed a faster image appearance; two samples do not establish a population image-loading percentile.

## Is it 60 fps?

**Most of the visible slide meets 60 fps and runs near 120 fps on this phone, but opening is not completely hitch-free.** Actual FrameTimeline records show a typical presentation interval of approximately **8.3 ms**. The device was operating at 120 Hz; no forced 60 Hz comparison was performed.

| Native trial | Largest gap in first 200 ms after release | Presentation cadence in 120–360 ms window | Largest gap in that window |
|---|---:|---:|---:|
| 1 | 49.8 ms | 100.9 fps | 41.6 ms |
| 2 | 33.2 ms | 120.2 fps | 8.4 ms |
| 3 | 58.1 ms | 120.2 fps | 8.4 ms |
| 4 | 49.8 ms | 120.1 fps | 8.6 ms |
| 5 | 49.8 ms | 120.1 fps | 8.7 ms |
| 6 | 58.1 ms | 120.1 fps | 8.6 ms |

The 120–360 ms window is a sensitivity check chosen from the independently recorded visible-slide bounds; exact unrecorded transition start/finish markers are unavailable. Five subsequent opens deliver about 120 fps within this window. The first observed trial has an approximately 42 ms gap during early motion. Across all six trials, initial 33–58 ms gaps occur mainly before or around takeoff. Therefore an average above 60 fps does not mean every frame meets the 16.7 ms budget.

Across the first 600 ms after each release, **18 of 358 app frame records (5.0%)** carry `App Deadline Missed`. This includes press feedback, form mounting, and the spring tail, not solely visible motion. The 200–700 ms windows have 115–120 fps observed cadence and no presentation gaps above 20 ms. Avoid including long static-screen gaps after settling in an animation-FPS calculation.

Android also reports many `Buffer Stuffing` records. These indicate pipeline latency/backlog and are not equivalent to app deadline misses or missing presented frames. Presentation cadence here uses distinct SurfaceFlinger display-frame endpoints joined to this app surface; native frame completion duration is not inverted to invent FPS. MONOTONIC input timestamps are explicitly mapped using trace clock snapshots (the phone has accumulated substantial suspend time).

## Why the initial pause occurs

In the first 200 ms after release, the trace records approximately **99–112 ms of JavaScript CPU execution** and **97–124 ms of main-thread CPU execution**, on separate threads. The largest individual Fabric mount batches last **13–19 ms**. These costs occur while the Create form is being prepared and mounted, near the observed takeoff gaps. They support an initial rendering/mounting bottleneck; the trace does not identify one React component as its sole cause. Native bitmap decode spans are also present, but image display can finish independently after layout settles.

Source inspection confirms that `CreateEvent` uses `slideFromBottomTransitionSpec` with `Springs.snappy` (mass 0.3, stiffness 600, damping 40). React Navigation's stack uses React Native Animated with `useNativeDriver` on Android. This transition already runs natively once scheduled. There is no fixed 350 ms duration in configuration; the observed visible duration follows the spring and the work preceding it.

## Evidence and limits

- [Per-trial native summary](create-event-phone-measurements/native-summary.json)
- [Device-clock visual timings](create-event-phone-measurements/visual-timings.json)
- Raw traces, frame CSVs, input logs, recordings and selected video frames are retained locally under ignored `artifacts/animation-performance/create-event-phone-2026-09-08/`; raw phone screens are not placed in the public report.
- Performance tracing and screen recording each add overhead. Numeric frame capture and video were separate; neither was run alongside a build or tests.
- No event submission, network action completion, keyboard transition, iOS behavior, or forced-60-Hz mode was measured here. The app and phone settings were preserved, including restoring the touch indicator to its original setting.

The next improvement to investigate is reducing initial Create form mount work and avoiding an empty cover placeholder at takeoff. These measurements alone do not justify changing the existing native spring or claiming a fix has been made.
