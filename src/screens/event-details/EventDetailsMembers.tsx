import { ActivityIndicator, Text, View } from 'react-native';

import EmptyState from '@components/EmptyState';
import { EventMemberRow } from '@components/events';
import { SlidingTabs } from '@components/ui';
import { colors } from '@theme/index';

import styles from './EventDetailsScreen.styles';
import { EventDetailMember } from './useEventDetailsData';

// Shared illustration for the members empty state.
const EMPTY_ILLUSTRATION = require('@assets/illustration/empty-requested-accepted.png');
const EMPTY_ILLUSTRATION_WIDTH = 293;
const EMPTY_ILLUSTRATION_HEIGHT = 245;

type MemberLike = {
  id: number;
  name: string;
  avatar?: string;
};

type EventDetailsMembersProps =
  | {
      /** Overlay route: all group members with the host sorted to the top. */
      variant: 'overlay';
      members: MemberLike[];
      currentUserId?: number;
      isOwner: boolean;
      onOpenMemberMenu: (member: MemberLike) => void;
    }
  | {
      /** Read-only details: members fetched from the API with loading/error states. */
      variant: 'readOnly';
      members: EventDetailMember[];
      hostId: number;
      isLoading: boolean;
      error: string | null;
    };

/**
 * Members section for Event Details: the group overlay members list and the
 * read-only members list (with loading/error states) under a static
 * `SlidingTabs` header.
 */
const EventDetailsMembers = (props: EventDetailsMembersProps) => {
  if (props.variant === 'overlay') {
    const { members, currentUserId, isOwner, onOpenMemberMenu } = props;
    return (
      <>
        <View>
          <SlidingTabs
            options={[{ label: 'Members', value: 'members', count: members.length }]}
            value="members"
            testIDPrefix="event-details-overlay-tab"
          />
          <View style={[styles.divider, { marginVertical: 0 }]} />
        </View>
        <View style={styles.listContainer}>
          {members.length === 0 ? (
            <EmptyState
              title="No members yet"
              description="Members who join will appear here"
              imageSource={EMPTY_ILLUSTRATION}
              imageWidth={EMPTY_ILLUSTRATION_WIDTH}
              imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
              style={{ marginTop: 32 }}
            />
          ) : (
            members.map((member) => (
              <EventMemberRow
                key={member.id}
                member={member}
                trailingLabel={member.id === currentUserId && isOwner ? 'Host' : undefined}
                onMenuPress={
                  isOwner && member.id !== currentUserId
                    ? () => onOpenMemberMenu(member)
                    : undefined
                }
              />
            ))
          )}
        </View>
      </>
    );
  }

  const { members, hostId, isLoading, error } = props;
  return (
    <>
      <View>
        <SlidingTabs
          options={[{ label: 'Members', value: 'members', count: members.length }]}
          value="members"
          testIDPrefix="event-details-readonly-tab"
        />
        <View style={[styles.divider, { marginVertical: 0 }]} />
      </View>
      <View style={styles.listContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : error ? (
          <Text style={styles.emptyStateText}>{error}</Text>
        ) : members.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Members who join will appear here"
            imageSource={EMPTY_ILLUSTRATION}
            imageWidth={EMPTY_ILLUSTRATION_WIDTH}
            imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
            style={{ marginTop: 32 }}
          />
        ) : (
          members.map((member) => (
            <EventMemberRow
              key={member.id}
              member={member}
              trailingLabel={member.id === hostId ? 'Host' : undefined}
            />
          ))
        )}
      </View>
    </>
  );
};

export default EventDetailsMembers;
