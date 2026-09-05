import { motionTiming } from '@theme/motion';

import { staggerDelayMs } from '../staggerDelay';

describe('staggerDelayMs', () => {
  it('scales with index', () => {
    expect(staggerDelayMs(0)).toBe(0);
    expect(staggerDelayMs(2)).toBe(2 * motionTiming.staggerStepMs);
  });

  it('caps so long lists do not crawl', () => {
    const cap = motionTiming.staggerMaxSteps * motionTiming.staggerStepMs;
    expect(staggerDelayMs(500)).toBe(cap);
  });

  it('treats negative indices as zero', () => {
    expect(staggerDelayMs(-3)).toBe(0);
  });
});
