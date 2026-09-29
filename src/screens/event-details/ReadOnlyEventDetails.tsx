import { ReactNode, useCallback } from 'react';

import { FlatListProps, ListRenderItemInfo, StyleProp, View, ViewStyle } from 'react-native';

import Animated from 'react-native-reanimated';

import { EventMemberRow, EventMemberRowSeparator } from '@components/events';

import { ReadOnlyMembersHeading, ReadOnlyMembersStatus } from './EventDetailsMembers';
import styles from './EventDetailsScreen.styles';
import { EventDetailMember } from './useEventDetailsData';

interface ReadOnlyEventDetailsProps {
  hero: ReactNode;
  info: ReactNode;
  members: EventDetailMember[];
  hostId: number;
  currentUserId?: number;
  isLoading: boolean;
  error: string | null;
  onScroll: FlatListProps<EventDetailMember>['onScroll'];
  contentContainerStyle: StyleProp<ViewStyle>;
}

const MemberSeparator = () => (
  <View style={styles.readOnlyMemberRow}>
    <EventMemberRowSeparator />
  </View>
);

/** One vertical scroll owner: dynamic hero/info header and virtualized member rows. */
const ReadOnlyEventDetails = ({
  hero,
  info,
  members,
  hostId,
  currentUserId,
  isLoading,
  error,
  onScroll,
  contentContainerStyle,
}: ReadOnlyEventDetailsProps) => {
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<EventDetailMember>) => (
      <View style={styles.readOnlyMemberRow}>
        <EventMemberRow
          member={item}
          currentUserId={currentUserId}
          trailingLabel={item.id === hostId ? 'Host' : undefined}
        />
      </View>
    ),
    [currentUserId, hostId],
  );

  return (
    <Animated.FlatList<EventDetailMember>
      testID="read-only-event-details-list"
      data={isLoading || error ? [] : members}
      keyExtractor={(member) => String(member.id)}
      renderItem={renderItem}
      ItemSeparatorComponent={MemberSeparator}
      ListHeaderComponent={
        <>
          {hero}
          <View style={styles.readOnlyDetailsHeader}>
            {info}
            <ReadOnlyMembersHeading count={members.length} />
            <View style={styles.listContainer} />
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={styles.readOnlyMemberRow}>
          <ReadOnlyMembersStatus isLoading={isLoading} error={error} />
        </View>
      }
      ListFooterComponent={<View style={styles.readOnlyDetailsFooter} />}
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={contentContainerStyle}
    />
  );
};

export default ReadOnlyEventDetails;
