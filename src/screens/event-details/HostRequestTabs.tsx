import { useEffect, useState } from 'react';

import { View } from 'react-native';

import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import EmptyAcceptedIcon from '@assets/event-details/empty-accepted.svg';
import EmptyRequestIcon from '@assets/event-details/empty-request.svg';
import EmptyState from '@components/EmptyState';
import { EventMemberRow, EventRequestRow, EventRequestRowSeparator } from '@components/events';
import { SlidingTabs } from '@components/ui';
import { ChatJoinRequest } from '@context/ChatContext';

import styles from './EventDetailsScreen.styles';

type MemberLike = {
  id: number;
  name: string;
  avatar?: string;
};

type HostRequestTabsProps = {
  isSingleEvent: boolean;
  pendingRequests: ChatJoinRequest[];
  acceptedRequests: ChatJoinRequest[];
  confirmedMembers: MemberLike[];
  expandedRequestIds: Set<number>;
  acceptingUserId: number | null;
  decliningUserId: number | null;
  onToggleRequestExpanded: (requestId: number) => void;
  onAcceptRequest: (request: ChatJoinRequest) => void;
  onDeclineRequest: (request: ChatJoinRequest) => void;
  onRequesterPress: (request: ChatJoinRequest) => void;
  onOpenMemberMenu: (member: MemberLike) => void;
};

/**
 * Host-only tabs section for Event Details: `SlidingTabs` header plus the
 * animated two-page pager (both pages stay rendered; the row slides on tab
 * switch with a 280ms timing) for requests and accepted/member lists.
 */
const HostRequestTabs = ({
  isSingleEvent,
  pendingRequests,
  acceptedRequests,
  confirmedMembers,
  expandedRequestIds,
  acceptingUserId,
  decliningUserId,
  onToggleRequestExpanded,
  onAcceptRequest,
  onDeclineRequest,
  onRequesterPress,
  onOpenMemberMenu,
}: HostRequestTabsProps) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'accepted' | 'members'>('requests');
  const [pagerWidth, setPagerWidth] = useState(0);
  const pagerWidthSV = useSharedValue(0);
  const tabIndexSV = useSharedValue(0);
  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -tabIndexSV.value * pagerWidthSV.value }],
  }));

  useEffect(() => {
    if (isSingleEvent && activeTab === 'members') {
      setActiveTab('requests');
    }
    if (!isSingleEvent && activeTab === 'accepted') {
      setActiveTab('requests');
    }
  }, [activeTab, isSingleEvent]);

  return (
    <>
      {/* Tabs header + divider as one unit to avoid card gap */}
      <View>
        <SlidingTabs
          options={
            isSingleEvent
              ? [
                  { label: 'Requests', value: 'requests', count: pendingRequests.length },
                  {
                    label: 'Accepted',
                    value: 'accepted',
                    count: acceptedRequests.length,
                  },
                ]
              : [
                  { label: 'Requests', value: 'requests', count: pendingRequests.length },
                  { label: 'Members', value: 'members', count: confirmedMembers.length },
                ]
          }
          value={activeTab}
          onChange={(nextTab, index) => {
            tabIndexSV.value = withTiming(index, { duration: 280 });
            setActiveTab(nextTab as 'requests' | 'accepted' | 'members');
          }}
          testIDPrefix="event-details-tab"
        />
        <View style={[styles.divider, { marginVertical: 0 }]} />
      </View>

      {/* Inline pager: both pages always rendered, slide on tab switch */}
      <View
        style={[styles.listContainer, { overflow: 'hidden' }]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setPagerWidth(w);
          pagerWidthSV.value = w;
        }}
      >
        <Animated.View
          style={[
            { flexDirection: 'row', width: pagerWidth > 0 ? pagerWidth * 2 : '200%' },
            rowAnimStyle,
          ]}
        >
          {/* Page 0: Requests */}
          <View style={{ width: pagerWidth > 0 ? pagerWidth : '50%', minHeight: 200 }}>
            {pendingRequests.length === 0 ? (
              <EmptyState
                title="No requests yet"
                description="Join requests will appear here"
                icon={<EmptyRequestIcon width={64} height={64} />}
                style={{ marginTop: 32 }}
              />
            ) : (
              pendingRequests.map((request, index) => (
                <View key={request.id}>
                  <EventRequestRow
                    requester={request.requester}
                    message={request.message}
                    expanded={expandedRequestIds.has(request.id)}
                    onToggleExpanded={() => onToggleRequestExpanded(request.id)}
                    onAccept={() => onAcceptRequest(request)}
                    onDecline={() => onDeclineRequest(request)}
                    isAccepting={acceptingUserId === request.userId}
                    isDeclining={decliningUserId === request.userId}
                  />
                  {index < pendingRequests.length - 1 && <EventRequestRowSeparator />}
                </View>
              ))
            )}
          </View>

          {/* Page 1: Accepted (single event) or Members (group event) */}
          <View style={{ width: pagerWidth > 0 ? pagerWidth : '50%', minHeight: 200 }}>
            {isSingleEvent ? (
              acceptedRequests.length === 0 ? (
                <EmptyState
                  title="No accepted members yet"
                  description="Members you accept will appear here"
                  icon={<EmptyAcceptedIcon width={64} height={64} />}
                  style={{ marginTop: 32 }}
                />
              ) : (
                acceptedRequests.map((request) => (
                  <EventMemberRow
                    key={request.id}
                    member={request.requester}
                    onPress={() => onRequesterPress(request)}
                    onMenuPress={() => onOpenMemberMenu(request.requester)}
                  />
                ))
              )
            ) : confirmedMembers.length === 0 ? (
              <EmptyState
                title="No members yet"
                description="Members who join will appear here"
                icon={<EmptyAcceptedIcon width={64} height={64} />}
                style={{ marginTop: 32 }}
              />
            ) : (
              confirmedMembers.map((member) => (
                <EventMemberRow
                  key={member.id}
                  member={member}
                  onMenuPress={() => onOpenMemberMenu(member)}
                />
              ))
            )}
          </View>
        </Animated.View>
      </View>
    </>
  );
};

export default HostRequestTabs;
