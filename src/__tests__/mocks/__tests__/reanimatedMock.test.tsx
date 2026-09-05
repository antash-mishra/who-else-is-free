import * as Reanimated from 'react-native-reanimated';

describe('reanimated jest mock', () => {
  it('exposes useReducedMotion defaulting to false', () => {
    expect(Reanimated.useReducedMotion()).toBe(false);
  });

  it('interpolates linearly between ranges', () => {
    expect(Reanimated.interpolate(0.5, [0, 1], [0, 100])).toBe(50);
    expect(Reanimated.interpolate(2, [0, 1], [0, 100], 'clamp')).toBe(100);
  });

  it('exposes chainable entering builders', () => {
    const builder = Reanimated.FadeInDown.delay(100).springify();
    expect(typeof builder.duration).toBe('function');
  });

  it('exposes chainable exiting and layout builders', () => {
    expect(typeof Reanimated.FadeOutUp.duration(180).delay).toBe('function');
    expect(typeof Reanimated.LinearTransition.duration(220).delay).toBe('function');
  });
});
