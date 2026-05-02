import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AnimatedPager from "@components/AnimatedPager";
import ScalePressable from "@components/ScalePressable";
import * as Haptics from "expo-haptics";
import { useSharedValue } from "react-native-reanimated";
import {
  useNavigation,
  useRoute,
  useIsFocused,
  CompositeNavigationProp,
  RouteProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  BottomTabNavigationProp,
} from "@react-navigation/bottom-tabs";

import EmptyState from "@components/EmptyState";
import EventActionBadge from "@components/EventActionBadge";
import EventCard, { EventItemProps } from "@components/EventCard";
import ScreenContainer from "@components/ScreenContainer";
import SegmentedControl from "@components/SegmentedControl";
import { colors, spacing, typography } from "@theme/index";
import { UserEvent, useEvents } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { useChat } from "@context/ChatContext";
import { useBloom } from "@context/BloomContext";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatEventCardMetaLine,
  formatEventListSectionHeaderLabel,
} from "@utils/eventDisplay";

type EventSection = {
  title: string;
  data: EventItemProps[];
};

const toEventCardItem = (
  event: UserEvent,
  badgeLabel: string | undefined,
): EventItemProps => ({
  id: event.id,
  title: event.title,
  location: event.location,
  time: event.time,
  audience: event.audience,
  metaLine: formatEventCardMetaLine({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
  }),
  imageUri: event.imageUri,
  badgeLabel,
});

const buildSections = (
  items: UserEvent[],
  getBadgeLabel: (event: UserEvent) => string | undefined,
): EventSection[] => {
  const grouped = new Map<string, EventItemProps[]>();

  items.forEach((event) => {
    const { eventDate } = event;
    const dateKey = eventDate || "";
    if (!dateKey) {
      return;
    }
    const sectionEvents = grouped.get(dateKey) ?? [];
    sectionEvents.push(toEventCardItem(event, getBadgeLabel(event)));
    grouped.set(dateKey, sectionEvents);
  });

  return Array.from(grouped.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([eventDate, data]) => ({
      title: formatEventListSectionHeaderLabel(eventDate),
      data,
    }))
    .filter((section) => section.data.length > 0);
};

type EventCardItemProps = {
  item: EventItemProps;
  onPress: () => void;
};

const EventCardItem = memo(({ item, onPress }: EventCardItemProps) => (
  <ScalePressable onPress={onPress} delay={80}>
    <EventCard {...item} />
  </ScalePressable>
));

const sortOptions = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Newest", value: "newest" },
];

const HomeScreen = () => {
  type HomeScreenNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<RootTabParamList, "Events">,
    NativeStackNavigationProp<RootStackParamList>
  >;

  const navigation = useNavigation<HomeScreenNavigation>();
  const route = useRoute<RouteProp<RootTabParamList, "Events">>();
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
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [selectedPage, setSelectedPage] = useState(0);
  const pageOffset = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const hasLoadedOnce = useRef(false);
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
      if (event.ownerId === user.id) return "Hosting";
      if (joinedEventIds.has(event.id)) return "Joined";
      if (isEventRequested(event.id)) return "Pending";
      return undefined;
    },
    [user, joinedEventIds, isEventRequested],
  );

  const upcomingSections = useMemo<EventSection[]>(
    () => buildSections(allEvents, getBadgeLabel),
    [allEvents, getBadgeLabel],
  );

  const newestSections = useMemo<EventSection[]>(() => {
    const sorted = [...allEvents].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    return sorted.length > 0
      ? [{ title: "Newest created", data: sorted.map((e) => toEventCardItem(e, getBadgeLabel(e))) }]
      : [];
  }, [allEvents, getBadgeLabel]);

  // Track if initial load has completed
  useEffect(() => {
    if (!isLoading && allEvents.length > 0) {
      hasLoadedOnce.current = true;
    }
  }, [isLoading, allEvents.length]);

  useEffect(() => {
    if (!isLoading && !hasSignalledReady.current) {
      hasSignalledReady.current = true;
      signalReady();
    }
  }, [isLoading, signalReady]);

  const showAllEventsLoading = isLoading && allEvents.length === 0 && !hasLoadedOnce.current;
  const showAllEventsError = !!error && !isLoading && allEvents.length === 0;
  const showAllEventsEmpty = !isLoading && allEvents.length === 0 && !error;

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

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  const renderItem = ({ item }: SectionListRenderItemInfo<EventItemProps>) => (
    <EventCardItem
      item={item}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("EventDetails", {
          eventId: item.id,
          origin: "Events",
        });
      }}
    />
  );

  return (
    <ScreenContainer>
      <View style={styles.content}>
        {showAllEventsLoading ? (
          <View style={[styles.centerContent, { paddingTop: headerHeight }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : showAllEventsError ? (
          <View style={[styles.centerContent, { paddingTop: headerHeight }]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleRefresh(); }}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <AnimatedPager
            selectedIndex={selectedPage}
            onPageChange={setSelectedPage}
            pageOffsetSV={pageOffset}
            style={styles.pager}
          >
            <View style={{ flex: 1 }}>
              <SectionList<EventItemProps, EventSection>
                sections={upcomingSections}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.listContent, { paddingTop: headerHeight, paddingBottom: spacing.xl + insets.bottom }, upcomingSections.length === 0 && { flex: 1 }]}
                SectionSeparatorComponent={({ leadingItem }) => leadingItem ? <View style={styles.sectionSeparator} /> : null}
                ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
                ListFooterComponent={<View style={styles.footerSpacing} />}
                ListEmptyComponent={showAllEventsEmpty ? <View style={[styles.centerContent, { paddingTop: headerHeight }]}><EmptyState title="Nothing Happening Here (Yet!)" description={"There are currently no events available. Please check back later."} imageSource={require('@assets/illustration/discoverEvent-emptyState.png')} /></View> : null}
                refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SectionList<EventItemProps, EventSection>
                sections={newestSections}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.listContent, { paddingTop: headerHeight, paddingBottom: spacing.xl + insets.bottom }, newestSections.length === 0 && { flex: 1 }]}
                SectionSeparatorComponent={({ leadingItem }) => leadingItem ? <View style={styles.sectionSeparator} /> : null}
                ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
                ListFooterComponent={<View style={styles.footerSpacing} />}
                ListEmptyComponent={showAllEventsEmpty ? <View style={[styles.centerContent, { paddingTop: headerHeight }]}><EmptyState title="Nothing Happening Here (Yet!)" description={"There are currently no events available. Please check back later."} imageSource={require('@assets/illustration/discoverEvent-emptyState.png')} /></View> : null}
                refreshControl={<RefreshControl refreshing={isPullRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
              />
            </View>
          </AnimatedPager>
        )}
        {/* Floating header */}
        <View
          style={styles.floatingHeader}
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
                setSelectedPage(index);
              }}
              pageOffset={pageOffset}
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
  listContent: {
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    fontSize: 15,
    color: '#808080',
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
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: "#B00020",
    textAlign: "center",
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
