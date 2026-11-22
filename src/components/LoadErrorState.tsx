import { memo } from 'react';

import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppButton, AppText, ErrorCircleIcon } from '@components/ui';
import { colors, componentTokens, spacing, typography } from '@theme/index';

export interface LoadErrorStateProps {
  /** Short failure title, e.g. "Unable to load plans". */
  message: string;
  /** Names the failure for screen readers on the error mark. */
  iconAccessibilityLabel: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Full-page load failure: the red error mark, a title sized like the
 * `EmptyState` title, and a "Try again" button sized like empty-state actions.
 * Only the mark is red; the title stays in the text colour so a dropped
 * connection does not read as an alarm.
 */
const LoadErrorState = ({
  message,
  iconAccessibilityLabel,
  onRetry,
  retryLabel = 'Try again',
  style,
  testID,
}: LoadErrorStateProps) => (
  <View style={[styles.container, style]} testID={testID}>
    <ErrorCircleIcon accessibilityLabel={iconAccessibilityLabel} />
    <AppText variant="subtitle" style={styles.message}>
      {message}
    </AppText>
    {onRetry ? <AppButton label={retryLabel} onPress={onRetry} style={styles.button} /> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  // Matches the EmptyState title: 18px medium on a 24px line (a shorter line
  // clips Inter's descenders).
  message: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 24,
    letterSpacing: typography.letterSpacing,
    color: colors.text,
    textAlign: 'center',
  },
  button: {
    height: componentTokens.emptyStateButton.height,
    minHeight: componentTokens.emptyStateButton.height,
    borderRadius: componentTokens.emptyStateButton.radius,
  },
});

export default memo(LoadErrorState);
