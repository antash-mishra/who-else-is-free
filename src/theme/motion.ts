// Scrapbook motion tokens. These sit alongside `Springs` (src/theme/springs.ts),
// which stays frozen because src/navigation/transitions.ts is tuned against it.
//
// The feel: items are photographs being placed onto a page. They arrive slightly
// tilted and a little low, then settle with one small overshoot.

/** Spring for an item settling onto the page. One gentle overshoot, then rest. */
export const Motion = {
  settle: { mass: 0.6, stiffness: 180, damping: 16 },
} as const;

export const motionTiming = {
  /** Delay added per item in a staggered group. */
  staggerStepMs: 45,
  /** Hard cap on stagger steps. A 200-row list must not take 9 seconds. */
  staggerMaxSteps: 6,
  /** Opacity-only fade used as the reduced-motion fallback. */
  entryFadeMs: 160,
  /** Confetti waits this long after mounting, so it does not share its first frames with the toast. */
  confettiStartDelayMs: 120,
  /** How long each confetti cannon keeps firing, so the celebration is not one instant puff. */
  confettiSprayMs: 500,
} as const;

export const motionGeometry = {
  /** Maximum resting/entry rotation for a placed item, in degrees. */
  tiltMaxDeg: 1.5,
  /** How far below its resting position an entering item starts. */
  entryTranslateY: 14,
  /** Scale an entering item starts at. */
  entryScaleFrom: 0.97,
} as const;

/**
 * One open sheet handing over to another (menu -> confirmation). The old content
 * fades out while the new fades in, and the sheet's content height glides
 * between them instead of jumping.
 */
export const sheetMorph = {
  /** Height glide from the old content to the new. */
  heightMs: 180,
  fadeOutMs: 90,
  /** The new content starts fading in as the old is mostly gone. */
  fadeInDelayMs: 60,
  fadeInMs: 130,
  /**
   * Safety net: the morph normally ends when the height glide finishes. This only
   * ends it if that never happens, so it sits well past a glide that starts late.
   */
  totalMs: 600,
} as const;
