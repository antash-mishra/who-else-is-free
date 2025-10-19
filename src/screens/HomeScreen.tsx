import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import EventCard, { EventItemProps } from '@components/EventCard';
import ScreenContainer from '@components/ScreenContainer';
import { colors, spacing, typography } from '@theme/index';
import { DateLabel, UserEvent, useEvents } from '@context/EventsContext';
import { RootStackParamList, RootTabParamList } from '@navigation/types';

type EventSection = {
  title: string;
  data: EventItemProps[];
};

const sectionOrder: { label: string; value: DateLabel }[] = [
  { label: 'Today', value: 'Today' },
  { label: 'Tomorrow', value: 'Tmrw' }
];

const buildSections = (items: UserEvent[]): EventSection[] => {
  const grouped: Record<DateLabel, EventItemProps[]> = {
    Today: [],
    Tmrw: []
  };

  items.forEach(({ id, title, location, time, audience, imageUri, badgeLabel, dateLabel }) => {
    grouped[dateLabel].push({ id, title, location, time, audience, imageUri, badgeLabel });
  });

  return sectionOrder
    .map(({ label, value }) => ({
      title: label,
      data: grouped[value]
    }))
    .filter((section) => section.data.length > 0);
};

const HomeScreen = () => {
  type HomeScreenNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<RootTabParamList, 'Events'>,
    NativeStackNavigationProp<RootStackParamList>
  >;

  const navigation = useNavigation<HomeScreenNavigation>();
  const { events: allEvents, isLoading, error, refreshEvents } = useEvents();
  const allEventSections = useMemo<EventSection[]>(() => buildSections(allEvents), [allEvents]);

  const sections = allEventSections;
  const showAllEventsLoading = isLoading && sections.length === 0;
  const showAllEventsError = !!error && !isLoading && sections.length === 0;
  const showAllEventsEmpty = !isLoading && sections.length === 0 && !error;

  const handleRefresh = useCallback(() => {
    refreshEvents().catch(() => undefined);
  }, [refreshEvents]);

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>
      {section.title.toUpperCase()}
    </Text>
  );

  const renderItem = ({ item }: SectionListRenderItemInfo<EventItemProps>) => (
    <Pressable
      onPress={() => navigation.navigate('EventDetails', { eventId: item.id, origin: 'Events' })}
      style={({ pressed }) => [styles.eventPressable, pressed && styles.eventPressablePressed]}
    >
      <EventCard {...item} />
    </Pressable>
  );

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>All Events</Text>
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
        <View style={styles.centerContent}>
          <Text style={styles.emptyAllText}>No events available yet.</Text>
        </View>
      ) : (
        <SectionList<EventItemProps, EventSection>
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          ListFooterComponent={<View style={styles.footerSpacing} />}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  headerSpacing: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  listContent: {
    paddingBottom: spacing.xl
  },
  sectionHeader: {
    fontSize: typography.caption,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamilyMedium,
    flexShrink: 1,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  sectionSeparator: {
    height: spacing.md
  },
  itemSeparator: {
    height: spacing.md
  },
  footerSpacing: {
    height: spacing.xl
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md
  },
  errorText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: '#B00020',
    textAlign: 'center'
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  retryButtonText: {
    color: colors.buttonText,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  emptyAllText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  eventPressable: {
    borderRadius: 20
  },
  eventPressablePressed: {
    opacity: 0.85
  }
});

export default HomeScreen;
