import { useCallback, useMemo } from 'react';

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PastEventItem } from '@api/pastEvents';
import EmptyState from '@components/EmptyState';
import { EventSectionList, buildEventItemSections } from '@components/events';
import FullPageEmptyState from '@components/FullPageEmptyState';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { AppButton } from '@components/ui';
import { usePastEvents } from '@hooks/usePastEvents';
import { RootStackParamList } from '@navigation/types';
import { colors, componentTokens, spacing, typography } from '@theme/index';
import { parseDateKey } from '@utils/dateTime';
import { formatEventListSectionHeaderLabel } from '@utils/eventDisplay';

const getPastSectionDateLabel = (eventDate: string): string => {
  const parsed = parseDateKey(eventDate);
  if (!parsed) return eventDate;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffMs = today.getTime() - eventDay.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatEventListSectionHeaderLabel(eventDate);
};

const PastEventsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const {
    events,
    loading: isLoading,
    refreshing: isPullRefreshing,
    error,
    loadingMore,
    loadMoreError,
    refresh: handleRefresh,
    loadMore,
    retryLoadMore,
  } = usePastEvents(isFocused);

  const sections = useMemo(
    () =>
      buildEventItemSections(events, {
        sortDirection: 'desc',
        titleForDate: getPastSectionDateLabel,
      }),
    [events],
  );

  const handleEventPress = useCallback(
    (item: PastEventItem) => {
      navigation.navigate('EventDetails', {
        eventId: item.id,
        readOnly: true,
      });
    },
    [navigation],
  );

  const showLoading = isLoading && events.length === 0;
  const showError = !!error && !isLoading && events.length === 0;
  const showEmpty = !isLoading && events.length === 0 && !error;

  return (
    <View style={styles.screenRoot}>
      <ScreenContainer edges={['top']}>
        <ScreenHeader title="Past plans" onBack={navigation.goBack} />
        {showLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : showError ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={handleRefresh}>
              <Text style={styles.retryButtonText}>Please try again</Text>
            </Pressable>
          </View>
        ) : (
          <EventSectionList
            sections={sections}
            onEventPress={handleEventPress}
            contentHorizontalPadding={false}
            headerPaddingTop={showEmpty ? 0 : componentTokens.eventList.topPadding}
            bottomPadding={safeBottom}
            footerSpacingHeight={0}
            refreshing={isPullRefreshing}
            onRefresh={handleRefresh}
            onEndReached={loadMore}
            entryAnimation="initial"
            footer={
              loadingMore ? (
                <View style={styles.paginationFooter}>
                  <ActivityIndicator testID="past-events-loading-more" color={colors.primary} />
                </View>
              ) : loadMoreError || (error && events.length > 0) ? (
                <View style={styles.paginationFooter}>
                  <Text style={styles.errorText}>{loadMoreError ?? error}</Text>
                  <AppButton
                    label="Try again"
                    variant="ghost"
                    onPress={loadMoreError ? retryLoadMore : handleRefresh}
                  />
                </View>
              ) : undefined
            }
          />
        )}
      </ScreenContainer>
      <FullPageEmptyState visible={showEmpty} imageHeight={245} centered>
        <EmptyState
          title="No past plans"
          description="Your past plans will appear here once they've ended."
          imageSource={require('@assets/empty-state/past-events.png')}
          imageWidth={219}
          imageHeight={245}
        />
      </FullPageEmptyState>
    </View>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  paginationFooter: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.buttonText,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
});

export default PastEventsScreen;
