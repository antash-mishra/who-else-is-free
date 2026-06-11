import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  useNavigation,
  useRoute,
  useIsFocused,
  CompositeNavigationProp,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedPager from '@components/AnimatedPager';
import EmptyState from '@components/EmptyState';
import EventActionBadge from '@components/EventActionBadge';
import { EventItemProps } from '@components/EventCard';
import {
  EventListPage,
  EventSection,
  buildEventSections,
  buildSingleEventSection,
  sortEventsByCreatedAtDesc,
} from '@components/events';
import ScreenContainer from '@components/ScreenContainer';
import SegmentedControl from '@components/SegmentedControl';
import { useAuth } from '@context/AuthContext';
import { useBloom } from '@context/BloomContext';
import { useChat } from '@context/ChatContext';
import { UserEvent, useEvents } from '@context/EventsContext';
import { useViewerLocation } from '@hooks/useViewerLocation';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing, typography } from '@theme/index';
import {
  EventWithDistance,
  LOCAL_RADIUS_KM,
  sortByDistance,
  withEventDistances,
} from '@utils/eventDiscovery';

const isLocalOrViewerOwnedEvent = (event: EventWithDistance<UserEvent>, viewerUserId?: number) =>
  (event.distanceKm != null && event.distanceKm <= LOCAL_RADIUS_KM) ||
  (viewerUserId != null && event.ownerId === viewerUserId);

type SortOptionValue = 'upcoming' | 'nearest' | 'newest';

const baseSortOptions: Array<{ label: string; value: SortOptionValue }> = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Newest', value: 'newest' },
];

const locationSortOptions: Array<{ label: string; value: SortOptionValue }> = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Nearest', value: 'nearest' },
  { label: 'Newest', value: 'newest' },
];

const HomeScreen = () => {
  type HomeScreenNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<RootTabParamList, 'Events'>,
    NativeStackNavigationProp<RootStackParamList>
  >;

  const navigation = useNavigation<HomeScreenNavigation>();
  const route = useRoute<RouteProp<RootTabParamList, 'Events'>>();
  const {
    events: allEvents,
    isLoading,
    error,
    refreshEvents,
    refreshRequestedEvents,
    isEventRequested,
  } = useEvents();
  const { user } = useAuth();
  const { conversations } = useChat();
  const { signalReady } = useBloom();
  const viewerLocation = useViewerLocation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [selectedSort, setSelectedSort] = useState<SortOptionValue>('upcoming');
  const pageOffset = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const hasSignalledReady = useRef(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [showReportedBadge, setShowReportedBadge] = useState(false);
  const [showEventDeletedBadge, setShowEventDeletedBadge] = useState(false);
  const [showEventLeftBadge, setShowEventLeftBadge] = useState(false);

  useEffect(() => {
    if (!route.params?.showEventReportedBadge) return;
    const t = setTimeout(() => setShowReportedBadge(true), 350);
    return () => clearTimeout(t);
  }, [route.params?.showEventReportedBadge]);

  useEffect(() => {
    if (!route.params?.showEventDeletedBadge) return;
    const t = setTimeout(() => setShowEventDeletedBadge(true), 350);
    return () => clearTimeout(t);
  }, [route.params?.showEventDeletedBadge]);

  useEffect(() => {
    if (!route.params?.showEventLeftBadge) return;
    const t = setTimeout(() => setShowEventLeftBadge(true), 350);
    return () => clearTimeout(t);
  }, [route.params?.showEventLeftBadge]);

  // Set of event IDs user has joined (is a member of conversation but not owner)
  const joinedEventIds = useMemo(() => {
    if (!user) return new Set<string>();
    const ids = new Set<string>();
    conversations.forEach((conversation) => {
      if (conversation.eventId && conversation.createdBy !== user.id) {
        ids.add(String(conversation.eventId));
      }
    });
    return ids;
  }, [conversations, user]);

  // Compute badge label based on user's relationship to the event
  const getBadgeLabel = useCallback(
    (event: UserEvent): string | undefined => {
      if (!user) return undefined;
      if (event.ownerId === user.id) return 'Hosting';
      if (joinedEventIds.has(event.id)) return 'Joined';
      if (isEventRequested(event.id)) return 'Pending';
      return undefined;
    },
    [user, joinedEventIds, isEventRequested],
  );

  const hasViewerLocation = viewerLocation.coords != null;
  const sortOptions = useMemo(
    () => (hasViewerLocation ? locationSortOptions : baseSortOptions),
    [hasViewerLocation],
  );
  const selectedPage = Math.max(
    0,
    sortOptions.findIndex((option) => option.value === selectedSort),
  );
  const handlePageChange = useCallback(
    (index: number) => {
      setSelectedSort(sortOptions[index]?.value ?? 'upcoming');
    },
    [sortOptions],
  );

  const resetUnavailableSort = useCallback(() => {
    setSelectedSort('upcoming');
  }, []);

  useEffect(() => {
    if (!hasViewerLocation && selectedSort === 'nearest') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep selected sort valid when the location-only option disappears.
      resetUnavailableSort();
    }
  }, [hasViewerLocation, resetUnavailableSort, selectedSort]);

  const discoverableEvents = useMemo(() => {
    if (viewerLocation.isLoading) {
      return null;
    }

    if (!viewerLocation.coords) {
      return null;
    }
    return withEventDistances(allEvents, viewerLocation.coords).filter((event) =>
      isLocalOrViewerOwnedEvent(event, user?.id),
    );
  }, [allEvents, user?.id, viewerLocation.coords, viewerLocation.isLoading]);

  const upcomingSections = useMemo<EventSection[]>(() => {
    if (!discoverableEvents) {
      return buildEventSections(allEvents, getBadgeLabel);
    }

    return buildEventSections(discoverableEvents, getBadgeLabel);
  }, [allEvents, discoverableEvents, getBadgeLabel]);

  const newestSections = useMemo<EventSection[]>(() => {
    if (discoverableEvents) {
      return buildSingleEventSection(
        'Newest',
        [...discoverableEvents].sort(sortEventsByCreatedAtDesc),
        getBadgeLabel,
      );
    }

    const sorted = [...allEvents].sort(sortEventsByCreatedAtDesc);
    return buildSingleEventSection('Newest created', sorted, getBadgeLabel);
  }, [allEvents, discoverableEvents, getBadgeLabel]);

  const nearestSections = useMemo<EventSection[]>(() => {
    if (!discoverableEvents) {
      return [];
    }

    const knownDistanceEvents: Array<EventWithDistance<UserEvent>> = [...discoverableEvents].sort(
      sortByDistance,
    );

    return buildSingleEventSection('Nearest', knownDistanceEvents, getBadgeLabel);
  }, [discoverableEvents, getBadgeLabel]);

  const markLoadedOnce = useCallback(() => {
    setHasLoadedOnce(true);
  }, []);

  // Track if initial load has completed
  useEffect(() => {
    if (!isLoading && allEvents.length > 0 && !hasLoadedOnce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Preserve the existing "first loaded" gate for full-screen loading.
      markLoadedOnce();
    }
  }, [hasLoadedOnce, isLoading, allEvents.length, markLoadedOnce]);

  useEffect(() => {
    if (!isLoading && !hasSignalledReady.current) {
      hasSignalledReady.current = true;
      signalReady();
    }
  }, [isLoading, signalReady]);

  const showAllEventsLoading = isLoading && allEvents.length === 0 && !hasLoadedOnce;
  const showAllEventsError = !!error && !isLoading && allEvents.length === 0;
  const showAllEventsEmpty = !isLoading && allEvents.length === 0 && !error;
  const showUpcomingEmpty =
    showAllEventsEmpty || (!isLoading && !error && upcomingSections.length === 0);
  const showNearestEmpty =
    showAllEventsEmpty || (!isLoading && !error && nearestSections.length === 0);
  const showNewestEmpty =
    showAllEventsEmpty || (!isLoading && !error && newestSections.length === 0);

  const refreshAll = useCallback(
    async () => Promise.all([refreshEvents(), refreshRequestedEvents()]),
    [refreshEvents, refreshRequestedEvents],
  );

  const handleRefresh = useCallback(() => {
    setIsPullRefreshing(true);
    refreshAll()
      .catch(() => undefined)
      .finally(() => setIsPullRefreshing(false));
  }, [refreshAll]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    refreshAll().catch(() => undefined);
    return;
  }, [isFocused, refreshAll]);

  const handleEventPress = useCallback(
    (item: EventItemProps) => {
      navigation.navigate('EventDetails', {
        eventId: item.id,
        origin: 'Events',
      });
    },
    [navigation],
  );

  const discoverEmptyState = (
    <EmptyState
      title="Nothing Happening Here (Yet!)"
      description="There are currently no events available. Please check back later."
      imageSource={require('@assets/illustration/discoverEvent-emptyState.png')}
    />
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.content}>
        {showAllEventsLoading ? (
          <View style={[styles.centerContent, { paddingTop: headerHeight }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : showAllEventsError ? (
          <View style={[styles.centerContent, { paddingTop: headerHeight }]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                triggerHaptic('light');
                handleRefresh();
              }}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <AnimatedPager
            selectedIndex={selectedPage}
            onPageChange={handlePageChange}
            pageOffsetSV={pageOffset}
            style={styles.pager}
          >
            <EventListPage
              sections={upcomingSections}
              onEventPress={handleEventPress}
              headerPaddingTop={headerHeight}
              bottomInset={insets.bottom}
              emptyState={showUpcomingEmpty ? discoverEmptyState : null}
              refreshing={isPullRefreshing}
              onRefresh={handleRefresh}
            />
            {hasViewerLocation ? (
              <EventListPage
                sections={nearestSections}
                onEventPress={handleEventPress}
                headerPaddingTop={headerHeight}
                bottomInset={insets.bottom}
                emptyState={showNearestEmpty ? discoverEmptyState : null}
                refreshing={isPullRefreshing}
                onRefresh={handleRefresh}
              />
            ) : null}
            <EventListPage
              sections={newestSections}
              onEventPress={handleEventPress}
              headerPaddingTop={headerHeight}
              bottomInset={insets.bottom}
              emptyState={showNewestEmpty ? discoverEmptyState : null}
              refreshing={isPullRefreshing}
              onRefresh={handleRefresh}
            />
          </AnimatedPager>
        )}
        {/* Floating header */}
        <View
          style={[styles.floatingHeader, { paddingTop: insets.top }]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerSpacing}>
            <Text style={styles.headerTitle}>Discover Events</Text>
          </View>
          <View style={styles.filtersRow}>
            <SegmentedControl
              options={sortOptions}
              value={sortOptions[selectedPage].value}
              onChange={(value) => {
                const index = sortOptions.findIndex((o) => o.value === value);
                setSelectedSort(sortOptions[index]?.value ?? 'upcoming');
              }}
            />
          </View>
        </View>
      </View>
      <EventActionBadge
        visible={showReportedBadge}
        label="Event Reported, Admins are looking into it"
        onHidden={() => {
          setShowReportedBadge(false);
          navigation.setParams({ showEventReportedBadge: false });
        }}
      />
      <EventActionBadge
        visible={showEventDeletedBadge}
        label="Event Deleted"
        onHidden={() => {
          setShowEventDeletedBadge(false);
          navigation.setParams({ showEventDeletedBadge: false });
        }}
      />
      <EventActionBadge
        visible={showEventLeftBadge}
        label="Event left"
        onHidden={() => {
          setShowEventLeftBadge(false);
          navigation.setParams({ showEventLeftBadge: false });
        }}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: -spacing.md,
    right: -spacing.md,
    zIndex: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  pager: {
    flex: 1,
    marginHorizontal: -spacing.md,
  },
  filtersRow: {
    marginBottom: spacing.md,
  },
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
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

export default HomeScreen;
