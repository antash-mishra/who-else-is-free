import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import Svg, { Circle, Path } from 'react-native-svg';

import { AppButton } from '@components/ui';
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
        <Svg
          width={38}
          height={38}
          viewBox="0 0 38 38"
          accessible
          accessibilityRole="image"
          accessibilityLabel="Unable to load plans"
        >
          <Circle cx="19" cy="19" r="16" stroke={colors.error} strokeWidth="3" fill="none" />
          <Path d="M19 10.5v10" stroke={colors.error} strokeWidth="3" strokeLinecap="round" />
          <Circle cx="19" cy="27" r="1.7" fill={colors.error} />
        </Svg>
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
