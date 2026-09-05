/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect -- Reanimated pager shared values are intentionally mutated by gesture worklets, layout callbacks, and the group-type reset effect. */
import { useEffect, useState } from 'react';

import { View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeOutUp,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
const PAGE_CHANGE_DISTANCE = 50;
const PAGE_CHANGE_VELOCITY = 500;
const PAGE_TIMING = { duration: 280 } as const;

export const HOST_TABS_ACTIVE_OFFSET_X = [-12, 12] as const;
export const HOST_TABS_FAIL_OFFSET_Y = [-8, 8] as const;

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
  hostId?: number;
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
 * direction-locked two-page pager for requests and accepted/member lists.
 * Vertical motion fails the pager early so the parent Event Details ScrollView
 * owns scrolling from either page.
 */
const HostRequestTabs = ({
  isSingleEvent,
  pendingRequests,
  acceptedRequests,
  confirmedMembers,
  hostId,
  expandedRequestIds,
  acceptingUserId,
  decliningUserId,
  onToggleRequestExpanded,
  onAcceptRequest,
  onDeclineRequest,
  onRequesterPress,
  onOpenMemberMenu,
}: HostRequestTabsProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(0);
  const pagerWidthSV = useSharedValue(0);
  const activeIndexSV = useSharedValue(0);
  const dragStartXSV = useSharedValue(0);
  const pagerXSV = useSharedValue(0);
  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pagerXSV.value }],
  }));
  const secondTab = isSingleEvent ? 'accepted' : 'members';
  const activeTab = activeIndex === 0 ? 'requests' : secondTab;

  useEffect(() => {
    setActiveIndex(0);
    activeIndexSV.value = 0;
    pagerXSV.value = withTiming(0, PAGE_TIMING);
    // Reanimated shared-value objects are stable; this reset is only for an
    // actual group-type change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSingleEvent]);

  const completePageChange = (index: number) => {
    setActiveIndex(index);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([...HOST_TABS_ACTIVE_OFFSET_X])
    .failOffsetY([...HOST_TABS_FAIL_OFFSET_Y])
    .onBegin(() => {
      dragStartXSV.value = -activeIndexSV.value * pagerWidthSV.value;
    })
    .onUpdate((event) => {
      const width = pagerWidthSV.value;
      if (width <= 0) {
        return;
      }

      const nextX = dragStartXSV.value + event.translationX;
      pagerXSV.value = Math.max(-width, Math.min(0, nextX));
    })
    .onEnd((event) => {
      const width = pagerWidthSV.value;
      if (width <= 0) {
        return;
      }

      const current = activeIndexSV.value;
      const shouldMoveNext =
        current === 0 &&
        (event.translationX < -PAGE_CHANGE_DISTANCE || event.velocityX < -PAGE_CHANGE_VELOCITY);
      const shouldMovePrevious =
        current === 1 &&
        (event.translationX > PAGE_CHANGE_DISTANCE || event.velocityX > PAGE_CHANGE_VELOCITY);
      const nextIndex = shouldMoveNext ? 1 : shouldMovePrevious ? 0 : current;

      activeIndexSV.value = nextIndex;
      pagerXSV.value = withTiming(-nextIndex * width, PAGE_TIMING);
      if (nextIndex !== current) {
        runOnJS(completePageChange)(nextIndex);
      }
    })
    .onFinalize((_, success) => {
      if (!success) {
        pagerXSV.value = withTiming(-activeIndexSV.value * pagerWidthSV.value, PAGE_TIMING);
      }
    });

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
          onChange={(_nextTab, index) => {
            activeIndexSV.value = index;
            pagerXSV.value = withTiming(-index * pagerWidthSV.value, PAGE_TIMING);
            setActiveIndex(index);
          }}
          testIDPrefix="event-details-tab"
          // Local trim (default 20) so the gap above the tabs is a 32px section
          // break (row paddingBottom 4 + 28) matching the rest of the card.
          style={{ paddingTop: 28 }}
        />
        <View style={[styles.divider, { marginVertical: 0 }]} />
      </View>

      {/* Inline pager: both pages always rendered, slide on tab switch */}
      <GestureDetector gesture={panGesture}>
        <View
          testID="event-details-host-pager"
          style={[styles.listContainer, { overflow: 'hidden' }]}
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            setPagerWidth(width);
            pagerWidthSV.value = width;
            pagerXSV.value = -activeIndexSV.value * width;
          }}
        >
          <Animated.View
            style={[
              { flexDirection: 'row', width: pagerWidth > 0 ? pagerWidth * 2 : '200%' },
              rowAnimStyle,
            ]}
          >
            {/* Page 0: Requests */}
            <View
              testID="event-details-host-page-requests"
              accessibilityElementsHidden={activeIndex !== 0}
              importantForAccessibility={activeIndex === 0 ? 'auto' : 'no-hide-descendants'}
              pointerEvents={activeIndex === 0 ? 'auto' : 'none'}
              style={{ width: pagerWidth > 0 ? pagerWidth : '50%', minHeight: 200 }}
            >
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
                  <Animated.View
                    key={request.id}
                    exiting={FadeOutUp.duration(180)}
                    layout={LinearTransition.duration(220)}
                    testID={`request-exit-${request.id}`}
                  >
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
                  </Animated.View>
                ))
              )}
            </View>

            {/* Page 1: Accepted (single event) or Members (group event) */}
            <View
              testID="event-details-host-page-members"
              accessibilityElementsHidden={activeIndex !== 1}
              importantForAccessibility={activeIndex === 1 ? 'auto' : 'no-hide-descendants'}
              pointerEvents={activeIndex === 1 ? 'auto' : 'none'}
              style={{ width: pagerWidth > 0 ? pagerWidth : '50%', minHeight: 200 }}
            >
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
                    <EventMemberRow
                      member={member}
                      trailingLabel={member.id === hostId ? 'Host' : undefined}
                      onMenuPress={
                        member.id === hostId ? undefined : () => onOpenMemberMenu(member)
                      }
                    />
                    {index < confirmedMembers.length - 1 && <EventMemberRowSeparator />}
                  </View>
                ))
              )}
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
    </>
  );
};

export default HostRequestTabs;
