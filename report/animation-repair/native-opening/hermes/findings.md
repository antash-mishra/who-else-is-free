Hermes sampling attribution — three successful event open/return pairs

Files: opening.raw.cpuprofile retained unchanged; opening.symbolicated.cpuprofile
rewritten with metro-symbolicate using the co-built final composed source map.
The map, embedded APK bytecode, APK, and hashes live together in this directory.

Clock verification:
WEIFProfiler start uptime53895337ms / elapsed53895337037403ns;
first sample ts53895344624us => uptime53895344.624ms,7.624ms after start.
Last sample53925357.048ms precedes dump uptime53925385ms by27.952ms.
Thus sample timestamp microseconds /1000 with zero millisecond offset matches
Android monotonic uptime and the input/UI markers. This capture's sample thread
19749 is the JS runtime; no UI-worklet runtime attribution is established.

Latency in this profiled capture: first432.4ms; repeats255.5ms and280.3ms.
These are separate observations from native Perfetto's slower capture; do not
combine profiles across runs as if they were simultaneous or substitute them
for an alternating before/after latency benchmark.

Release→first-motion attribution (74 total samples):
- 27 are root-only: no JS frame is attributed. This is not proof of CPU idle.
- 40 contain renderRootSync/workLoopSync;39 contain performSyncWorkOnRoot.
- Largest specific leaf is native HostFunction completeRoot,12samples.
  This is Fabric host work on the JS runtime thread, not necessarily JS bytecode.
- Native date locale conversion appears as leaf3times. All3 stacks include
  EventDetailsScreenContent -> formatEventDetailDateLabel.
- Other leaf samples are spread across fiber allocation/reconciliation, prop
  handling, native createNode, Reanimated setup/serialization, and GC.
- App component appearances are sparse: EventDetailsScreenContent4 stacks,
  ScalePressable2, SlidingTabs1, HostRequestTabs effect1, shared page1.
  These are inclusive counts and overlap; do not sum them into percentages.

Before destination measurement (30samples):28 contain synchronous root work,
26 contain renderRootSync. Native completeRoot5; locale formatting3;
createNode2, fiber/property work and Reanimated setup form the rest.

Readiness→animation-request (46.8/19.5/36.7ms; only7 samples):
ALL7 contain synchronous root work. Six include renderRootSync, one is commit.
Leaves: AnimatedComponent.render, young-generation GC, appendChild,
areHookInputsEqual under ScalePressable/useSharedValue, updateWorkInProgressHook,
completeRoot, commitBeforeMutationEffects; each appears once.
This confirms a real synchronous render/commit barrier after takeoff readiness.
It does NOT identify one offending component or quantify each leaf's milliseconds.

Interpretation:
React/Fabric work is a confirmed category of startup cost. Earlier direct-start
experiments' failure to improve total latency still matters: removing this one
barrier did not reliably reduce the entire pipeline. Current evidence supports
reducing measured unnecessary render/commit breadth only with targeted validation,
not replacing animation sequencing speculatively. Locale-formatting memoization
is a small candidate supported by recurring stacks, not a demonstrated large fix.
More samples or React component profiling are needed to rank individual components.
The UI animation's smoothness cannot be assessed from this JS-only sample profile.

attribution.json contains per-window self/inclusive counts. stacks-*.json contains
full reconstructed sampled chains and aggregated counts. Counts are samples,
never measured CPU milliseconds; inclusive rows overlap.
