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
