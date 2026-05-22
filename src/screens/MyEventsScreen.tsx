import { memo, useCallback, useEffect, useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import BottomSheetModal from "@components/BottomSheetModal";
import SignInButtons from "@components/SignInButtons";
import SegmentedControl, { SegmentedOption } from "@components/SegmentedControl";
import {
  InteractionManager,
  RefreshControl,
  SectionList,
  SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AnimatedPager from "@components/AnimatedPager";
import ScalePressable from "@components/ScalePressable";
import { useSharedValue } from "react-native-reanimated";

import {
  BottomTabNavigationProp,
} from "@react-navigation/bottom-tabs";
import {
  useNavigation,
  CompositeNavigationProp,
  RouteProp,
  useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import EmptyState from "@components/EmptyState";
import EventActionBadge from "@components/EventActionBadge";
import ConfettiOverlay from "@components/ConfettiOverlay";
import EventCard, { EventItemProps } from "@components/EventCard";
import ScreenContainer from "@components/ScreenContainer";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { colors, spacing, typography } from "@theme/index";
import { UserEvent, useEvents } from "@context/EventsContext";
import { useChat } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatEventCardMetaLine,
  formatEventListSectionHeaderLabel,
} from "@utils/eventDisplay";

type MyEventsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, "MyEvents">,
  NativeStackNavigationProp<RootStackParamList>
>;

type MyEventsRoute = RouteProp<RootTabParamList, "MyEvents">;

type EventSection = {
  title: string;
  data: EventItemProps[];
};

const buildSections = (items: EventItemProps[]): EventSection[] => {
  const grouped = new Map<string, EventItemProps[]>();

  items.forEach((item) => {
    const eventDate = (item as UserEvent & EventItemProps).eventDate;
    if (!eventDate) return;
    const sectionEvents = grouped.get(eventDate) ?? [];
    sectionEvents.push(item);
    grouped.set(eventDate, sectionEvents);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([eventDate, data]) => ({
      title: formatEventListSectionHeaderLabel(eventDate),
      data,
    }))
    .filter((s) => s.data.length > 0);
};

const EventCardItem = memo(({ item, onPress }: { item: EventItemProps; onPress: () => void }) => (
  <ScalePressable onPress={onPress} delay={80}>
    <EventCard {...item} />
  </ScalePressable>
));

const toEventCardItem = (event: UserEvent, badgeLabel: string): EventItemProps => ({
  ...event,
  badgeLabel,
  metaLine: formatEventCardMetaLine({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
  }),
});

const MyEventsScreen = () => {
  const navigation = useNavigation<MyEventsNavigation>();
  const route = useRoute<MyEventsRoute>();
  const {
    events,
    userEvents,
    requestedEvents,
    refreshEvents,
    refreshRequestedEvents,
  } = useEvents();
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
    () => buildSections(userEvents.map((e) => toEventCardItem(e, "Hosting"))),
    [userEvents],
  );
  const joinedSections = useMemo(
    () => buildSections(joinedEvents.map((e) => toEventCardItem(e, "Joined"))),
    [joinedEvents],
  );
  const requestedSections = useMemo(
    () => buildSections(requestedEvents.map((e) => toEventCardItem(e, "Pending"))),
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

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  const renderItem = ({ item }: SectionListRenderItemInfo<EventItemProps>) => (
    <EventCardItem
      item={item}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("EventDetails", { eventId: item.id, origin: "MyEvents" });
      }}
    />
  );

  const filterOptions: SegmentedOption[] = [
    { label: "Hosting", value: "hosting", count: counts.hosting },
    { label: "Joined", value: "joined", count: counts.joined },
    { label: "Requested", value: "requested", count: counts.requested },
  ];

  const listContentStyle = [
    styles.listContent,
    { paddingTop: headerHeight, paddingBottom: spacing.xl + insets.bottom },
  ];

  const [signInVisible, setSignInVisible] = useState(false);

  if (!user) {
    return (
      <ScreenContainer edges={["bottom"]}>
        <View style={[styles.headerSpacing, { paddingTop: insets.top + (spacing.lg - spacing.md) }]}>
          <Text style={styles.headerTitle}>My Events</Text>
        </View>
        <EmptyState
          title="No events to show"
          description={"Sign in to see the events you've created or joined"}
          actionLabel="Continue"
          onActionPress={() => setSignInVisible(true)}
          imageSource={require('@assets/illustration/myEvent-emptyState.png')}
          imageWidth={258}
          imageHeight={245}
        />
        <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
          <SignInButtons />
        </BottomSheetModal>
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.root}>
    <ScreenContainer edges={["bottom"]}>
      <View style={styles.content}>
        <AnimatedPager
          selectedIndex={selectedPage}
          onPageChange={setSelectedPage}
          pageOffsetSV={pageOffset}
          style={styles.pager}
        >
          {/* Page 0: Hosting */}
          <View style={{ flex: 1 }}>
            <SectionList<EventItemProps, EventSection>
              sections={hostingSections}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[listContentStyle, hostingSections.length === 0 && { flex: 1 }]}
              SectionSeparatorComponent={({ leadingItem }) => leadingItem ? <View style={styles.sectionSeparator} /> : null}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              ListFooterComponent={<View style={styles.footerSpacing} />}
              ListEmptyComponent={<EmptyState title="No events yet" description={"Events you host will appear here"} imageSource={require('@assets/illustration/myEvent-emptyState.png')} imageWidth={258} imageHeight={245} />}
              refreshControl={<RefreshControl refreshing={selectedPage === 0 ? isRefreshing : false} onRefresh={handleRefresh} tintColor={colors.primary} />}
            />
          </View>

          {/* Page 1: Joined */}
          <View style={{ flex: 1 }}>
            <SectionList<EventItemProps, EventSection>
              sections={joinedSections}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[listContentStyle, joinedSections.length === 0 && { flex: 1 }]}
              SectionSeparatorComponent={({ leadingItem }) => leadingItem ? <View style={styles.sectionSeparator} /> : null}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              ListFooterComponent={<View style={styles.footerSpacing} />}
              ListEmptyComponent={<EmptyState title="No events yet" description={"Events you join will appear here"} imageSource={require('@assets/illustration/myEvent-emptyState.png')} imageWidth={258} imageHeight={245} />}
              refreshControl={<RefreshControl refreshing={selectedPage === 1 ? isRefreshing : false} onRefresh={handleRefresh} tintColor={colors.primary} />}
            />
          </View>

          {/* Page 2: Requested */}
          <View style={{ flex: 1 }}>
            <SectionList<EventItemProps, EventSection>
              sections={requestedSections}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[listContentStyle, requestedSections.length === 0 && { flex: 1 }]}
              SectionSeparatorComponent={({ leadingItem }) => leadingItem ? <View style={styles.sectionSeparator} /> : null}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              ListFooterComponent={<View style={styles.footerSpacing} />}
              ListEmptyComponent={<EmptyState title="No events yet" description={"Events you request to join will appear here"} imageSource={require('@assets/illustration/myEvent-emptyState.png')} imageWidth={258} imageHeight={245} />}
              refreshControl={<RefreshControl refreshing={isRequestedRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            />
          </View>
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
    position: "absolute",
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
  listContent: {
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    fontSize: 15,
    color: "#808080",
    marginTop: 0,
    marginBottom: 12,
    fontFamily: typography.fontFamilyMedium,
    flexShrink: 1,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  sectionSeparator: {
    height: 22,
  },
  itemSeparator: {
    height: 14,
  },
  footerSpacing: {
    height: spacing.xl,
  },
});

export default MyEventsScreen;
