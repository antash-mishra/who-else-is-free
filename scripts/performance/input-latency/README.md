# Event card input latency (Android emulator)

These probes measure native input dispatch to the first observed Reanimated UI progress sample, not display presentation or FPS. `EXPO_PUBLIC_TRANSITION_METRICS=true` enables diagnostic markers in a freshly bundled release APK. Leave it unset in normal builds. Markers contain timings/phases only, never event IDs or content.

Use an isolated local fixture server and emulator session (see the parent performance README). The runner asserts `ro.kernel.qemu=1` and targets only `emulator-5554`. It expects a 720×1600 Discover screen with its first card covering (100, 410), and shared motion enabled. Wait for the feed to finish loading before running. It never creates events, changes accounts, or clears app data.

Compile `LatencyInput.java` using JDK 17 and the Android 36 platform jar, then convert the class with Android build-tools `d8`. Push the resulting `classes.dex` to `/data/local/tmp/weif-latency.dex` on `emulator-5554`. The runner starts the driver through `app_process`, logs touchscreen DOWN/UP and Back timestamps using Android uptime, and injects via Android's internal input manager. This internal API is verified only on API 36.

```sh
python3 scripts/performance/input-latency/run.py artifacts/animation-performance/input-latency/my-normal normal
python3 scripts/performance/input-latency/analyze.py artifacts/animation-performance/input-latency/my-normal
python3 scripts/performance/input-latency/run.py artifacts/animation-performance/input-latency/my-retap retap
python3 scripts/performance/input-latency/analyze.py artifacts/animation-performance/input-latency/my-retap
```

Output directories must be new. Normal mode runs seven open/return pairs; retap mode runs eighteen probes around the return endpoint. Screenshots are captured after motion, outside the measured normal window. Review all destination screenshots. Do not run screen recording, builds, or tests during numeric capture: software-rendered emulator load changes results substantially.

`events.jsonl` preserves diagnostic and native input records; `trials.json` identifies window indices. Analysis sorts by acquisition time to restore ordering between logging threads, then subtracts native/UI/JS monotonic timestamps. Clock alignment was checked against `nativeEvent.timestamp` in this session. Recheck that assumption when changing platforms or runtimes. The UI probe's mount/sampling latency and diagnostic overhead are included. Host delays merely target the retap window; actual DOWN minus closing UI endpoint determines whether a tap occurred after the return. Expected blocked taps during motion are reported separately. An absent shared endpoint is a fallback/incomplete outcome, never a zero-latency success.

Historical evidence and limitations: `report/animation-repair/input-latency-report.md`.
