import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { EventItemProps } from '@components/EventCard';

import EventSectionList, { EventSectionListProps } from './EventSectionList';

type EventListPageProps<TItem extends EventItemProps = EventItemProps> =
  EventSectionListProps<TItem> & {
    style?: StyleProp<ViewStyle>;
  };

const EventListPage = <TItem extends EventItemProps>({
  style,
  ...sectionListProps
}: EventListPageProps<TItem>) => (
  <View style={[styles.page, style]}>
    <EventSectionList {...sectionListProps} />
  </View>
);

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
});

export default EventListPage;
