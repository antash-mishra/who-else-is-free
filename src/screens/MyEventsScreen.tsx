import { useCallback, useMemo } from 'react';
import {
  RefreshControl,
  SectionList,
  SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';

import EmptyState from '@components/EmptyState';
import EventCard, { EventItemProps } from '@components/EventCard';
import ScreenContainer from '@components/ScreenContainer';
import { RootTabParamList } from '@navigation/types';
import { colors, spacing, typography } from '@theme/index';
import { DateLabel, UserEvent, useEvents } from '@context/EventsContext';

type MyEventsNavigation = BottomTabNavigationProp<RootTabParamList, 'MyEvents'>;

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

const MyEventsScreen = () => {
  const navigation = useNavigation<MyEventsNavigation>();
  const { userEvents, isLoading, refreshEvents } = useEvents();

  const sections = useMemo<EventSection[]>(() => buildSections(userEvents), [userEvents]);
  const hasEvents = sections.length > 0;

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
        <Text style={styles.headerTitle}>Your Events</Text>
      </View>
      {!hasEvents ? (
        <EmptyState
          title="You haven’t created any event yet"
          description="Tap the button below to start planning your next experience."
          actionLabel="Create an event"
          onActionPress={() => navigation.navigate('Create')}
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
  }
});

export default MyEventsScreen;
