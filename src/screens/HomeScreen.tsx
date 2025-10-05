import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import EmptyState from '@components/EmptyState';
import EventCard, { EventItemProps } from '@components/EventCard';
import ScreenContainer from '@components/ScreenContainer';
import SegmentedControl from '@components/SegmentedControl';
import { RootTabParamList } from '@navigation/types';
import { colors, spacing, typography } from '@theme/index';
import { DateLabel, UserEvent, useEvents } from '@context/EventsContext';

type TabValue = 'all' | 'mine';

type EventsNavigation = BottomTabNavigationProp<RootTabParamList, 'Events'>;
type EventsRoute = RouteProp<RootTabParamList, 'Events'>;

type EventSection = {
  title: string;
  data: EventItemProps[];
};

const tabs = [
  { label: 'All Events', value: 'all' satisfies TabValue },
  { label: 'Your Events', value: 'mine' satisfies TabValue }
];

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
  const navigation = useNavigation<EventsNavigation>();
  const route = useRoute<EventsRoute>();
  const { events: allEvents, userEvents: createdEvents, isLoading, error, refreshEvents } = useEvents();
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
      navigation.setParams({ initialTab: undefined });
    }
  }, [navigation, route.params?.initialTab]);

  const userEventSections = useMemo<EventSection[]>(() => buildSections(createdEvents), [createdEvents]);
  const allEventSections = useMemo<EventSection[]>(() => buildSections(allEvents), [allEvents]);

  const sections = activeTab === 'mine' ? userEventSections : allEventSections;
  const hasUserEvents = userEventSections.length > 0;
  const showAllEventsLoading = activeTab === 'all' && isLoading && sections.length === 0;
  const showAllEventsError = activeTab === 'all' && !!error && !isLoading && sections.length === 0;
  const showAllEventsEmpty = activeTab === 'all' && !isLoading && sections.length === 0 && !error;

  const handleRefresh = useCallback(() => {
    refreshEvents().catch(() => undefined);
  }, [refreshEvents]);

  const renderSectionHeader = ({ section }: { section: EventSection }) => (
    <Text style={styles.sectionHeader}>
      {section.title.toUpperCase()}
    </Text>
  );

  const renderItem = ({ item }: SectionListRenderItemInfo<EventItemProps>) => <EventCard {...item} />;

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <SegmentedControl options={tabs} value={activeTab} onChange={(value) => setActiveTab(value as TabValue)} />
      </View>
      {activeTab === 'mine' && !hasUserEvents ? (
        <EmptyState
          title="You haven’t created any event yet"
          description="Tap the button below to start planning your next experience."
          actionLabel="Create an event"
          onActionPress={() => navigation.navigate('Create')}
        />
      ) : showAllEventsLoading ? (
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
            activeTab === 'all' ? (
              <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />
            ) : undefined
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
  }
});

export default HomeScreen;
