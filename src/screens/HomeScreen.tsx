import { useEffect, useMemo, useState } from 'react';
import {
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
import { DateLabel, useEvents } from '@context/EventsContext';

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

const allEventsSections: EventSection[] = [
  {
    title: 'Today',
    data: [
      {
        id: '1',
        title: 'Running buddy',
        location: 'Phoenix park',
        time: '9pm',
        audience: 'Any gender, 20-25 years',
        imageUri:
          'https://images.unsplash.com/photo-1526401485004-46910ecc8e51?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: '2',
        title: 'Music gig',
        location: 'Workmans club',
        time: '12pm',
        audience: 'Female, 20-25 years',
        imageUri:
          'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=400&q=80',
        badgeLabel: 'Group'
      }
    ]
  },
  {
    title: 'Tomorrow',
    data: Array.from({ length: 4 }).map((_, index) => ({
      id: `t-${index}`,
      title: 'Run, coffee and sauna',
      location: 'Howth',
      time: '10am',
      audience: 'Female, 20-25 years',
      imageUri:
        'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=400&q=80'
    }))
  }
];

const HomeScreen = () => {
  const navigation = useNavigation<EventsNavigation>();
  const route = useRoute<EventsRoute>();
  const { userEvents } = useEvents();
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
      navigation.setParams({ initialTab: undefined });
    }
  }, [navigation, route.params?.initialTab]);

  const userEventSections = useMemo<EventSection[]>(() => {
    if (!userEvents.length) {
      return [];
    }

    const order: DateLabel[] = ['Today', 'Tmrw'];
    const labelMap: Record<DateLabel, string> = {
      Today: 'Today',
      Tmrw: 'Tomorrow'
    };

    return order
      .map((label) => ({
        title: labelMap[label],
        data: userEvents.filter((event) => event.dateLabel === label)
      }))
      .filter((section) => section.data.length > 0);
  }, [userEvents]);

  const sections = activeTab === 'mine' ? userEventSections : allEventsSections;
  const hasUserEvents = userEventSections.length > 0;

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
  }
});

export default HomeScreen;
