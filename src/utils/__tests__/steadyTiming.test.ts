import { withSteadyTiming } from '../steadyTiming';

jest.mock('react-native-reanimated', () => ({
  defineAnimation: (_starting: unknown, factory: () => unknown) => factory(),
}));

type Animation = {
  onStart: (animation: Animation, value: number, now: number) => void;
  onFrame: (animation: Animation, now: number) => boolean;
  current: number;
};

const linear = (t: number) => t;
const start = (steadyFrames = 3, maxStepMs = 12) => {
  const animation = withSteadyTiming(
    0,
    { duration: 400, easing: linear, steadyFrames, maxStepMs },
    undefined,
  ) as unknown as Animation;
  animation.onStart(animation, 1, 1000);
  expect(animation.onFrame(animation, 1000)).toBe(false);
  expect(animation.current).toBe(1);
  return animation;
};

describe('withSteadyTiming', () => {
  it('bounds the first frame steps so an idle-cadence gap cannot jump ahead', () => {
    const animation = start();
    animation.onFrame(animation, 1030); // refresh-rate switch gap
    expect(animation.current).toBeCloseTo(1 - 12 / 400);
    animation.onFrame(animation, 1045); // 60 Hz cadence
    expect(animation.current).toBeCloseTo(1 - 24 / 400);
    animation.onFrame(animation, 1053.5); // 120 Hz cadence passes unbounded
    expect(animation.current).toBeCloseTo(1 - 32.5 / 400);
  });

  it('keeps exact wall-clock timing after the steady frames', () => {
    const animation = start();
    animation.onFrame(animation, 1008);
    animation.onFrame(animation, 1016);
    animation.onFrame(animation, 1024);
    animation.onFrame(animation, 1074); // a later 50 ms stall jumps like withTiming
    expect(animation.current).toBeCloseTo(1 - 74 / 400);
  });

  it('finishes at the target once the bounded elapsed time reaches the duration', () => {
    const animation = start(0, 12);
    expect(animation.onFrame(animation, 1200)).toBe(false);
    expect(animation.current).toBeCloseTo(0.5);
    expect(animation.onFrame(animation, 1500)).toBe(true);
    expect(animation.current).toBe(0);
  });

  it('never runs backwards when a timestamp precedes the previous one', () => {
    const animation = start();
    animation.onFrame(animation, 1008);
    animation.onFrame(animation, 1004);
    expect(animation.current).toBeCloseTo(1 - 8 / 400);
  });
});
