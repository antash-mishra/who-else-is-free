import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  useNavigation,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import EmptyState from "@components/EmptyState";
import EventCard, { EventItemProps } from "@components/EventCard";
import ScreenContainer from "@components/ScreenContainer";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { colors, spacing, typography } from "@theme/index";
import { DateLabel, UserEvent, useEvents } from "@context/EventsContext";
import { useChat } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import EmptyEventsIllustration from "@assets/create-event-empty-icon.svg";

type MyEventsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, "MyEvents">,
  NativeStackNavigationProp<RootStackParamList>
>;

type EventSection = {
  title: string;
  data: EventItemProps[];
};

type EventFilter = "created" | "joined" | "requested";

const sectionOrder: { label: string; value: DateLabel }[] = [
  { label: "Today", value: "Today" },
  { label: "Tomorrow", value: "Tmrw" },
];

const buildSections = (items: UserEvent[]): EventSection[] => {
  const grouped: Record<DateLabel, EventItemProps[]> = {
    Today: [],
    Tmrw: [],
  };

  items.forEach(
    ({
      id,
      title,
      location,
      time,
      audience,
      imageUri,
      badgeLabel,
      dateLabel,
    }) => {
      grouped[dateLabel].push({
        id,
        title,
        location,
        time,
        audience,
        imageUri,
        badgeLabel,
      });
    },
  );

  return sectionOrder
    .map(({ label, value }) => ({
      title: label,
      data: grouped[value],
    }))
    .filter((section) => section.data.length > 0);
};

const MyEventsScreen = () => {
  const navigation = useNavigation<MyEventsNavigation>();
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
  const [selectedFilter, setSelectedFilter] = useState<EventFilter>("created");
  const [isRequestedRefreshing, setIsRequestedRefreshing] = useState(false);

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

  const joinedEvents = useMemo(() => {
    if (!joinedEventIds.size) {
      return [];
    }
    return events.filter((event) => joinedEventIds.has(event.id));
  }, [events, joinedEventIds]);

  const filteredEvents = useMemo(() => {
    switch (selectedFilter) {
      case "created":
        return userEvents;
      case "joined":
        return joinedEvents;
      case "requested":
        return requestedEvents;
      default:
        return userEvents;
    }
  }, [joinedEvents, requestedEvents, selectedFilter, userEvents]);

  const sections = useMemo<EventSection[]>(
    () => buildSections(filteredEvents),
    [filteredEvents],
  );
  const hasEvents = sections.length > 0;

  const handleRefresh = useCallback(() => {
    if (selectedFilter === "requested") {
      setIsRequestedRefreshing(true);
      refreshRequestedEvents()
        .catch(() => undefined)
        .finally(() => setIsRequestedRefreshing(false));
      return;
    }
    refreshEvents().catch(() => undefined);
  }, [refreshEvents, refreshRequestedEvents, selectedFilter]);

  useEffect(() => {
    if (selectedFilter !== "requested") {
      return;
    }
    setIsRequestedRefreshing(true);
    refreshRequestedEvents()
      .catch(() => undefined)
      .finally(() => setIsRequestedRefreshing(false));
  }, [refreshRequestedEvents, selectedFilter]);

  const isRefreshing =
    selectedFilter === "requested" ? isRequestedRefreshing : isLoading;

  const emptyStateContent = useMemo(() => {
    switch (selectedFilter) {
      case "joined":
        return {
          title: "You haven’t joined any events yet",
          description:
            "Accept an invite or request to join an event to see it here.",
        };
      case "requested":
        return {
          title: "No pending requests",
          description:
            "Tap Interested on an event to send the host a join request.",
        };
      default:
        return {
          title: "You haven’t created any event yet",
          description:
            "Tap the button below to start planning your next experience.",
        };
    }
  }, [selectedFilter]);

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>{section.title.toUpperCase()}</Text>
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

  const filterOptions: { label: string; value: EventFilter }[] = [
    { label: "Created", value: "created" },
    { label: "Joined", value: "joined" },
    { label: "Requested", value: "requested" },
  ];

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Your Events</Text>
        </View>
        <EmptyState
          title="No events to show"
          description="Log in to create an event"
          actionLabel="Login"
          onActionPress={() => navigation.navigate("Login")}
          illustration={EmptyEventsIllustration}
          illustrationSize={40}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>Your Events</Text>
      </View>
      <View style={styles.filterContainer}>
        {filterOptions.map(({ label, value }) => {
          const isSelected = value === selectedFilter;
          return (
            <Pressable
              key={value}
              onPress={() => setSelectedFilter(value)}
              style={[
                styles.filterButton,
                isSelected && styles.filterButtonActive,
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
            </Pressable>
          );
        })}
      </View>
      {!hasEvents ? (
        <EmptyState
          title={emptyStateContent.title}
          description={emptyStateContent.description}
          actionLabel={
            selectedFilter === "created" ? "Create an event" : undefined
          }
          onActionPress={
            selectedFilter === "created"
              ? () => navigation.navigate("Create", {})
              : undefined
          }
        />
      ) : (
        <SectionList<EventItemProps, EventSection>
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          SectionSeparatorComponent={() => (
            <View style={styles.sectionSeparator} />
          )}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          ListFooterComponent={<View style={styles.footerSpacing} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  filterContainer: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterButton: {
    flex: 1,
    borderRadius: 40,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.07)",
  },
  filterButtonActive: {
    backgroundColor: "rgba(21, 44, 68, 0.09)",
  },
  filterButtonText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMedium,
    color: "rgba(0, 0, 0, 0.69)",
    letterSpacing: typography.letterSpacing,
  },
  filterButtonTextActive: {
    color: colors.tabActive,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    fontSize: typography.caption,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamilyMedium,
    flexShrink: 1,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  sectionSeparator: {
    height: spacing.md,
  },
  itemSeparator: {
    height: spacing.md,
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
