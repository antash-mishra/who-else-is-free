import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  BottomTabNavigationProp,
  useBottomTabBarHeight,
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
import UpIcon from "@assets/up.svg";
import DownIcon from "@assets/down.svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSectionDateLabel } from "@utils/dateTime";

type MyEventsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, "MyEvents">,
  NativeStackNavigationProp<RootStackParamList>
>;

type MyEventsRoute = RouteProp<RootTabParamList, "MyEvents">;

type EventSection = {
  title: string;
  data: EventItemProps[];
};

type EventFilter = "all" | "hosting" | "joined" | "requested";
type SortMode = "upcoming" | "newest";

const buildSections = (items: EventItemProps[]): EventSection[] => {
  const grouped = new Map<string, EventItemProps[]>();

  items.forEach((item) => {
    const eventDate = (item as UserEvent & EventItemProps).eventDate;
    if (!eventDate) {
      return;
    }
    const sectionEvents = grouped.get(eventDate) ?? [];
    sectionEvents.push(item);
    grouped.set(eventDate, sectionEvents);
  });

  return Array.from(grouped.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([eventDate, data]) => ({
      title: getSectionDateLabel(eventDate),
      data,
    }))
    .filter((section) => section.data.length > 0);
};

const MyEventsScreen = () => {
  const navigation = useNavigation<MyEventsNavigation>();
  const route = useRoute<MyEventsRoute>();
  const {
    events,
    userEvents,
    requestedEvents,
    isLoading,
    refreshEvents,
    refreshRequestedEvents,
  } = useEvents();
  const { conversations } = useChat();
  const { user } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState<EventFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("upcoming");
  const [isRequestedRefreshing, setIsRequestedRefreshing] = useState(false);
  const [showEventCreatedBadge, setShowEventCreatedBadge] = useState(false);
  const [showEventDeletedBadge, setShowEventDeletedBadge] = useState(false);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  useEffect(() => {
    if (!route.params?.showEventCreatedBadge) {
      return;
    }

    setShowEventCreatedBadge(true);
  }, [route.params?.showEventCreatedBadge]);

  useEffect(() => {
    if (!route.params?.showEventDeletedBadge) {
      return;
    }
    setShowEventDeletedBadge(true);
  }, [route.params?.showEventDeletedBadge]);

  // Get joined event IDs from conversations
  const joinedEventIds = useMemo(() => {
    if (!user) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    conversations.forEach((conversation) => {
      if (conversation.eventId && conversation.createdBy !== user.id) {
        ids.add(String(conversation.eventId));
      }
    });
    return ids;
  }, [conversations, user]);

  // Get joined events
  const joinedEvents = useMemo(() => {
    if (!joinedEventIds.size) {
      return [];
    }
    return events.filter((event) => joinedEventIds.has(event.id));
  }, [events, joinedEventIds]);

  // Get requested event IDs set
  const requestedEventIds = useMemo(() => {
    return new Set(requestedEvents.map((e) => e.id));
  }, [requestedEvents]);

  // Helper to determine badge label for an event based on user's relationship
  const getBadgeLabelForEvent = useCallback(
    (event: UserEvent): string => {
      if (user && event.ownerId === user.id) return "Hosting";
      if (joinedEventIds.has(event.id)) return "Joined";
      if (requestedEventIds.has(event.id)) return "Pending";
      return "Hosting"; // fallback
    },
    [user, joinedEventIds, requestedEventIds]
  );

  // Combine all events for "all" filter with proper badges
  const allEventsWithBadges = useMemo(() => {
    if (!user) return [];

    // Collect all unique events
    const eventMap = new Map<string, UserEvent>();

    // Add user's hosted events
    userEvents.forEach((event) => {
      eventMap.set(event.id, event);
    });

    // Add joined events
    joinedEvents.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    // Add requested events
    requestedEvents.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    // Convert to array with proper badges
    return Array.from(eventMap.values()).map((event) => ({
      ...event,
      badgeLabel: getBadgeLabelForEvent(event),
    }));
  }, [user, userEvents, joinedEvents, requestedEvents, getBadgeLabelForEvent]);

  // Filter events based on selected filter
  const filteredEvents = useMemo(() => {
    switch (selectedFilter) {
      case "all":
        return allEventsWithBadges;
      case "hosting":
        return userEvents.map((event) => ({
          ...event,
          badgeLabel: "Hosting",
        }));
      case "joined":
        return joinedEvents.map((event) => ({
          ...event,
          badgeLabel: "Joined",
        }));
      case "requested":
        return requestedEvents.map((event) => ({
          ...event,
          badgeLabel: "Pending",
        }));
      default:
        return allEventsWithBadges;
    }
  }, [
    selectedFilter,
    allEventsWithBadges,
    userEvents,
    joinedEvents,
    requestedEvents,
  ]);

  // Event counts for badges
  const counts = useMemo(
    () => ({
      hosting: userEvents.length,
      joined: joinedEvents.length,
      requested: requestedEvents.length,
    }),
    [userEvents.length, joinedEvents.length, requestedEvents.length]
  );

  const sections = useMemo<EventSection[]>(() => {
    if (sortMode === "newest") {
      // Sort by creation date (newest first) and show in single "Newest" section
      const sorted = [...filteredEvents].sort((a, b) => {
        const dateA = (a as UserEvent).createdAt
          ? new Date((a as UserEvent).createdAt!).getTime()
          : 0;
        const dateB = (b as UserEvent).createdAt
          ? new Date((b as UserEvent).createdAt!).getTime()
          : 0;
        return dateB - dateA;
      });
      return sorted.length > 0
        ? [{ title: "Newest", data: sorted }]
        : [];
    }
    // Default: sort by event datetime (upcoming first) with Today/Tomorrow sections
    return buildSections(filteredEvents);
  }, [filteredEvents, sortMode]);

  const handleRefresh = useCallback(() => {
    if (selectedFilter === "requested" || selectedFilter === "all") {
      setIsRequestedRefreshing(true);
      Promise.all([refreshEvents(), refreshRequestedEvents()])
        .catch(() => undefined)
        .finally(() => setIsRequestedRefreshing(false));
      return;
    }
    refreshEvents().catch(() => undefined);
  }, [refreshEvents, refreshRequestedEvents, selectedFilter]);

  const isRefreshing =
    selectedFilter === "requested" || selectedFilter === "all"
      ? isRequestedRefreshing
      : isLoading;

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  const renderItem = ({ item }: SectionListRenderItemInfo<EventItemProps>) => (
    <Pressable
      onPress={() =>
        navigation.navigate("EventDetails", {
          eventId: item.id,
          origin: "MyEvents",
        })
      }
      style={({ pressed }) => [
        styles.eventPressable,
        pressed && styles.eventPressablePressed,
      ]}
    >
      <EventCard {...item} />
    </Pressable>
  );

  // Handle filter button press
  const handleFilterPress = (filterValue: EventFilter) => {
    if (filterValue === "all") {
      // Toggle sort mode when Upcoming is clicked
      setSortMode((prev) => (prev === "upcoming" ? "newest" : "upcoming"));
      return;
    }
    // Toggle: if already selected, go back to "all"; otherwise select this filter
    setSelectedFilter((prev) => (prev === filterValue ? "all" : filterValue));
  };

  // Filter options configuration
  const filterOptions: {
    label: string;
    value: EventFilter;
    count?: number;
    showIcon?: boolean;
  }[] = [
    { label: sortMode === "upcoming" ? "Upcoming" : "Newest", value: "all", showIcon: true },
    { label: "Hosting", value: "hosting", count: counts.hosting },
    { label: "Joined", value: "joined", count: counts.joined },
    { label: "Requested", value: "requested", count: counts.requested },
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
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>My Events</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterScrollView}
        >
          {filterOptions.map(({ label, value, count, showIcon }) => {
            // "Upcoming" (all) is always shown as selected
            // Other filters are selected only when they match selectedFilter
            const isSelected = value === "all" || value === selectedFilter;

            return (
              <Pressable
                key={value}
                onPress={() => handleFilterPress(value)}
                style={({ pressed }) => [
                  styles.filterButton,
                  (isSelected || pressed) && styles.filterButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    isSelected && styles.filterButtonTextActive,
                  ]}
                >
                  {label}
                </Text>
                {showIcon && (
                  <View style={styles.sortIconContainer}>
                    <DownIcon width={8} height={12} />
                    <UpIcon width={8} height={12} />
                  </View>
                )}
                {count !== undefined && count > 0 && (
                  <Text
                    style={[
                      styles.filterCountText,
                      isSelected && styles.filterCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <SectionList<EventItemProps, EventSection>
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: spacing.xl + insets.bottom },
            sections.length === 0 && { flex: 1 },
          ]}
          SectionSeparatorComponent={({ leadingItem }) =>
            leadingItem ? <View style={styles.sectionSeparator} /> : null
          }
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          ListFooterComponent={<View style={styles.footerSpacing} />}
          ListEmptyComponent={
            !isRefreshing ? (
              <EmptyState
                title="No events yet"
                description={"Events you create or join\nwill appear here"}
                imageSource={require('@assets/emptystate_myevent.png')}
              />
            ) : null
          }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      />
        <EventActionBadge
          visible={showEventCreatedBadge}
          label="Event Created"
          bottomOffset={tabBarHeight + spacing.md}
          onHidden={() => {
            setShowEventCreatedBadge(false);
            navigation.setParams({ showEventCreatedBadge: false });
          }}
        />
        <EventActionBadge
          visible={showEventDeletedBadge}
          label="Event Deleted"
          bottomOffset={tabBarHeight + spacing.md}
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
  sortIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    gap: 0,
  },
  listContent: {},
  sectionHeader: {
    fontSize: 16,
    color: "#000000",
    marginTop: 0,
    marginBottom: 14,
    fontFamily: typography.fontFamilyMedium,
    flexShrink: 1,
    lineHeight: 20,
    letterSpacing: -0.4,
  },
  sectionSeparator: {
    height: 28,
  },
  itemSeparator: {
    height: 14,
  },
  footerSpacing: {
    height: spacing.xl,
  },
  eventPressable: {
    borderRadius: 20,
  },
  eventPressablePressed: {
    opacity: 0.85,
  },
});

export default MyEventsScreen;
