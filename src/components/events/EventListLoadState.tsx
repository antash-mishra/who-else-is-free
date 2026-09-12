import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton, ErrorCircleIcon } from '@components/ui';
import { colors, spacing, typography } from '@theme/index';

export type EventListLoadStateStatus = 'loading' | 'error';

export interface EventListLoadStateProps {
  status: EventListLoadStateStatus;
  errorMessage?: string | null;
  onRetry?: () => void;
  topPadding?: number;
}

const EventListLoadState = ({
  status,
  errorMessage,
  onRetry,
  topPadding = 0,
}: EventListLoadStateProps) => (
  <View
    style={[styles.container, { paddingTop: topPadding }]}
    testID={`event-list-${status}-state`}
  >
    {status === 'loading' ? (
      <ActivityIndicator
        testID="event-list-loading-indicator"
        size="large"
        color={colors.primary}
      />
    ) : (
      <>
        <ErrorCircleIcon accessibilityLabel="Unable to load plans" />
        <Text style={styles.errorText}>{errorMessage}</Text>
        {onRetry ? (
          <AppButton label="Try again" onPress={onRetry} style={styles.retryButton} />
        ) : null}
      </>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 172,
  },
});

export default EventListLoadState;
