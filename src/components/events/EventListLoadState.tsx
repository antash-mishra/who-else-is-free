import { ActivityIndicator, StyleSheet, View } from 'react-native';

import LoadErrorState from '@components/LoadErrorState';
import { colors, spacing } from '@theme/index';

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
      <LoadErrorState
        message={errorMessage ?? ''}
        iconAccessibilityLabel="Unable to load plans"
        onRetry={onRetry}
      />
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
});

export default EventListLoadState;
