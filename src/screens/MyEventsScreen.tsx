import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomSheetModal from "@components/BottomSheetModal";
import SignInButtons from "@components/SignInButtons";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import PagerView from "react-native-pager-view";

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

const EventCardItem = memo(({ item, onPress }: { item: EventItemProps; onPress: () => void }) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 40, stiffness: 600, mass: 0.3 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300, mass: 0.3 }); }}
    >
      <Animated.View style={animStyle}>
        <EventCard {...item} />
      </Animated.View>
    </Pressable>
  );
});

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

  const pagerRef = useRef<PagerView>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRequestedRefreshing, setIsRequestedRefreshing] = useState(false);
  const [showEventCreatedBadge, setShowEventCreatedBadge] = useState(false);
  const [showEventDeletedBadge, setShowEventDeletedBadge] = useState(false);

  useEffect(() => {
    if (!route.params?.showEventCreatedBadge) return;
    setShowEventCreatedBadge(true);
  }, [route.params?.showEventCreatedBadge]);

  useEffect(() => {
    if (!route.params?.showEventDeletedBadge) return;
    setShowEventDeletedBadge(true);
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
      onPress={() => navigation.navigate("EventDetails", { eventId: item.id, origin: "MyEvents" })}
    />
  );

  const filterOptions = [
    { label: "Hosting", count: counts.hosting },
    { label: "Joined", count: counts.joined },
    { label: "Requested", count: counts.requested },
  ];

  const listContentStyle = [
    styles.listContent,
    { paddingTop: headerHeight, paddingBottom: spacing.xl + insets.bottom },
  ];

  const [signInVisible, setSignInVisible] = useState(false);

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>My Events</Text>
        </View>
        <EmptyState
          title="No events to show"
          description={"Sign in to see the events you've\ncreated or joined"}
          actionLabel="Continue"
          onActionPress={() => setSignInVisible(true)}
          imageSource={require('@assets/emptystate_myevent.png')}
        />
        <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
          <SignInButtons />
        </BottomSheetModal>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={(e) => setSelectedPage(e.nativeEvent.position)}
          onPageScroll={(e) => {
            const { position, offset } = e.nativeEvent;
            if (offset > 0.5) setSelectedPage(position + 1);
            else setSelectedPage(position);
          }}
        >
          {/* Page 0: Hosting */}
          <View key="hosting" style={{ flex: 1 }}>
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
              ListEmptyComponent={<EmptyState title="No events yet" description={"Events you host\nwill appear here"} imageSource={require('@assets/emptystate_myevent.png')} />}
              refreshControl={<RefreshControl refreshing={selectedPage === 0 ? isRefreshing : false} onRefresh={handleRefresh} tintColor={colors.primary} />}
            />
          </View>

          {/* Page 1: Joined */}
          <View key="joined" style={{ flex: 1 }}>
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
              ListEmptyComponent={<EmptyState title="No events yet" description={"Events you join\nwill appear here"} imageSource={require('@assets/emptystate_myevent.png')} />}
              refreshControl={<RefreshControl refreshing={selectedPage === 1 ? isRefreshing : false} onRefresh={handleRefresh} tintColor={colors.primary} />}
            />
          </View>

          {/* Page 2: Requested */}
          <View key="requested" style={{ flex: 1 }}>
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
              ListEmptyComponent={<EmptyState title="No events yet" description={"Events you request to join\nwill appear here"} imageSource={require('@assets/emptystate_myevent.png')} />}
              refreshControl={<RefreshControl refreshing={isRequestedRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            />
          </View>
        </PagerView>

        {/* Floating blurred header */}
        <View
          style={styles.floatingHeader}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerSpacing}>
            <Text style={styles.headerTitle}>My Events</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
            style={styles.filterScrollView}
          >
            {filterOptions.map(({ label, count }, index) => {
              const isSelected = index === selectedPage;
              return (
                <Pressable
                  key={label}
                  onPress={() => { setSelectedPage(index); pagerRef.current?.setPage(index); }}
                  style={({ pressed }) => [
                    styles.filterButton,
                    (isSelected || pressed) && styles.filterButtonActive,
                  ]}
                >
                  <Text style={[styles.filterButtonText, isSelected && styles.filterButtonTextActive]}>
                    {label}
                  </Text>
                  {count > 0 && (
                    <Text style={[styles.filterCountText, isSelected && styles.filterCountTextActive]}>
                      {count}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
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
  );
};

const styles = StyleSheet.create({
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
  filterScrollView: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: spacing.md,
  },
  filterScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  filterButtonActive: {
    backgroundColor: "#E6E6E6",
    borderColor: "#E6E6E6",
  },
  filterButtonText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#494949",
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  filterButtonTextActive: {
    color: "#000000",
  },
  filterCountText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#808080",
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  filterCountTextActive: {
    color: "#000000",
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
