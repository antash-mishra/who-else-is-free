import { useEffect, useState } from 'react';

import { View } from 'react-native';

import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import EmptyState from '@components/EmptyState';
import {
  EventMemberRow,
  EventMemberRowSeparator,
  EventRequestRow,
  EventRequestRowSeparator,
} from '@components/events';
import { SlidingTabs } from '@components/ui';
import { ChatJoinRequest } from '@context/ChatContext';

import styles from './EventDetailsScreen.styles';

// Shared illustration for both the Requests and Accepted/Members empty states.
const EMPTY_ILLUSTRATION = require('@assets/empty-state/members.png');
const EMPTY_ILLUSTRATION_WIDTH = 149;
const EMPTY_ILLUSTRATION_HEIGHT = 160;

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
          // Local trim (default 20) so the gap above the tabs is a 32px section
          // break (row paddingBottom 4 + 28) matching the rest of the card.
          style={{ paddingTop: 28 }}
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
                title="No requests"
                description="Join requests will appear here."
                imageSource={EMPTY_ILLUSTRATION}
                imageWidth={EMPTY_ILLUSTRATION_WIDTH}
                imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
                style={{ marginTop: -12 }}
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
                  title="No accepted requests"
                  description="People you accept will appear here."
                  imageSource={EMPTY_ILLUSTRATION}
                  imageWidth={EMPTY_ILLUSTRATION_WIDTH}
                  imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
                  style={{ marginTop: -12 }}
                />
              ) : (
                acceptedRequests.map((request, index) => (
                  <View key={request.id}>
                    <EventMemberRow
                      member={request.requester}
                      onPress={() => onRequesterPress(request)}
                      onMenuPress={() => onOpenMemberMenu(request.requester)}
                    />
                    {index < acceptedRequests.length - 1 && <EventMemberRowSeparator />}
                  </View>
                ))
              )
            ) : confirmedMembers.length === 0 ? (
              <EmptyState
                title="No members"
                description="People you accept will appear here."
                imageSource={EMPTY_ILLUSTRATION}
                imageWidth={EMPTY_ILLUSTRATION_WIDTH}
                imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
                style={{ marginTop: -12 }}
              />
            ) : (
              confirmedMembers.map((member, index) => (
                <View key={member.id}>
                  <EventMemberRow member={member} onMenuPress={() => onOpenMemberMenu(member)} />
                  {index < confirmedMembers.length - 1 && <EventMemberRowSeparator />}
                </View>
              ))
            )}
          </View>
        </Animated.View>
      </View>
    </>
  );
};

export default HostRequestTabs;
