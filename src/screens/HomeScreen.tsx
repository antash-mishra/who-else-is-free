import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  useNavigation,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import EmptyState from "@components/EmptyState";
import EventCard, { EventItemProps } from "@components/EventCard";
import ScreenContainer from "@components/ScreenContainer";
import SegmentedControl from "@components/SegmentedControl";
import { colors, spacing, typography } from "@theme/index";
import { DateLabel, UserEvent, useEvents } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { useChat } from "@context/ChatContext";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type EventSection = {
  title: string;
  data: EventItemProps[];
};

const sectionOrder: { label: string; value: DateLabel }[] = [
  { label: "Today", value: "Today" },
  { label: "Tomorrow", value: "Tmrw" },
];

const buildSections = (
  items: UserEvent[],
  getBadgeLabel: (event: UserEvent) => string | undefined,
): EventSection[] => {
  const grouped: Record<DateLabel, EventItemProps[]> = {
    Today: [],
    Tmrw: [],
  };

  items.forEach((event) => {
    const { id, title, location, time, audience, imageUri, dateLabel } = event;
    grouped[dateLabel].push({
      id,
      title,
      location,
      time,
      audience,
      imageUri,
      badgeLabel: getBadgeLabel(event),
    });
  });

  return sectionOrder
    .map(({ label, value }) => ({
      title: label,
      data: grouped[value],
    }))
    .filter((section) => section.data.length > 0);
};

type SortMode = "upcoming" | "newest";

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
  const { events: allEvents, isLoading, error, refreshEvents, isEventRequested } = useEvents();
  const { user } = useAuth();
  const { conversations } = useChat();
  const insets = useSafeAreaInsets();
  const [sortMode, setSortMode] = useState<SortMode>("upcoming");
  const hasLoadedOnce = useRef(false);

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

  const sections = useMemo<EventSection[]>(() => {
    if (sortMode === "newest") {
      const sorted = [...allEvents].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      return sorted.length > 0
        ? [{
            title: "Newest",
            data: sorted.map((event) => ({
              id: event.id,
              title: event.title,
              location: event.location,
              time: event.time,
              audience: event.audience,
              imageUri: event.imageUri,
              badgeLabel: getBadgeLabel(event),
            })),
          }]
        : [];
    }
    return buildSections(allEvents, getBadgeLabel);
  }, [allEvents, sortMode, getBadgeLabel]);

  // Track if initial load has completed
  useEffect(() => {
    if (!isLoading && sections.length > 0) {
      hasLoadedOnce.current = true;
    }
  }, [isLoading, sections.length]);

  const showAllEventsLoading = isLoading && sections.length === 0 && !hasLoadedOnce.current;
  const showAllEventsError = !!error && !isLoading && sections.length === 0;
  const showAllEventsEmpty = !isLoading && sections.length === 0 && !error;

  const handleRefresh = useCallback(() => {
    refreshEvents().catch(() => undefined);
  }, [refreshEvents]);

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  const renderItem = ({ item }: SectionListRenderItemInfo<EventItemProps>) => (
    <Pressable
      onPress={() =>
        navigation.navigate("EventDetails", {
          eventId: item.id,
          origin: "Events",
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

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>Discover Events</Text>
        <SegmentedControl
          options={sortOptions}
          value={sortMode}
          onChange={(value) => setSortMode(value as SortMode)}
        />
      </View>
      {showAllEventsLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : showAllEventsError ? (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : showAllEventsEmpty ? (
        <EmptyState
          title="Nothing Happening Here (Yet!)"
          description="There are currently no events available. Please check back later for new experiences."
          imageSource={require('@assets/emptystate_discoverevent.png')}
        />
      ) : (
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
          ]}
          SectionSeparatorComponent={({ leadingItem }) =>
            leadingItem ? <View style={styles.sectionSeparator} /> : null
          }
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          ListFooterComponent={<View style={styles.footerSpacing} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
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
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  listContent: {
  },
  sectionHeader: {
    fontSize: 16,
    color: '#000000',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamilyMedium,
    flexShrink: 1,
    lineHeight: 20,
    letterSpacing: -0.4,
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
  eventPressable: {
    borderRadius: 20,
  },
  eventPressablePressed: {
    opacity: 0.85,
  },
});

export default HomeScreen;
