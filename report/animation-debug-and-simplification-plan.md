# Animation debugging, repair and emulator measurement plan

Date: 2026-09-07. Original plan; implementation is underway. Current evidence and outstanding validation are tracked in [animation-repair/status.md](animation-repair/status.md).

Scope correction: preserve shared-element transitions, splash and existing animation designs. Fix the reported defects and optimize measured bottlenecks. Do not remove animations or migrate navigation libraries as the default solution. Only emulator/simulator testing is available during implementation; the user will validate the resulting build on their phone.

## Evidence and limits

Inspected checkout: `who-else-is-free`, HEAD `1190404` (includes shared-transition revision `505a3c4`). The build/OTA revision in the user recording is unknown; verify it before attributing the recording to this exact implementation.

Video: `/Users/antash/Downloads/WhatsApp Video 2026-09-07 at 01.41.07.mp4`. It is 9.082 seconds, 576 × 1280, 216 video frames, averaging 23.78 fps. It shows two My Plans → Details opens and returns. It does not show Create Event, a toast, or the background/resume interval.

Frame-by-frame evidence using original presentation timestamps:

| Open | First recorded frame with overlay gone and list exposed | First recorded Details frame | Recorded handoff gap |
| --- | --- | --- | --- |
| First cover | 2.5079 s | 2.9199 s | 412 ms |
| Second cover | 5.6489 s | 6.1039 s | 455 ms |

The cover/title enlarge over the list, disappear, and the list remains exposed before Details appears. These are visible handoff gaps, not measurements of a blocked thread. Boundaries have roughly one recorded-frame uncertainty (~41 ms). The compressed, low-frame-rate recording cannot establish device FPS, dropped-frame percentage, exact tap latency, or JS/UI thread stalls.

## Findings

Additional user feedback: animations are only moderately smooth immediately after launch, then become buggy or stop occurring after the app has remained open for approximately 40 seconds or longer. Treat this as a foreground-session degradation report, separately from background/resume. It raises the priority of a shared runtime/lifecycle investigation; it does not yet prove a timer, leak or JS stall.

1. **Create success uses the wrong navigation operation.** `CreateEventScreen.tsx` calls `navigate('Main', ...)`, whereas edit success uses `StackActions.popTo(...)`. The installed React Navigation router pushes a new Main when Main is below CreateEvent and no pop option/getId applies. Main uses `forNoAnimation`, so CreateEvent's closing downward interpolation is not executed. This also retains the submitted form below a second Main route, adding unnecessary mounted navigation content. Verify with a router-state regression test and repeated creation.
2. **Successful creation waits on an unnecessary second request.** `EventsContext.addUserEvent` awaits POST, inserts the returned event into local state, then awaits `refreshEvents()` before returning. The screen waits for all of that before dismissing. Network/list-refresh delay is separate from animation frame performance; the added latency equals the awaited refresh path, not a known fixed number.
3. **Shared transition has multiple independently scheduled handoffs.** Source measurements, target measurements, image readiness, React state/effects, UI-thread animation and `runOnJS` completion all coordinate with a separate stack transition. Current tokens configure a 420 ms flight, 1,200 ms stack hold, 120 ms measurement fallback, 700 ms landing deadline, 50 ms title grace, 150 ms image grace and 1,800 ms completion watchdog. Some waits overlap; do not add them as a measured total. The stack hold can defer InteractionManager work even after visible motion ends.
4. **Resume safety is incomplete.** The provider has no AppState reset; callbacks for cover readiness/completion are not all tied to a flight generation. Chat reconnects and refreshes conversations on resume. Suspended timers, late callbacks and concurrent rendering are plausible contributors, but no runtime trace yet proves which causes the reported after-idle failure. The primed-frame TTL alone does not prove stale coordinates persist across long idle periods.
5. **Toast travel is already down on entry.** `EventActionBadge` starts at translateY -80, springs to 0, then exits upward to -80. Do not blindly reverse the sign. It begins its animation in the same effect that requests mounting, which could hide some entry frames under JS load. MyEvents also waits on InteractionManager to show it. Reproduce the report to distinguish missed entry from the intended upward exit. The opacity and movement have separate hold clocks.

## Recommended implementation order

### 1. Establish a reproducible emulator baseline

**First reproduction priority: foreground degradation around 40 seconds.**

- Keep the app continuously foregrounded and probe the same tab, card-to-Details, back and sheet interactions at session ages 5, 20, 35, 40, 45, 60 and 120 seconds, then 5 minutes. Record time from both process launch and first interactive screen. Repeat at least three fresh launches; retain exact onset times and scenario counts.
- Compare two paths: idle on the same screen before probing, and continuously repeat a fixed interaction sequence. Also compare previously visited versus newly opened content. This distinguishes elapsed-time triggers from interaction-count accumulation and intentional one-time entry suppression.
- Capture a trace spanning before and after the suspected threshold. Measure each interaction window, not an average of the entire idle session. Track whether an animation was requested, started, progressed and completed; distinguish animation not triggered, delayed start, stalled progress and failed visual handoff.
- Audit scheduled work and lifecycle events around onset: timers/intervals, polling, auth refresh, WebSocket reconnect/retry, deferred InteractionManager work, provider updates, persistent animation/gesture handles, pending callbacks and growing subscriptions. Check memory and render/commit activity for growth. Correlation must be followed by a controlled isolation experiment before naming a cause.
- Inspect session-wide animation flags, focus/gesture state and the one-shot Placed ID cache. Some list entrances intentionally play once; that must not be confused with navigation or tab transitions failing. Avoid clearing all animation caches as a speculative fix.
- Use the same session-age matrix after repairs. A fresh-launch-only pass is insufficient. Require shared transitions, tabs, sheets and CreateEvent close to remain functional at 40+ seconds, 120 seconds and 5 minutes, as well as after background/resume.

- Use a local Android emulator with a release or production-equivalent profiling build, not Expo dev mode. Record commit/build/OTA revision, emulator image/API, resolution, configured CPU/RAM, graphics backend, actual refresh rate, host hardware and load. Keep animation scale at 1x. Use a local test backend and seeded accounts/events; do not create benchmark events in production.
- Fix emulator configuration, data volume, network conditions and host load across baseline/fixed runs. Warm up separately; classify cold/warm image-cache runs. Run three batches of 20 repetitions for core warm-open, return, create-close and tab/sheet scenarios. Report batch spread as well as aggregate results. Use fewer explicitly counted long-idle runs (three each at 30 seconds, 5 minutes and 30 minutes); do not imply those small samples establish reliable p95 latency.
- Trace press → navigation dispatch → destination layout/first paint → transition end. For submit trace press → POST response → local insertion → refresh completion → close start/end → toast first paint.
- Capture Android Perfetto FrameTimeline and UI/JS scheduling, with gfxinfo as a secondary summary where supported. Check tool availability first; document any unsupported counters rather than substituting invented frame statistics. Match app markers to trace clocks. JS requestAnimationFrame samples alone do not measure native animation smoothness. React profiling is supplemental, not a substitute for frame measurements.
- Measure only marked interaction windows; do not dilute jank percentages with idle frames. Keep benchmark tracing lightweight and identical before/after. Capture separate visual recordings because recording itself can change performance.
- Test cold open, warm repeated open, background-resume, lock/unlock, interrupted flight, rapid back/reopen, tab revisits, cached/uncached images and slow/offline requests. Inspect navigation state and memory/render growth after 100 repeated open/close cycles; count remaining routes, active flights, listeners and timers where instrumentation permits.
- Inventory every animation surface and assign a scenario: splash, shared cover/title, ordinary push/pop, Create/Edit Event, all shared sheet variants, success badges/notification banners, tabs/pagers, list entry/scrolling, hero parallax, press feedback and keyboard/composer motion. Cover authenticated and guest paths, reduced motion, cancellation, content resizing and rapid repeated input. Include iOS simulator functional coverage if available; do not treat simulator results as physical iPhone performance.
- Use temporary diagnostic switches only if needed to isolate a bottleneck; the delivered build must retain existing animation features. Separate emulator/host contention from repeatable app stalls. Emulator numbers are comparative measurements for this configuration, not a prediction of the user's phone FPS.

### 2. Fix Create Event and success feedback first

After baseline capture, prioritize a confirmed app-wide foreground degradation cause before isolated timing polish. The CreateEvent navigation bug remains an independent fix; do not assume it explains an idle 40-second threshold.

- On successful POST/local insertion, pop to the existing Main route with MyEvents selected. Preserve downward dismissal; do not reset or push a replacement Main. Ensure the guest/sign-in continuation follows the same success contract.
- Make list reconciliation asynchronous after confirmed success, with rejection handling and protection against stale refresh data overwriting the inserted event. Keep the form and entered values on POST failure; prevent duplicate submissions.
- Queue the success notice once; display it after the actual CreateEvent closing transition completes and MyEvents is focused. Consume its route/event token so back navigation or resume cannot replay it.
- Reproduce toast entry before changing it: distinguish entry missed during mounting from its intended upward exit. Ensure the animated view is mounted before starting entry, then synchronize opacity/travel/hold around actual completion while preserving the current visual design. Enter downward from above; keep upward dismissal. Respect safe area and reduced motion.
- Test repeated create, close/cancel, edit, guest sign-in continuation, slow POST, failed POST, failed post-success refresh, keyboard open and Android system back. Assert one Main route and no submitted form remaining in history.

### 3. Repair shared cover/title handoff and resume behavior

- Instrument one flight ID through source measurement, route dispatch, destination measurement, image readiness, flight start/end, page reveal, overlay removal and stack transition end. First determine whether the video gap reproduces on this checkout and whether the page is hidden, detached, waiting on React, or overwritten by another transition.
- Make source hiding, cover/title motion, page reveal and destination takeover follow one explicit lifecycle. Retain the overlay until the destination is ready to take over visibly; avoid both a duplicate and a blank frame. Layout/onLoad callbacks alone are not proof of presentation, so validate takeover against frame captures/traces. Keep existing transform-only image animation.
- Tie asynchronous measurements, image callbacks, timers and completion callbacks to the current flight generation. Ignore late callbacks from cancelled/previous flights. Cancel work and restore visible content on backgrounding, navigation interruption and unmount; invalidate cached geometry on viewport/layout changes. Reopen after resume with fresh measurements.
- Investigate the 1,200 ms stack hold against actual landing/flight completion. Replace unnecessary fixed waiting with lifecycle coordination only after identifying why the origin must stay attached. Keep bounded error timeouts that reveal usable content if an image or destination cannot load; do not accelerate the spring to conceal waiting.
- Test long/wrapped titles, uncached/broken images, recycled/scrolled rows, missing event data, deep-linked Details, rapid back/reopen, interrupted and resumed flights. Verify no frozen overlay, stale callback cancelling a new flight, invisible content or disabled touches after completion.

### 4. Optimize the other animations without removing them

- Rank measured failures by missed frames and input latency. Fix one shared primitive at a time and rerun its scenarios so improvements can be attributed to a change.
- Inspect JS work at transition start, broad context rerenders, list mounts, layout measurement loops, image decoding, blur/shadow composition, competing keyboard/sheet animations and worklets/listeners that remain active unnecessarily. These are investigation categories, not established causes.
- Where traces justify it, stabilize subscriptions/props, reduce unrelated rerenders, defer nonessential work until after transition, reuse decoded images, use transforms/opacity instead of animated layout and synchronize animation ownership. Preserve necessary network/state updates and gestures.
- Preserve timing/design initially. Only tune duration, easing or spring settling when measurements show excessive settling or the motion itself feels delayed. Report intentional motion duration separately from stalls.
- Keep the splash wordmark/bloom and its completion/permission-prompt contract. Include it in regression testing; avoid changing its appearance while fixing navigation.

### 5. Acceptance criteria, regression tests and phone handoff

Targets, not achieved results:

- Zero list flash, duplicate cover/title or blank handoff in repeated opens and resumed sessions.
- No lost animation starts, stuck gestures or uncompleted transitions as foreground session age passes 40 seconds. Report the same before/after metrics by session age, with per-run spread; explicitly flag reproducible worsening beyond baseline variability rather than hiding it in aggregate FPS.
- One upward open and one downward close for CreateEvent; exactly one downward-entering success notice after close, with correct history after repeated creation.
- Warm press-to-first-visible-response starts within 100 ms at p95. Preserve the 420 ms shared flight initially; a continuous 420 ms flight is not the same as an additional 420 ms blank handoff. Report press-to-flight-start, motion duration, handoff gap and time-to-interactive separately.
- At an actual 60 Hz emulator refresh rate: aim for >=99% on-time animation frames and no >50 ms app-attributable animation stalls under the controlled workload. The frame budget is 16.7 ms; use actual presentation deadlines rather than equating every render-duration sample with a missed deadline. Evaluate other refresh rates against their actual budget. Report missed-deadline rate and p50/p95/p99 frame duration, not only average FPS. If emulator/host limits prevent the target, report measured limits and trace evidence instead of claiming a pass.
- Submit-to-close excludes neither network time nor refresh time silently: report POST latency and post-success UI latency separately. Target close initiation within 100 ms at p95 after success/local insertion, without waiting for reconciliation.
- Splash appearance and permission sequencing preserved; reduced-motion, keyboard, back, deep-link and sheet flows pass on Android/iOS.
- Add meaningful regression tests for stack history, submit/refresh sequencing, toast once-only delivery, flight cancellation, stale callback rejection, destination timeout and reduced motion. Run affected tests first, then the full frontend test suite, typecheck and lint because shared primitives affect many screens. Log emulator verdicts in TEST_RUNS.md. Frame traces and recordings determine animation acceptance; Jest cannot prove smoothness.

Deliver a before/after table per scenario/emulator configuration with tap latency, handoff gap, POST/refresh timings, animation duration, frame percentiles, missed deadlines and repetition count. Include raw trace locations, benchmark instructions and clips. State percentage changes only from measured matching runs; show jank reduction in percentage points as well as relative percent. Do not compare the WhatsApp clip's recording FPS to emulator app FPS.

Provide a testable build and a short phone checklist for the user: cold open, remain foregrounded for 40/60/120 seconds and retry tabs/cards/sheets, repeated card taps/back, resume after 5 and 30 minutes, create/edit with keyboard open, toast entry/exit, sheets and tab revisits. Emulator acceptance and the user's phone validation are separate statuses. Ask for the phone model/OS and observations at handoff, not as a blocker to emulator work. Any remaining phone-only defect gets its own reproduction/trace investigation rather than being declared fixed from emulator results.

## Primary references

- React Native performance and release profiling: https://reactnative.dev/docs/performance.html
- Explicit stack pop operations: https://reactnavigation.org/docs/stack-actions/
