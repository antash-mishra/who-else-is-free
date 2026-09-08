// Scrapbook motion tokens. These sit alongside `Springs` (src/theme/springs.ts),
// which stays frozen because src/navigation/transitions.ts is tuned against it.
//
// The feel: items are photographs being placed onto a page. They arrive slightly
// tilted and a little low, then settle with one small overshoot.

import { spacing } from './spacing';

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

const sharedDurationMs = 500;
const sharedLandTimeoutMs = 700;

/** Image-only flight synchronized with a clipped expanding page surface. */
export const eventSharedMotion = {
  /** Opening duration for the cover and expanding page. */
  durationMs: sharedDurationMs,
  closeDurationMs: 400,
  backdropBlur: 4,
  /** Avoid activating an expensive Android source filter during takeoff. */
  openingBackdropBlur: 0,
  surfaceRadius: 24,
  /** Reduced-motion page fade, abandoned-flight page fade, and the close fade. */
  fadeMs: 240,
  /** Reveal the page without a flight if the destination never reports its frames. */
  landTimeoutMs: sharedLandTimeoutMs,
  /** After the cover lands, wait at most this long for its bitmap to paint before taking off. */
  imageGraceMs: 150,
  /** Release a started flight that never completes. */
  timeoutMs: 1800,
  /** Give up on a source measurement (recycled row) after this. */
  measureTimeoutMs: 120,
  /** A press-in measurement is reused by the press for this long. */
  primedFrameTtlMs: 1500,
  cardRadius: 10,
  heroRadius: 20,
  /** Hero cover width as a fraction of the hero content width (window minus padding). */
  heroCoverWidthFraction: 0.6,
  /** The page is fully opaque at this flight progress. */
  pageRevealEnd: 0.55,
  /**
   * Bound the first frame steps of both timings. Motion starts right after an
   * idle page; the display's switch back to its fast refresh rate can cost
   * ~30 ms between the first two frames and a few 16 ms frames after that,
   * which must not become jumps. At 120 Hz the bound never engages.
   */
  steadyFrames: 6,
  steadyMaxStepMs: 12,
} as const;

/**
 * Size of the Event Details hero cover for a window width; the flying cover is
 * laid out at this size so it lands at scale 1 with no resampling. Assumes the
 * Details page spans the full window width (it has no horizontal safe-area
 * inset); revisit if that changes.
 */
export const heroCoverSize = (windowWidth: number): number =>
  Math.round(eventSharedMotion.heroCoverWidthFraction * (windowWidth - 2 * spacing.md));
