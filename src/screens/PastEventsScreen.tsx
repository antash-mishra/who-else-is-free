import { useCallback, useEffect, useMemo, useState } from 'react';

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '@api/config';
import EmptyState from '@components/EmptyState';
import { EventItemProps } from '@components/EventCard';
import { EventSectionList, buildEventItemSections } from '@components/events';
import FullPageEmptyState from '@components/FullPageEmptyState';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { CoverKey, resolveCoverUri } from '@constants/covers';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { colors, componentTokens, spacing, typography } from '@theme/index';
import { getScheduleDisplay, parseDateKey } from '@utils/dateTime';
import { formatAudienceLabel, formatEventListSectionHeaderLabel } from '@utils/eventDisplay';

type ApiEvent = {
  id: number;
  title: string;
  location: string;
  time: string;
  description?: string;
  gender: string;
  min_age: number;
  max_age: number;
  date_label?: string;
  event_date: string;
  group_type?: 'Single' | 'Group';
  user_id: number;
  host_name: string;
  cover_key?: CoverKey | null;
  scheduled_at?: string;
};

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
  const [error, setError] = useState<string | null>(null);

  const fetchPastEvents = useCallback(async () => {
    if (!authFetch || !token) return;
    setError(null);
    try {
      const response = await authFetch(`${API_BASE_URL}/api/events/past`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload: { data: ApiEvent[] | null } = await response.json();
      const mapped = (payload.data ?? []).map((event): PastEventItem => {
        const schedule = getScheduleDisplay({
          scheduledAt: event.scheduled_at,
          eventDate: event.event_date,
          time: event.time,
          dateLabel: event.date_label,
        });

        return {
          id: String(event.id),
          title: event.title,
          location: event.location,
          time: schedule.displayTime,
          audience: formatAudienceLabel({
            gender: event.gender,
            minAge: event.min_age,
            maxAge: event.max_age,
          }),
          imageUri: resolveCoverUri(event.cover_key),
          badgeLabel: user && event.user_id === user.id ? 'Hosting' : 'Joined',
          ownerId: event.user_id,
          eventDate: schedule.displayDate,
        };
      });
      setEvents(mapped);
    } catch {
      setError("Couldn't load past plans.");
    }
  }, [authFetch, token, user]);

  const loadPastEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchPastEvents();
    } finally {
      setIsLoading(false);
    }
  }, [fetchPastEvents]);

  useEffect(() => {
    if (!isFocused) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Focus-driven screen loading state wraps the existing fetch lifecycle.
    loadPastEvents();
  }, [isFocused, loadPastEvents]);

  const handleRefresh = useCallback(() => {
    setIsPullRefreshing(true);
    fetchPastEvents().finally(() => setIsPullRefreshing(false));
  }, [fetchPastEvents]);

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
          />
        )}
      </ScreenContainer>
      <FullPageEmptyState visible={showEmpty} imageHeight={245}>
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
});

export default PastEventsScreen;
