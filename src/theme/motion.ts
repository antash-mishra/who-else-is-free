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
} as const;

export const motionGeometry = {
  /** Maximum resting/entry rotation for a placed item, in degrees. */
  tiltMaxDeg: 1.5,
  /** How far below its resting position an entering item starts. */
  entryTranslateY: 14,
  /** Scale an entering item starts at. */
  entryScaleFrom: 0.97,
} as const;

/** Shared card-to-detail cover flight and its navigation fade. */
export const eventCoverMotion = {
  durationMs: 420,
  fadeMs: 240,
  timeoutMs: 1800,
  measureTimeoutMs: 120,
  cardRadius: 10,
  heroRadius: 20,
} as const;
