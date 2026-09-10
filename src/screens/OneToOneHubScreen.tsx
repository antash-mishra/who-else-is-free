import { useCallback, useMemo, useState } from 'react';

import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ChatEventHeader from '@components/ChatEventHeader';
import EmptyState from '@components/EmptyState';
import FullPageEmptyState from '@components/FullPageEmptyState';
import ScalePressable from '@components/ScalePressable';
import ScreenContainer from '@components/ScreenContainer';
import { CountBadge, UnreadDot } from '@components/ui';
import UserAvatar from '@components/UserAvatar';
import { useAuth } from '@context/AuthContext';
import { useChat, ChatJoinRequest } from '@context/ChatContext';
import { useCovers } from '@context/CoversContext';
import { useEvents } from '@context/EventsContext';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing, typography } from '@theme/index';
import { buildEventMemberSubtitle } from '@utils/chatHeaderSubtitle';

// Shared illustration for the request/accepted empty states.
const EMPTY_ILLUSTRATION = require('@assets/empty-state/members.png');
const EMPTY_ILLUSTRATION_WIDTH = 227;
const EMPTY_ILLUSTRATION_HEIGHT = 245;

type OneToOneHubRoute = RouteProp<RootStackParamList, 'OneToOneHub'>;
type OneToOneHubNavigation = NativeStackNavigationProp<RootStackParamList, 'OneToOneHub'>;

const OneToOneHubScreen = () => {
  const navigation = useNavigation<OneToOneHubNavigation>();
  const route = useRoute<OneToOneHubRoute>();
  const { getCoverSource } = useCovers();
  const { user } = useAuth();
  const { events } = useEvents();
  const { joinRequestsByConversation, refreshJoinRequests, setActiveConversation, conversations } =
    useChat();
  // `conversationId` is the request store key: a real 1:1 conversation id from
  // Messages, or the negative event id from Event Details / notifications when
  // no conversation exists yet.
  const { conversationId, eventId, title } = route.params;
  const requests = useMemo(
    () => joinRequestsByConversation[conversationId] ?? [],
    [conversationId, joinRequestsByConversation],
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const conversationById = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations],
  );

  const conversation = useMemo(
    () => conversationById.get(conversationId),
    [conversationById, conversationId],
  );

  const resolvedEvent = useMemo(
    () => events.find((event) => Number(event.id) === eventId) ?? null,
    [eventId, events],
  );

  const conversationEvent = conversation?.event ?? null;
  const resolvedTitle = resolvedEvent?.title ?? conversationEvent?.title ?? title;
  const resolvedCoverKey = resolvedEvent?.coverKey ?? conversationEvent?.coverKey ?? undefined;
  const resolvedSchedule = resolvedEvent ?? conversationEvent;

  const loadRequests = useCallback(
    async (showRefreshing: boolean) => {
      if (showRefreshing) {
        setIsRefreshing(true);
      }
      try {
        await refreshJoinRequests(conversationId, eventId, { includeApproved: true });
      } finally {
        if (showRefreshing) {
          setIsRefreshing(false);
        }
      }
    },
    [conversationId, eventId, refreshJoinRequests],
  );

  const handleRefresh = useCallback(() => {
    loadRequests(true).catch(() => undefined);
  }, [loadRequests]);

  useFocusEffect(
    useCallback(() => {
      loadRequests(false).catch(() => undefined);
    }, [loadRequests]),
  );

  const handleRequesterPress = useCallback(
    async (request: ChatJoinRequest & { conversationId?: number }) => {
      if (request.status !== 'approved' || !request.conversationId) return;
      triggerHaptic('light');
      setActiveConversation(request.conversationId);
      navigation.push('ChatThread');
    },
    [navigation, setActiveConversation],
  );

  const listEmpty = useMemo(
    () => (
      <EmptyState
        title="No accepted members yet"
        description="Chats from accepted members will appear here."
        imageSource={EMPTY_ILLUSTRATION}
        imageWidth={EMPTY_ILLUSTRATION_WIDTH}
        imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
      />
    ),
    [],
  );

  const getApprovedPreview = useCallback(
    (request: ChatJoinRequest & { conversationId?: number }) => {
      const conversation = request.conversationId
        ? conversationById.get(request.conversationId)
        : undefined;
      const lastMessage = conversation?.lastMessage;
      if (!lastMessage) {
        const intro = request.message.trim();
        return intro.length > 0 ? intro : 'No messages yet';
      }

      // System messages (event-update notices, join announcements) are
      // server-generated and already self-describing ("X joined the plan",
      // "Plan details updated"). Show the body as-is without a "Sender: "
      // prefix, which would otherwise produce awkward duplicates like
      // "Sumit: Sumit Narang joined the plan".
      if (lastMessage.kind === 'system') {
        return lastMessage.body;
      }

      if (lastMessage.senderId === user?.id) {
        return `You: ${lastMessage.body}`;
      }

      const senderFirstName =
        conversation?.participants
          .find((participant) => participant.id === lastMessage.senderId)
          ?.name?.split(' ')[0] ??
        request.requester.name.split(' ')[0] ??
        '';

      return `${senderFirstName}: ${lastMessage.body}`;
    },
    [conversationById, user?.id],
  );

  const displayRequests = useMemo(() => {
    return requests
      .filter((request) => request.status === 'approved')
      .sort((a, b) => {
        const aConvo = a.conversationId ? conversationById.get(a.conversationId) : undefined;
        const bConvo = b.conversationId ? conversationById.get(b.conversationId) : undefined;
        const rawATime = aConvo?.lastMessage
          ? Date.parse(aConvo.lastMessage.createdAt)
          : Date.parse(a.createdAt);
        const rawBTime = bConvo?.lastMessage
          ? Date.parse(bConvo.lastMessage.createdAt)
          : Date.parse(b.createdAt);
        const aTime = Number.isNaN(rawATime) ? 0 : rawATime;
        const bTime = Number.isNaN(rawBTime) ? 0 : rawBTime;
        return bTime - aTime;
      });
  }, [conversationById, requests]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  );

  // Header: plan cover, title, accepted count, and the pending-requests badge
  const render1to1Header = () => {
    return (
      <ChatEventHeader
        onBack={() => {
          triggerHaptic('light');
          navigation.goBack();
        }}
        title={resolvedTitle}
        subtitle={buildEventMemberSubtitle({
          groupType: 'Single',
          memberCount: displayRequests.length,
          schedule: resolvedSchedule,
        })}
        coverSource={getCoverSource(resolvedCoverKey)}
        onTitlePress={() => {
          triggerHaptic('light');
          navigation.navigate('EventDetailsOverlay', {
            eventId: String(eventId),
            readOnly: true,
          });
        }}
        rightElement={
          pendingRequests.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View pending requests"
              onPress={() => {
                triggerHaptic('light');
                navigation.navigate('JoinRequest', {
                  conversationId,
                  eventId,
                  includeApproved: true,
                });
              }}
              style={styles.joinIconButton}
            >
              <CountBadge count={pendingRequests.length} />
            </Pressable>
          ) : undefined
        }
        testID="join-requests-event-info-button"
      />
    );
  };

  // Accepted requester row: opens that member's 1:1 conversation
  const render1to1RequestItem = ({
    item,
  }: {
    item: ChatJoinRequest & { conversationId?: number };
  }) => {
    const previewText = getApprovedPreview(item);
    const convo = item.conversationId ? conversationById.get(item.conversationId) : undefined;
    const hasUnread = (convo?.unreadCount ?? 0) > 0;

    return (
      <ScalePressable
        style={styles.requestRow1to1}
        onPress={() => handleRequesterPress(item)}
        accessibilityLabel={`Open chat with ${item.requester.name}`}
      >
        {hasUnread && (
          <View style={styles.unreadDot1to1Wrap}>
            <UnreadDot />
          </View>
        )}
        <UserAvatar
          avatar={item.requester.avatar}
          name={item.requester.name}
          seed={item.userId}
          size={40}
        />
        <View style={styles.requestInfo1to1}>
          <Text style={[styles.requesterName1to1, hasUnread && styles.requesterName1to1Unread]}>
            {item.requester.name}
          </Text>
          <Text
            style={[styles.introMessage1to1, hasUnread && styles.introMessage1to1Unread]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
        </View>
      </ScalePressable>
    );
  };

  return (
    <View style={styles.screenRoot}>
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.container}>
          {render1to1Header()}
          <FlatList
            data={displayRequests}
            extraData={conversations}
            keyExtractor={(item) => String(item.id)}
            style={styles.flatList1to1}
            renderItem={render1to1RequestItem}
            ItemSeparatorComponent={() => <View style={styles.separator1to1} />}
            contentContainerStyle={
              displayRequests.length === 0 ? styles.listEmptyContent : styles.listContent1to1
            }
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
          />
        </View>
      </ScreenContainer>
      <FullPageEmptyState
        visible={displayRequests.length === 0}
        imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
        centered
      >
        {listEmpty}
      </FullPageEmptyState>
    </View>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'visible',
  },
  joinIconButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  // List styles
  listContent1to1: {
    paddingBottom: spacing.xl,
  },
  listEmptyContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator1to1: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 64, // avatar (40) + gap (8) + list marginLeft offset (16)
  },
  // 1:1 mode request row styles
  flatList1to1: {
    marginLeft: -spacing.md,
  },
  requestRow1to1: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  requestInfo1to1: {
    flex: 1,
  },
  requesterName1to1: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: -0.5,
    color: colors.text,
  },
  requesterName1to1Unread: {
    fontFamily: typography.fontFamilySemiBold,
  },
  introMessage1to1: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: -0.5,
    color: '#707070',
    marginTop: 2,
  },
  introMessage1to1Unread: {
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  unreadDot1to1Wrap: {
    position: 'absolute',
    left: 5,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});

export default OneToOneHubScreen;
