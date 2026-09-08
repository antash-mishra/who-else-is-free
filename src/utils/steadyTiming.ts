import {
  defineAnimation,
  type AnimationCallback,
  type AnimationObject,
  type EasingFunction,
} from 'react-native-reanimated';

export interface SteadyTimingConfig {
  duration: number;
  easing: EasingFunction;
  /** Frame steps after the first evaluated frame whose duration is bounded. */
  steadyFrames: number;
  /** Largest time step applied within those frames, in milliseconds. */
  maxStepMs: number;
}

interface SteadyTimingAnimation extends AnimationObject<number> {
  current: number;
  startValue: number;
  elapsed: number;
  lastTimestamp: number;
  frames: number;
}

/**
 * `withTiming` whose first few frame steps are bounded.
 *
 * Reanimated stamps a timing with the wall clock. When motion starts right
 * after the page has been idle, the display is still at its idle cadence and
 * the switch back to its fast refresh rate costs about 30 ms between the first
 * two frames; an ease-out curve turns that into a visible jump. Bounding the
 * first steps turns the gap into a few milliseconds of delay instead. Later
 * frames keep exact wall-clock timing, so mid-motion frame drops behave exactly
 * like `withTiming`.
 */
type WithSteadyTiming = (
  toValue: number,
  config: SteadyTimingConfig,
  callback?: AnimationCallback,
) => number;

export const withSteadyTiming = function (
  toValue: number,
  config: SteadyTimingConfig,
  callback?: AnimationCallback,
) {
  'worklet';
  return defineAnimation<SteadyTimingAnimation>(toValue, () => {
    'worklet';
    const { duration, easing, steadyFrames, maxStepMs } = config;
    const onFrame = (animation: SteadyTimingAnimation, now: number) => {
      let step = now - animation.lastTimestamp;
      if (step < 0) step = 0;
      if (animation.frames >= 1 && animation.frames <= steadyFrames && step > maxStepMs)
        step = maxStepMs;
      animation.frames += 1;
      animation.lastTimestamp = now;
      animation.elapsed += step;
      const t = duration > 0 ? Math.min(animation.elapsed / duration, 1) : 1;
      animation.current = animation.startValue + (toValue - animation.startValue) * easing(t);
      return t >= 1;
    };
    const onStart = (animation: SteadyTimingAnimation, value: number, now: number) => {
      animation.startValue = value;
      animation.current = value;
      animation.elapsed = 0;
      animation.lastTimestamp = now;
      animation.frames = 0;
    };
    return {
      onFrame,
      onStart,
      current: toValue,
      startValue: toValue,
      elapsed: 0,
      lastTimestamp: 0,
      frames: 0,
      callback,
    };
  });
  // Typed like `withTiming`: the animation stands in for its target value.
} as unknown as WithSteadyTiming;
