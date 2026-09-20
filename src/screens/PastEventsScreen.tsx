import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiEvent, mapApiEventToUserEvent } from '@api/mappers/events';
import { listPastEvents } from '@api/pastEvents';
import EmptyState from '@components/EmptyState';
import { EventItemProps } from '@components/EventCard';
import { EventSectionList, buildEventItemSections, toEventCardItem } from '@components/events';
import FullPageEmptyState from '@components/FullPageEmptyState';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { logger } from '@services/logger';
import { colors, componentTokens, spacing, typography } from '@theme/index';
import { parseDateKey } from '@utils/dateTime';
import { formatEventListSectionHeaderLabel } from '@utils/eventDisplay';

type PastEventItem = EventItemProps & { ownerId: number; eventDate: string };

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
  const { user, token, authFetch } = useAuth();
  const isFocused = useIsFocused();
  const [events, setEvents] = useState<PastEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const requestVersionRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);

  const mapPastEvent = useCallback(
    (event: ApiEvent): PastEventItem => {
      const mapped = mapApiEventToUserEvent(event);
      return {
        ...toEventCardItem(mapped, user && event.user_id === user.id ? 'Hosting' : 'Joined'),
        ownerId: event.user_id,
        eventDate: mapped.eventDate,
      };
    },
    [user],
  );

  const replacePastEvents = useCallback(async () => {
    if (!authFetch || !token) return;
    const requestVersion = ++requestVersionRef.current;
    setError(null);
    setLoadMoreError(false);
    try {
      const page = await listPastEvents(authFetch);
      if (requestVersion !== requestVersionRef.current) return;
      setEvents(page.events.map(mapPastEvent));
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } catch {
      if (requestVersion !== requestVersionRef.current) return;
      setError("Couldn't load past plans.");
    }
  }, [authFetch, mapPastEvent, token]);

  const loadPastEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      await replacePastEvents();
    } finally {
      setIsLoading(false);
    }
  }, [replacePastEvents]);

  useEffect(() => {
    if (!isFocused) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Focus-driven screen loading state wraps the existing fetch lifecycle.
    loadPastEvents();
  }, [isFocused, loadPastEvents]);

  const handleRefresh = useCallback(() => {
    setIsPullRefreshing(true);
    replacePastEvents().finally(() => setIsPullRefreshing(false));
  }, [replacePastEvents]);

  const handleLoadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!authFetch || !cursor || loadMoreInFlightRef.current) return;

    loadMoreInFlightRef.current = true;
    const requestVersion = requestVersionRef.current;
    setIsLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await listPastEvents(authFetch, cursor);
      if (requestVersion !== requestVersionRef.current) return;
      setEvents((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.events.map(mapPastEvent).filter((item) => !seen.has(item.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } catch (requestError) {
      if (requestVersion !== requestVersionRef.current) return;
      logger.warn('past plans pagination failed', requestError);
      setLoadMoreError(true);
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [authFetch, mapPastEvent]);

  const sections = useMemo(
    () =>
      buildEventItemSections(events, {
        sortDirection: 'desc',
        titleForDate: getPastSectionDateLabel,
      }),
    [events],
  );

  const handleEventPress = useCallback(
    (item: PastEventItem, sharedCover?: boolean) => {
      navigation.navigate('EventDetails', {
        eventId: item.id,
        ...(sharedCover ? { sharedCover: true } : {}),
        readOnly: true,
      });
    },
    [navigation],
  );

  const showLoading = isLoading && events.length === 0;
  const showError = !!error && !isLoading && events.length === 0;
  const showEmpty = !isLoading && events.length === 0 && !error;
  const footer = isLoadingMore ? (
    <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
  ) : loadMoreError ? (
    <Pressable style={styles.loadMoreRetry} onPress={() => handleLoadMore().catch(() => undefined)}>
      <Text style={styles.loadMoreRetryText}>{"Couldn't load more. Tap to try again."}</Text>
    </Pressable>
  ) : null;

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
            footer={footer}
            onEndReached={hasMore && !loadMoreError ? handleLoadMore : undefined}
            onEndReachedThreshold={0.5}
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
  footerLoader: {
    paddingVertical: spacing.lg,
  },
  loadMoreRetry: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadMoreRetryText: {
    color: colors.error,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
});

export default PastEventsScreen;
