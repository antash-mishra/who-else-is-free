# Android animation measurements

Use a dedicated local emulator and local test server. Never drive a physical
phone with this runner. Install a release APK with its API/WS URLs explicitly
compiled to the local server and OTA updates disabled **in the local native
build only**. Authenticate using the existing debug dev-login flow first if
needed, then install the release APK with the same signing key without clearing
its data. Do not enable dev-login in production or add it to the release app.

Seed Discover with a visible event; inspect the emulator to choose its first
card's tap coordinates. Keep AVD/API, renderer, size, density, data, cache state,
animation scale and host load fixed. Stop compilers/Metro/tests during capture.
The user must validate physical-device smoothness separately.

```sh
adb -s emulator-5554 shell perfetto --background --txt -c - \
  -o /data/misc/perfetto-traces/animations.perfetto-trace \
  < scripts/performance/animation-trace.pbtxt
python3 scripts/performance/emulator_frames.py --tap 150 400 \
  --ages 15,25,35,40,45,60,120 --output /tmp/animation-baseline
adb -s emulator-5554 pull /data/misc/perfetto-traces/animations.perfetto-trace \
  /tmp/animation-baseline/
```

The config records 150 seconds. Extend `duration_ms` for longer scenarios.
`--repeat 20` runs evenly spaced repeated opens instead of the session-age
matrix. Repeat with the fixed build and additional batches. Preserve raw files.

Each iteration captures open-window gfxinfo (before screenshots/back), session
age, device uptime and a destination screenshot. Inspect **every** destination;
an empty frame sample or wrong screen is a failed/invalid interaction, not zero
jank. On a slow emulator the splash may still be present at five seconds, so use
an initial age after the verified interactive state and report the limitation.
The script resets per-window counters; frames span app drawing in the window,
not just the cover flight. FrameCompleted minus IntendedVsync is a gfxinfo
latency metric, not FPS or a standalone presentation-jank definition. Prefer
Perfetto's actual/expected FrameTimeline and distinguish app vs SurfaceFlinger
jank. Never average idle time into a smoothness score. Record video separately.

Perfetto SQL starting point (adjust package/process names only after inspection):

```sql
SELECT p.name, a.jank_type, count(*) AS frames,
       round(avg(a.dur)/1e6, 2) AS mean_frame_ms
FROM actual_frame_timeline_slice a
JOIN process p USING (upid)
WHERE p.name = 'com.whoelseisfree.app' AND a.dur > 0
GROUP BY p.name, a.jank_type;
```

Filter trace results to each measured interaction's device-uptime window.
The full trace also contains launch and return transitions: do not report its
aggregate as the cover animation's jank rate. Quantiles from a few interactions
are descriptive samples, not reliable population p95/p99 latency estimates.

Use `summarize_trace.py <output-directory> --processor <trace_processor-path>`
for per-window app deadline counts. It uses the actual PID from gfxinfo because
new processes can still be named `zygote64` in a startup trace's process table.
It writes the exact SQL and CSV beside the raw trace; keep both for review.

## Create, tabs, keyboard and sheets

`transition_scenarios.py --scenario <steps.json> --output <directory> --cycles 6`
executes an explicit JSON array, for example
`[{"name":"create-open","input":["tap",360,1475]}]`. Supply a complete cycle
returning to the initial screen. Coordinates must come from an inspected UI
hierarchy for this emulator. Save the trace as `trace.perfetto-trace` in the
output directory, stopping the owned Perfetto PID after the run, waiting for the output file to finish flushing, then pulling. An immediate pull can produce an empty file; verify nonzero size before analysis.

The default capture window is 1.6 seconds plus the ADB input command duration.
Device uptime is sampled before input; boundaries include ADB overhead and are
approximate. Screenshots are taken outside the measured window. These windows
include navigation and rendering work, not exclusively the animated property.
Native modal windows disappear from gfxinfo on dismissal, so use FrameTimeline
for sheet-close comparisons. Do not interpret `drawing_span_ms` as animation
duration or `adb_input_command_ms` as tap-to-response latency.

After `summarize_trace.py`, run
`compare_transitions.py <baseline-directory> <candidate-directory> --output <comparison.json>`.
This excludes each run's first cycle, computes a p95 from each trial's positive
actual FrameTimeline durations, and reports the median of those trial p95s.
It also reports aggregate App Deadline Missed records / app frame records.
These are frame records, potentially from multiple app surfaces; they are not
unique display refreshes, FPS, or input latency. Preserve per-trial ranges and
report regressions as well as gains. Video measurements are separate single
observations with uncertainty bounded by adjacent recorded frame timestamps.

When switching local/production `EXPO_PUBLIC_*` URLs, Gradle may consider the JS bundle up-to-date because those environment values are not task inputs. Force `createBundleReleaseJsAndAssets` to execute (for example with a temporary Gradle init script setting its `outputs.upToDateWhen { false }`), then inspect the APK bundle for the intended API/WS URLs and absence of fixture URLs before installing. A successful assemble alone does not verify the endpoint.
