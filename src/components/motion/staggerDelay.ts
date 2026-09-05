import { motionTiming } from '@theme/motion';

/**
 * Entry delay for the item at `index` in a staggered group, capped at
 * `motionTiming.staggerMaxSteps` so long lists finish arriving quickly.
 */
export const staggerDelayMs = (index: number): number => {
  const clamped = Math.min(Math.max(index, 0), motionTiming.staggerMaxSteps);
  return clamped * motionTiming.staggerStepMs;
};
