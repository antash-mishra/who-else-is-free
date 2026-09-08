# Opening radius 1 experiment — rejected

A retained the stable blur radius 4 for both directions. B used radius 1 during opening and radius 4 during return. Opening duration remained 500 ms; the return and release implementations were preserved. ABBA provided six repeated and three process-first openings per build. Process-first means the first Details opening after process restart, with existing caches.

The change did not improve the targeted initial hitch. Median per-trial worst gap in the first 200 ms of repeated opening increased **70.7 → 83.5 ms**, and median maximum early progress jump increased **28.2% → 32.0%**. Process-first worst early gap decreased **78.6 → 70.8 ms**, but worst observations remained **146.2 → 148.6 ms**. This does not satisfy the proposed first-200-ms targets.

Repeated release-to-first-motion medians were **381.3 → 357.8 ms**, but candidate block medians differed substantially (**314.1 / 502.8 ms**), and its maximum reached **730.9 ms**. This is not convincing evidence of a startup improvement.

Return cadence did not show a clear improvement or systematic degradation: process-first median per-trial gap p95 was **34.5 → 31.9 ms**; repeated was **67.9 → 66.2 ms**. However, process-first median maximum gap increased **50.3 → 67.7 ms**, Back-to-first-motion increased **133.1 → 200.2 ms**, and endpoint-to-unmount increased **27.3 → 39.0 ms**. Repeated endpoint-to-unmount was effectively unchanged (**45.7 → 45.7 ms**). A completed nine of nine shared returns; B completed eight, with one fallback. Unchanged closing code therefore does not establish unchanged closing performance; these observations cannot independently assign causality to blur cache state.

**Decision: reject radius 1.** It changes the opening appearance without a reproducible early-hitch benefit. Preserve the accepted return/release behavior.

The measurements are buffered UI progress observations, not displayed-frame FPS. Cubic easing naturally makes early progress increments larger; the accompanying time gaps establish the hitch. Full summaries: [progress](opening-radius-abba-progress-summary.json), [first-200-ms analysis](opening-radius-segments.json).
