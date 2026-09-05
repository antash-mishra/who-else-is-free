import { Springs } from '../springs';
import { Motion, motionGeometry, motionTiming } from '../motion';

describe('motion tokens', () => {
  it('caps stagger so long lists do not crawl', () => {
    expect(motionTiming.staggerMaxSteps * motionTiming.staggerStepMs).toBeLessThanOrEqual(300);
  });

  it('keeps tilt subtle', () => {
    expect(motionGeometry.tiltMaxDeg).toBeLessThanOrEqual(3);
  });

  it('exposes a settle spring distinct from the frozen presets', () => {
    expect(Motion.settle).toEqual(
      expect.objectContaining({
        mass: expect.any(Number),
        stiffness: expect.any(Number),
        damping: expect.any(Number),
      }),
    );
    expect(Motion.settle).not.toEqual(Springs.snappy);
  });
});
