# Bottom-tab performance capture — 2026-09-23

## Device and method

- Galaxy A56 (SM-A566E), Android 16, display running at 60 Hz.
- Signed release APK, tested on the same device before and after changing Android inactive tab scenes from `display: 'none'` to `opacity: 0`.
- Repeated three cycles through My Plans → Discover → Profile → Discover. Reset `dumpsys gfxinfo com.whoelseisfree.app` before each tap and collected its frame summary after 1.25 seconds. Screen recordings were reviewed frame by frame. The recordings remain local because they contain account and event details.

| Destination          | Before: janky frames | After: janky frames | Before: median reported p95 | After: median reported p95 |
| -------------------- | -------------------: | ------------------: | --------------------------: | -------------------------: |
| Discover (6 returns) |      13 / 342 (3.8%) |      8 / 347 (2.3%) |                     22.5 ms |                      18 ms |
| My Plans (3 returns) |       3 / 172 (1.7%) |      3 / 174 (1.7%) |                       13 ms |                      15 ms |
| Profile (3 returns)  |       4 / 174 (2.3%) |      3 / 178 (1.7%) |                       14 ms |                      19 ms |

In the baseline recording, the Discover event cover appeared pale for two video frames after the rest of the scene was visible. In the candidate recording, the cover was fully painted in the first sampled visible frame. A separate candidate return to an empty My Plans page likewise showed its illustration in the first sampled frame. Android's UI tree excluded controls from inactive tabs after the change.

## Finding and change

`TabAccessibilityBoundary` in `src/navigation/AppNavigator.tsx` applied `display: 'none'` to inactive Android scenes. React Navigation was already retaining the tab screens, but removing their native layout made imagery repaint when a tab became visible again. Android now uses `opacity: 0` for inactive scenes while preserving the existing pointer-event and accessibility gates. iOS keeps its prior visibility behavior. This reduces the observed Discover image flick and improves Discover frame smoothness in this sample.

## Limits and next capture

This is a small, sequential device sample; the My Plans and Profile p95 figures vary in both directions. `gfxinfo` measures rendered frames, not the time from finger contact to a usable screen. The attempted touch-marker capture was interrupted when the phone locked, so no touch-to-visible latency figure is claimed. If tab taps still feel slow, the next capture should pair a visible touch marker with a high-frame-rate recording or a Perfetto input/React Native trace, then inspect tab button work, navigation JS time, and Discover refresh/render work at the delayed frame. Keep the phone unlocked during that capture.

The project emulator performance runner is restricted to emulators; these measurements used one-off ADB captures on the physical device.
