Final retained candidate — native trace verification

Final PID23055, three complete shared open/return pairs. Baseline PID16838,
six completed pairs of seven attempted (one watchdog failure). Trace capture
configuration is the same apart from duration35s vs45s; metrics use exact
transition windows, not full-trace totals. Clock snapshots show final trace
BOOTTIME−MONOTONIC −41/−42ns, applied median−41.5ns. Baseline was−83/−84ns.

Motion-window descriptive comparison (baseline median -> final median):
- Open RenderThread Running:403.6 ->271.5ms (-32.7%).
- Close RenderThread Running:342.5 ->261.1ms (-23.8%).
- Open per-trial median display-end gap:76.8 ->28.3ms.
- Close per-trial median display-end gap:69.0 ->22.2ms.
- Open app deadline-missed records:48/53 ->23/45.
- Close app deadline-missed records:42/54 ->9/50.
- Opening motion duration:515.6 ->505.1ms; closing417.1 ->404.6ms.
  These are observed endpoint spans; configured motion durations are unchanged.
- Main CPU during motion is broadly similar: open54.5 ->56.2ms,
  close45.1 ->46.8ms. Main runnable waits increased in this final capture.
- Main postAndWait wall time: open424.3 ->431.9ms; close326.5 ->299.7ms.
  Lower RenderThread CPU did not eliminate drawing/scheduling waits.

Native count interpretation:
- Native ShadowTree::commit scopes are absent in both captures; commit counts
  are unavailable, never reported as zero.
- Fabric mount-batch median during opening rises8 ->13 and closing8 ->15.
  RenderThread DrawFrame count also rises9 ->13 and9 ->16. More intermediate
  frames require more native updates; this is not evidence of extra React renders.
- Mount-batch wall time falls17.4 ->12.2ms opening,11.9 ->10.9ms closing.
- JS motion-window CPU is very low in final (median0.45ms opening,0.16ms closing).
  Baseline opening had111.95ms JS CPU. This observation may include unrelated
  rendering/network event timing differences and cannot solely be attributed
  to the retained blur change from one unpaired capture.

Opening startup remains unproven:
- Release ->first sampled UI motion baseline387.3ms ->final491.8ms median.
- Final individual startup values827.1,491.8,219.5ms; strong run variability.
- Startup mount-batch count unchanged at median10, but elapsed batch time and
  JS/Main CPU were higher in final. A faster readiness->request subsegment
  (74.6 ->40.8ms) did not establish a total startup gain.
- Close startup median107.1 ->115.3ms, with first final close302.3ms.

Limits:
These are two small, unequal, unpaired trace captures. Treat native findings as
supporting mechanism/verification, not paired causal or statistical performance
proof. Use the separate alternating benchmark as the primary improvement claim.
Display-end cadence joins app-surface FrameTimeline to compositor records;
it is not physical-screen FPS. Frame cohorts and cadence have different time
boundaries. Per-thread and per-stage medians do not add to a total median.
