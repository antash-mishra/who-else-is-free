export interface KeyboardTranslationMetrics {
  viewportHeight?: number;
  keyboardTop?: number;
  keyboardHeight: number;
  safeAreaBottom: number;
}

/**
 * Returns how far a control that already reserves `safeAreaBottom` should move
 * when the keyboard opens. Android keyboard heights can include the system
 * navigation region, so keeping the resting safe-area padding and translating
 * by the full height counts that region twice.
 *
 * Prefer a keyboard-top coordinate when it is in the same viewport coordinate
 * space. Callers that only receive a height still get the same safe-area
 * normalization.
 */
export const getKeyboardTranslation = ({
  viewportHeight,
  keyboardTop,
  keyboardHeight,
  safeAreaBottom,
}: KeyboardTranslationMetrics): number => {
  const hasUsableKeyboardTop =
    Number.isFinite(viewportHeight) &&
    Number.isFinite(keyboardTop) &&
    (viewportHeight ?? 0) > 0 &&
    (keyboardTop ?? -1) >= 0 &&
    (keyboardTop ?? 0) <= (viewportHeight ?? 0);

  const obstruction = hasUsableKeyboardTop
    ? (viewportHeight ?? 0) - (keyboardTop ?? 0)
    : Math.max(0, keyboardHeight);

  return Math.max(0, obstruction - Math.max(0, safeAreaBottom));
};

/**
 * A tab screen whose safe-area shell already consumes `safeAreaBottom` only
 * needs padding for the remaining visible part of an absolute bottom tab bar.
 */
export const getTabBarContentClearance = (tabBarHeight: number, safeAreaBottom: number): number =>
  Math.max(0, tabBarHeight - Math.max(0, safeAreaBottom));
