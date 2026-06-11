import * as Haptics from 'expo-haptics';

export type HapticFeedback =
  | 'none'
  | 'selection'
  | 'light'
  | 'medium'
  | 'submit'
  | 'success'
  | 'warning'
  | 'error'
  | 'destructive';

const safelyRun = (run: () => Promise<void> | void): void => {
  try {
    const result = run();
    if (result && typeof result.catch === 'function') {
      void result.catch(() => undefined);
    }
  } catch {
    // Haptics should never block the interaction that requested feedback.
  }
};

export const triggerHaptic = (feedback: HapticFeedback = 'none'): void => {
  switch (feedback) {
    case 'selection':
      safelyRun(() => Haptics.selectionAsync());
      break;
    case 'light':
      safelyRun(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      break;
    case 'medium':
    case 'submit':
      safelyRun(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      break;
    case 'success':
      safelyRun(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      break;
    case 'warning':
    case 'destructive':
      safelyRun(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
      break;
    case 'error':
      safelyRun(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      break;
    case 'none':
    default:
      break;
  }
};

export const selection = (): void => triggerHaptic('selection');
export const lightImpact = (): void => triggerHaptic('light');
export const mediumImpact = (): void => triggerHaptic('medium');
export const submit = (): void => triggerHaptic('submit');
export const success = (): void => triggerHaptic('success');
export const warning = (): void => triggerHaptic('warning');
export const error = (): void => triggerHaptic('error');
export const destructive = (): void => triggerHaptic('destructive');
