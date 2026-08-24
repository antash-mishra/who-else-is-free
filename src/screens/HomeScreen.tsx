import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
import EventActionOverlay from '@components/EventActionOverlay';
import { EventItemProps } from '@components/EventCard';
import {
  EventListPage,
  EventListLoadState,
  EventSection,
  buildEventSections,
  buildSingleEventSection,
  sortEventsByCreatedAtDesc,
} from '@components/events';
import { emptyStateAnchorTop } from '@components/FullPageEmptyState';
import ScreenContainer from '@components/ScreenContainer';
import SegmentedControl from '@components/SegmentedControl';
import { useAuth } from '@context/AuthContext';
import { useBloom } from '@context/BloomContext';
import { useChat } from '@context/ChatContext';
import { UserEvent, useEvents } from '@context/EventsContext';
import { useViewerLocation } from '@hooks/useViewerLocation';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
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
type NotificationNotice = 'event_unavailable' | 'access_unavailable';

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
  const { height: windowHeight } = useWindowDimensions();
  const emptyStateTopPadding = emptyStateAnchorTop(windowHeight, 245);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const hasSignalledReady = useRef(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [showReportedBadge, setShowReportedBadge] = useState(false);
  const [showEventDeletedBadge, setShowEventDeletedBadge] = useState(false);
  const [showEventLeftBadge, setShowEventLeftBadge] = useState(false);
  const [showWelcomeBadge, setShowWelcomeBadge] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState<NotificationNotice | null>(null);

  useEffect(() => {
    if (!isFocused || !route.params?.notificationNotice) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume one-shot navigation notice after focus.
    setNotificationNotice(route.params.notificationNotice);
    navigation.setParams({ notificationNotice: undefined });
  }, [isFocused, navigation, route.params?.notificationNotice]);

  useEffect(() => {
    if (!route.params?.showWelcomeBadge) return;
    const t = setTimeout(() => setShowWelcomeBadge(true), 350);
    return () => clearTimeout(t);
  }, [route.params?.showWelcomeBadge]);

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
      if (isEventRequested(event.id)) return 'Requested';
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
        'Newest created',
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
      title="Nothing happening yet"
      description="Create a plan and see who else is free."
      imageSource={require('@assets/empty-state/discover.png')}
    />
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.content}>
        {showAllEventsLoading ? (
          <EventListLoadState status="loading" topPadding={headerHeight} />
        ) : showAllEventsError ? (
          <EventListLoadState
            status="error"
            errorMessage={error}
            onRetry={handleRefresh}
            topPadding={headerHeight}
          />
        ) : (
          <AnimatedPager
            selectedIndex={selectedPage}
            onPageChange={handlePageChange}
            pageOffsetSV={pageOffset}
            style={styles.pager}
            isActive={isFocused}
          >
            <EventListPage
              sections={upcomingSections}
              onEventPress={handleEventPress}
              headerPaddingTop={headerHeight}
              emptyStateTopPadding={emptyStateTopPadding}
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
                emptyStateTopPadding={emptyStateTopPadding}
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
              emptyStateTopPadding={emptyStateTopPadding}
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
            <Text style={styles.headerTitle}>Discover</Text>
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
        visible={showWelcomeBadge}
        label="Welcome to WEIF"
        onHidden={() => {
          setShowWelcomeBadge(false);
          navigation.setParams({ showWelcomeBadge: false });
        }}
      />
      <EventActionBadge
        visible={showReportedBadge}
        label="Report submitted. We'll review it shortly."
        onHidden={() => {
          setShowReportedBadge(false);
          navigation.setParams({ showEventReportedBadge: false });
        }}
      />
      <EventActionBadge
        visible={showEventDeletedBadge}
        label="Plan deleted"
        onHidden={() => {
          setShowEventDeletedBadge(false);
          navigation.setParams({ showEventDeletedBadge: false });
        }}
      />
      <EventActionBadge
        visible={showEventLeftBadge}
        label="You left the plan"
        onHidden={() => {
          setShowEventLeftBadge(false);
          navigation.setParams({ showEventLeftBadge: false });
        }}
      />
      <EventActionOverlay
        isVisible={notificationNotice != null}
        type="result"
        title={
          notificationNotice === 'event_unavailable'
            ? 'Event unavailable'
            : 'This is no longer available'
        }
        description={
          notificationNotice === 'event_unavailable'
            ? 'This event is no longer available. You can discover other events here.'
            : 'You no longer have access to the original destination. You can discover other events here.'
        }
        dismissLabel="Explore events"
        onDismiss={() => setNotificationNotice(null)}
        onBackdropPress={() => setNotificationNotice(null)}
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
});

export default HomeScreen;
