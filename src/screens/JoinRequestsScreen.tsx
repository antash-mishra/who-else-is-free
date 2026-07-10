import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AcceptIcon from '@assets/event-details/accept.svg';
import RejectIcon from '@assets/event-details/reject.svg';
import EmptyState from '@components/EmptyState';

import { colors, spacing, typography } from '@theme/index';
import { useChat, ChatJoinRequest } from '@context/ChatContext';
import { useAuth } from '@context/AuthContext';
import { useEvents } from '@context/EventsContext';
import { RootStackParamList } from '@navigation/types';
import ScreenContainer from '@components/ScreenContainer';
import ChatEventHeader from '@components/ChatEventHeader';
import { CountBadge, UnreadDot } from '@components/ui';
import UserAvatar from '@components/UserAvatar';
import { useCovers } from '@context/CoversContext';
import { triggerHaptic } from '@services/haptics';
import { buildEventMemberSubtitle } from '@utils/chatHeaderSubtitle';

// Shared illustration for the request/accepted empty states.
const EMPTY_ILLUSTRATION = require('@assets/illustration/empty-requested-accepted.png');
const EMPTY_ILLUSTRATION_WIDTH = 293;
const EMPTY_ILLUSTRATION_HEIGHT = 245;

type JoinRequestsRoute = RouteProp<RootStackParamList, 'JoinRequests'>;
type JoinRequestsNavigation = NativeStackNavigationProp<RootStackParamList, 'JoinRequests'>;

const JoinRequestsScreen = () => {
  const navigation = useNavigation<JoinRequestsNavigation>();
  const route = useRoute<JoinRequestsRoute>();
  const { getCoverSource } = useCovers();
  const { user } = useAuth();
  const { events } = useEvents();
  const {
    joinRequestsByConversation,
    refreshJoinRequests,
    approveJoinRequest,
    denyJoinRequest,
    setActiveConversation,
    conversations,
  } = useChat();
  const { conversationId, eventId, title, groupType } = route.params;
  const requests = joinRequestsByConversation[conversationId] ?? [];
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
  const resolvedGroupType = resolvedEvent?.groupType ?? conversationEvent?.groupType ?? groupType;
  const is1to1Mode = resolvedGroupType === 'Single';
  const resolvedTitle = resolvedEvent?.title ?? conversationEvent?.title ?? title;
  const resolvedCoverKey = resolvedEvent?.coverKey ?? conversationEvent?.coverKey ?? undefined;
  const resolvedSchedule = resolvedEvent ?? conversationEvent;

  const loadRequests = useCallback(
    async (showRefreshing: boolean) => {
      if (showRefreshing) {
        setIsRefreshing(true);
      }
      try {
        await refreshJoinRequests(conversationId, eventId, {
          includeApproved: is1to1Mode,
        });
      } finally {
        if (showRefreshing) {
          setIsRefreshing(false);
        }
      }
    },
    [conversationId, eventId, refreshJoinRequests, is1to1Mode],
  );

  const handleRefresh = useCallback(() => {
    loadRequests(true).catch(() => undefined);
  }, [loadRequests]);

  useFocusEffect(
    useCallback(() => {
      loadRequests(false).catch(() => undefined);
    }, [loadRequests]),
  );

  const handleAction = useCallback(
    async (_requestId: number, userId: number, action: 'approve' | 'deny') => {
      try {
        if (action === 'approve') {
          await approveJoinRequest(conversationId, eventId, userId);
        } else {
          await denyJoinRequest(conversationId, eventId, userId);
        }
        await refreshJoinRequests(conversationId, eventId, {
          includeApproved: is1to1Mode,
        });
      } catch (err) {
        Alert.alert(
          'Unable to update request',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    },
    [approveJoinRequest, conversationId, denyJoinRequest, eventId, is1to1Mode, refreshJoinRequests],
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
    () =>
      is1to1Mode ? (
        <EmptyState
          title="No accepted members yet"
          description="Chats from accepted members will appear here"
          imageSource={EMPTY_ILLUSTRATION}
          imageWidth={EMPTY_ILLUSTRATION_WIDTH}
          imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
          style={{ marginTop: 32 }}
        />
      ) : (
        <EmptyState
          title="No pending requests"
          description="You'll see new join requests here when attendees tap Interested."
          imageSource={EMPTY_ILLUSTRATION}
          imageWidth={EMPTY_ILLUSTRATION_WIDTH}
          imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
          style={{ marginTop: 32 }}
        />
      ),
    [is1to1Mode],
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
      // server-generated and already self-describing ("X joined the chat",
      // "Updated Event Detail"). Show the body as-is without a "Sender: "
      // prefix, which would otherwise produce awkward duplicates like
      // "Sumit: Sumit Narang joined the chat".
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
    if (!is1to1Mode) {
      return requests;
    }
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
  }, [conversationById, is1to1Mode, requests]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  );

  // 1:1 mode header
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
          memberCount: displayRequests.length + 1,
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
                navigation.navigate('PendingRequests', {
                  conversationId,
                  eventId,
                  includeApproved: is1to1Mode,
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

  // 1:1 mode request item
  const render1to1RequestItem = ({
    item,
  }: {
    item: ChatJoinRequest & { conversationId?: number };
  }) => {
    const previewText = getApprovedPreview(item);
    const convo = item.conversationId ? conversationById.get(item.conversationId) : undefined;
    const hasUnread = (convo?.unreadCount ?? 0) > 0;

    return (
      <Pressable
        style={({ pressed }) => [styles.requestRow1to1, pressed && styles.requestRowPressed]}
        onPress={() => handleRequesterPress(item)}
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
      </Pressable>
    );
  };

  // Group mode header
  const renderGroupHeader = () => (
    <ChatEventHeader
      onBack={() => {
        triggerHaptic('light');
        navigation.goBack();
      }}
      title={resolvedTitle}
      subtitle={buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: conversation?.memberIds.length ?? 0,
        schedule: resolvedSchedule,
      })}
      onTitlePress={() => {
        triggerHaptic('light');
        navigation.navigate('EventDetailsOverlay', {
          eventId: String(eventId),
          readOnly: true,
        });
      }}
      testID="join-requests-group-event-info-button"
    />
  );

  // Group mode request item
  const renderGroupRequestItem = ({ item }: { item: ChatJoinRequest }) => {
    return (
      <View style={styles.requestItem}>
        <UserAvatar
          avatar={item.requester.avatar}
          name={item.requester.name}
          seed={item.userId}
          size={40}
        />
        <View style={styles.requestContent}>
          <Text style={styles.requestName}>{item.requester.name}</Text>
          {item.message ? <Text style={styles.requestMessage}>{item.message}</Text> : null}
        </View>
        <View style={styles.requestActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decline request from ${item.requester.name}`}
            onPress={() => {
              triggerHaptic('destructive');
              handleAction(item.id, item.userId, 'deny');
            }}
            style={styles.declineButton}
          >
            <RejectIcon width={30} height={30} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Accept request from ${item.requester.name}`}
            onPress={() => {
              triggerHaptic('submit');
              handleAction(item.id, item.userId, 'approve');
            }}
            style={styles.acceptButton}
          >
            <AcceptIcon width={30} height={30} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.container}>
        {is1to1Mode ? render1to1Header() : renderGroupHeader()}
        <FlatList
          data={displayRequests}
          extraData={conversations}
          keyExtractor={(item) => String(item.id)}
          style={is1to1Mode ? styles.flatList1to1 : undefined}
          renderItem={is1to1Mode ? render1to1RequestItem : renderGroupRequestItem}
          ItemSeparatorComponent={() => (
            <View style={is1to1Mode ? styles.separator1to1 : styles.separator} />
          )}
          ListFooterComponent={
            displayRequests.length > 0 ? (
              <View style={is1to1Mode ? styles.separator1to1 : styles.separator} />
            ) : null
          }
          contentContainerStyle={
            displayRequests.length === 0
              ? styles.listEmptyContent
              : is1to1Mode
                ? styles.listContent1to1
                : styles.listContent
          }
          ListEmptyComponent={listEmpty}
          onRefresh={handleRefresh}
          refreshing={isRefreshing}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
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
  listContent: {
    paddingBottom: spacing.xl,
  },
  listContent1to1: {
    paddingBottom: spacing.xl,
  },
  listEmptyContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 48, // avatar (40) + gap (8) — align after the avatar
  },
  separator1to1: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 64, // avatar (40) + gap (8) + list marginLeft offset (16)
  },
  // Group mode request item styles
  requestItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  requestContent: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  requestMessage: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: '#000000',
    lineHeight: 22,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E6E6E6',
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.text,
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
  requestRowPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  requestInfo1to1: {
    flex: 1,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requesterName1to1: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: -0.5,
    color: '#000000',
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

export default JoinRequestsScreen;
