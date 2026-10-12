import { androidBlurReductionFactor } from '../materials';

describe('androidBlurReductionFactor', () => {
  it.each([
    [1.75, 1.4469], // WEIF_API_36 (density override 280)
    [2.75, 0.8895], // Galaxy A56 class
    [3, 0.8114], // 480dpi phones
  ])('keeps a 19.5dp blur at pixel ratio %s', (pixelRatio, factor) => {
    expect(
      androidBlurReductionFactor({ intensity: 13, blurSigmaDp: 19.5 }, pixelRatio),
    ).toBeCloseTo(factor, 3);
  });

  it('never asks Dimezis for a radius below 1', () => {
    expect(androidBlurReductionFactor({ intensity: 13, blurSigmaDp: 0.5 }, 1)).toBe(13);
  });
});
