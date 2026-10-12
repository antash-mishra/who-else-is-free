import { getKeyboardTranslation, getTabBarContentClearance } from '../bottomObstruction';

describe('bottom obstruction layout helpers', () => {
  describe('getKeyboardTranslation', () => {
    it('uses the keyboard top in viewport coordinates', () => {
      expect(
        getKeyboardTranslation({
          viewportHeight: 800,
          keyboardTop: 500,
          keyboardHeight: 340,
          safeAreaBottom: 24,
        }),
      ).toBe(276);
    });

    it('removes a three-button navigation inset exactly once', () => {
      expect(
        getKeyboardTranslation({
          viewportHeight: 800,
          keyboardTop: 470,
          keyboardHeight: 330,
          safeAreaBottom: 48,
        }),
      ).toBe(282);
    });

    it('falls back to keyboard height when no usable top coordinate is available', () => {
      expect(
        getKeyboardTranslation({
          keyboardHeight: 336,
          safeAreaBottom: 34,
        }),
      ).toBe(302);
    });

    it('never returns a negative translation', () => {
      expect(
        getKeyboardTranslation({
          keyboardHeight: 30,
          safeAreaBottom: 48,
        }),
      ).toBe(0);
    });

    it('lifts a Modal sheet by the keyboard-controller height less the inset it pads (#190)', () => {
      // WEIF_API_36: keyboard-controller reported 332dp inside the sheet's Modal window,
      // where React Native's screenY-based lift was 284dp with a 48dp safe-area bottom.
      expect(getKeyboardTranslation({ keyboardHeight: 332, safeAreaBottom: 48 })).toBe(284);
    });

    it.each([
      [0, 300],
      [24, 276],
      [48, 252],
    ])('removes a %idp navigation inset exactly once from a 300dp keyboard', (inset, lift) => {
      expect(getKeyboardTranslation({ keyboardHeight: 300, safeAreaBottom: inset })).toBe(lift);
    });
  });

  describe('getTabBarContentClearance', () => {
    it('excludes the safe area already consumed by the screen shell', () => {
      expect(getTabBarContentClearance(98, 48)).toBe(50);
    });

    it('never returns a negative clearance', () => {
      expect(getTabBarContentClearance(34, 48)).toBe(0);
    });
  });
});
