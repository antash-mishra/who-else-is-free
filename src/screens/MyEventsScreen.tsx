import { useCallback, useEffect, useMemo, useState } from 'react';

import { InteractionManager, StyleSheet, Text, View } from 'react-native';

import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  useNavigation,
  CompositeNavigationProp,
  RouteProp,
  useRoute,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedPager from '@components/AnimatedPager';
import BottomSheetModal from '@components/BottomSheetModal';
import ConfettiOverlay from '@components/ConfettiOverlay';
import EmptyState from '@components/EmptyState';
import EventActionBadge from '@components/EventActionBadge';
import { EventItemProps } from '@components/EventCard';
import { EventListPage, buildEventSections } from '@components/events';
import ScreenContainer from '@components/ScreenContainer';
import SegmentedControl, { SegmentedOption } from '@components/SegmentedControl';
import SignInButtons from '@components/SignInButtons';
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import { colors, spacing, typography } from '@theme/index';

type MyEventsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'MyEvents'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type MyEventsRoute = RouteProp<RootTabParamList, 'MyEvents'>;

// Match the shared empty-state illustration height (245) used by Discover,
// Messages, and Past Events; width preserves the artwork's 1032x980 aspect.
const MY_EVENTS_EMPTY_IMAGE_WIDTH = 258;
const MY_EVENTS_EMPTY_IMAGE_HEIGHT = 245;

const MyEventsScreen = () => {
  const navigation = useNavigation<MyEventsNavigation>();
  const route = useRoute<MyEventsRoute>();
  const { events, userEvents, requestedEvents, refreshEvents, refreshRequestedEvents } =
    useEvents();
  const { conversations } = useChat();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedPage, setSelectedPage] = useState(0);
  const pageOffset = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRequestedRefreshing, setIsRequestedRefreshing] = useState(false);
  const [showEventCreatedBadge, setShowEventCreatedBadge] = useState(false);
  const [showEventDeletedBadge, setShowEventDeletedBadge] = useState(false);

  useEffect(() => {
    if (!route.params?.showEventCreatedBadge) return;
    const task = InteractionManager.runAfterInteractions(() => setShowEventCreatedBadge(true));
    return () => task.cancel();
  }, [route.params?.showEventCreatedBadge]);

  useEffect(() => {
    if (!route.params?.showEventDeletedBadge) return;
    const task = InteractionManager.runAfterInteractions(() => setShowEventDeletedBadge(true));
    return () => task.cancel();
  }, [route.params?.showEventDeletedBadge]);

  const joinedEventIds = useMemo(() => {
    if (!user) return new Set<string>();
    const ids = new Set<string>();
    conversations.forEach((c) => {
      if (c.eventId && c.createdBy !== user.id) ids.add(String(c.eventId));
    });
    return ids;
  }, [conversations, user]);

  const joinedEvents = useMemo(() => {
    if (!joinedEventIds.size) return [];
    return events.filter((e) => joinedEventIds.has(e.id));
  }, [events, joinedEventIds]);

  const hostingSections = useMemo(
    () => buildEventSections(userEvents, () => 'Hosting'),
    [userEvents],
  );
  const joinedSections = useMemo(
    () => buildEventSections(joinedEvents, () => 'Joined'),
    [joinedEvents],
  );
  const requestedSections = useMemo(
    () => buildEventSections(requestedEvents, () => 'Pending'),
    [requestedEvents],
  );

  const counts = useMemo(
    () => ({
      hosting: userEvents.length,
      joined: joinedEvents.length,
      requested: requestedEvents.length,
    }),
    [userEvents.length, joinedEvents.length, requestedEvents.length],
  );

  const handleRefresh = useCallback(() => {
    if (selectedPage === 2) {
      setIsRequestedRefreshing(true);
      Promise.all([refreshEvents(), refreshRequestedEvents()])
        .catch(() => undefined)
        .finally(() => setIsRequestedRefreshing(false));
      return;
    }
    setIsRefreshing(true);
    refreshEvents()
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  }, [refreshEvents, refreshRequestedEvents, selectedPage]);

  const handleEventPress = useCallback(
    (item: EventItemProps) => {
      navigation.navigate('EventDetails', { eventId: item.id, origin: 'MyEvents' });
    },
    [navigation],
  );

  const filterOptions: SegmentedOption[] = [
    { label: 'Hosting', value: 'hosting', count: counts.hosting },
    { label: 'Joined', value: 'joined', count: counts.joined },
    { label: 'Requested', value: 'requested', count: counts.requested },
  ];

  const [signInVisible, setSignInVisible] = useState(false);

  if (!user) {
    return (
      <ScreenContainer edges={['bottom']}>
        <View
          style={[styles.headerSpacing, { paddingTop: insets.top + (spacing.lg - spacing.md) }]}
        >
          <Text style={styles.headerTitle}>My Events</Text>
        </View>
        <EmptyState
          title="No events to show"
          description={"Sign in to see the events you've created or joined"}
          actionLabel="Continue"
          onActionPress={() => setSignInVisible(true)}
          imageSource={require('@assets/illustration/myEvent-emptyState.png')}
          imageWidth={MY_EVENTS_EMPTY_IMAGE_WIDTH}
          imageHeight={MY_EVENTS_EMPTY_IMAGE_HEIGHT}
          style={styles.fillEmptyState}
        />
        <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
          <SignInButtons />
        </BottomSheetModal>
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenContainer edges={['bottom']}>
        <View style={styles.content}>
          <AnimatedPager
            selectedIndex={selectedPage}
            onPageChange={setSelectedPage}
            pageOffsetSV={pageOffset}
            style={styles.pager}
          >
            <EventListPage
              sections={hostingSections}
              onEventPress={handleEventPress}
              headerPaddingTop={headerHeight}
              bottomInset={insets.bottom}
              emptyState={
                <EmptyState
                  title="No events yet"
                  description="Events you host will appear here"
                  imageSource={require('@assets/illustration/myEvent-emptyState.png')}
                  imageWidth={MY_EVENTS_EMPTY_IMAGE_WIDTH}
                  imageHeight={MY_EVENTS_EMPTY_IMAGE_HEIGHT}
                />
              }
              refreshing={selectedPage === 0 ? isRefreshing : false}
              onRefresh={handleRefresh}
            />
            <EventListPage
              sections={joinedSections}
              onEventPress={handleEventPress}
              headerPaddingTop={headerHeight}
              bottomInset={insets.bottom}
              emptyState={
                <EmptyState
                  title="No events yet"
                  description="Events you join will appear here"
                  imageSource={require('@assets/illustration/myEvent-emptyState.png')}
                  imageWidth={MY_EVENTS_EMPTY_IMAGE_WIDTH}
                  imageHeight={MY_EVENTS_EMPTY_IMAGE_HEIGHT}
                />
              }
              refreshing={selectedPage === 1 ? isRefreshing : false}
              onRefresh={handleRefresh}
            />
            <EventListPage
              sections={requestedSections}
              onEventPress={handleEventPress}
              headerPaddingTop={headerHeight}
              bottomInset={insets.bottom}
              emptyState={
                <EmptyState
                  title="No events yet"
                  description="Events you request to join will appear here"
                  imageSource={require('@assets/illustration/myEvent-emptyState.png')}
                  imageWidth={MY_EVENTS_EMPTY_IMAGE_WIDTH}
                  imageHeight={MY_EVENTS_EMPTY_IMAGE_HEIGHT}
                />
              }
              refreshing={isRequestedRefreshing}
              onRefresh={handleRefresh}
            />
          </AnimatedPager>

          {/* Floating blurred header */}
          <View
            style={[styles.floatingHeader, { paddingTop: insets.top }]}
            onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          >
            <View style={styles.headerSpacing}>
              <Text style={styles.headerTitle}>My Events</Text>
            </View>
            <View style={styles.filterRow}>
              <SegmentedControl
                options={filterOptions}
                value={filterOptions[selectedPage].value}
                onChange={(value) => {
                  const index = filterOptions.findIndex((o) => o.value === value);
                  setSelectedPage(index);
                }}
              />
            </View>
          </View>

          <EventActionBadge
            visible={showEventCreatedBadge}
            label="Event Created"
            onHidden={() => {
              setShowEventCreatedBadge(false);
              navigation.setParams({ showEventCreatedBadge: false });
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
        </View>
      </ScreenContainer>
      <ConfettiOverlay active={showEventCreatedBadge} variant="burst" speedScale={1.8} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
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
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: 24,
  },
  content: {
    flex: 1,
  },
  fillEmptyState: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  filterRow: {
    marginBottom: spacing.md,
  },
});

export default MyEventsScreen;
