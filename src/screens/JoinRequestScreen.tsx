import { useCallback, useMemo, useState } from 'react';

import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ChatEventHeader from '@components/ChatEventHeader';
import EmptyState from '@components/EmptyState';
import { EventRequestRow, EventRequestRowSeparator } from '@components/events';
import FullPageEmptyState from '@components/FullPageEmptyState';
import ScreenContainer from '@components/ScreenContainer';
import { useChat, ChatJoinRequest } from '@context/ChatContext';
import { useCovers } from '@context/CoversContext';
import { useEvents } from '@context/EventsContext';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing } from '@theme/index';
import { buildEventMemberSubtitle } from '@utils/chatHeaderSubtitle';

const EMPTY_ILLUSTRATION = require('@assets/empty-state/members.png');
const EMPTY_ILLUSTRATION_WIDTH = 227;
const EMPTY_ILLUSTRATION_HEIGHT = 245;

type JoinRequestRoute = RouteProp<RootStackParamList, 'JoinRequest'>;
type JoinRequestNavigation = NativeStackNavigationProp<RootStackParamList, 'JoinRequest'>;

const JoinRequestScreen = () => {
  const navigation = useNavigation<JoinRequestNavigation>();
  const route = useRoute<JoinRequestRoute>();
  const { conversationId, eventId, title } = route.params;
  const requestStoreKey = conversationId ?? -eventId;
  const { getCoverSource } = useCovers();
  const { events, refreshEvents } = useEvents();
  const {
    approveJoinRequest,
    conversations,
    denyJoinRequest,
    joinRequestsByConversation,
    refreshJoinRequests,
  } = useChat();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [acceptingUserId, setAcceptingUserId] = useState<number | null>(null);
  const [decliningUserId, setDecliningUserId] = useState<number | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(() => new Set());

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversationId, conversations],
  );
  const event = useMemo(
    () => events.find((item) => Number(item.id) === eventId) ?? conversation?.event ?? null,
    [conversation?.event, eventId, events],
  );
  const pendingRequests = useMemo(
    () =>
      (joinRequestsByConversation[requestStoreKey] ?? []).filter(
        (request) => request.status === 'pending',
      ),
    [joinRequestsByConversation, requestStoreKey],
  );

  const loadRequests = useCallback(
    async (showRefreshing: boolean) => {
      if (showRefreshing) setIsRefreshing(true);
      try {
        await refreshJoinRequests(requestStoreKey, eventId, { includeApproved: false });
      } finally {
        if (showRefreshing) setIsRefreshing(false);
      }
    },
    [eventId, refreshJoinRequests, requestStoreKey],
  );

  useFocusEffect(
    useCallback(() => {
      refreshEvents().catch(() => undefined);
      loadRequests(false).catch(() => undefined);
    }, [loadRequests, refreshEvents]),
  );

  const handleAccept = useCallback(
    async (request: ChatJoinRequest) => {
      setAcceptingUserId(request.userId);
      try {
        await approveJoinRequest(requestStoreKey, eventId, request.userId);
        await refreshJoinRequests(requestStoreKey, eventId, { includeApproved: false });
      } catch (err) {
        Alert.alert(
          'Unable to update request',
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        setAcceptingUserId(null);
      }
    },
    [approveJoinRequest, eventId, refreshJoinRequests, requestStoreKey],
  );

  const handleDecline = useCallback(
    async (request: ChatJoinRequest) => {
      setDecliningUserId(request.userId);
      try {
        await denyJoinRequest(requestStoreKey, eventId, request.userId);
        await refreshJoinRequests(requestStoreKey, eventId, { includeApproved: false });
      } catch (err) {
        Alert.alert(
          'Unable to update request',
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        setDecliningUserId(null);
      }
    },
    [denyJoinRequest, eventId, refreshJoinRequests, requestStoreKey],
  );

  const toggleExpanded = useCallback((requestId: number) => {
    setExpandedRequestIds((current) => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  }, []);

  const groupType = event?.groupType === 'Single' ? 'Single' : 'Group';
  const memberCount = conversation?.memberIds.length ?? 1;
  const resolvedTitle = event?.title ?? title;

  return (
    <View style={styles.screenRoot}>
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.container}>
          <ChatEventHeader
            onBack={() => {
              triggerHaptic('light');
              navigation.goBack();
            }}
            title={resolvedTitle}
            subtitle={buildEventMemberSubtitle({
              groupType,
              memberCount,
              schedule: event,
            })}
            coverSource={getCoverSource(event?.coverKey ?? undefined)}
          />
          <FlatList
            data={pendingRequests}
            keyExtractor={(request) => String(request.id)}
            renderItem={({ item }) => (
              <EventRequestRow
                requester={{ ...item.requester, id: item.userId }}
                message={item.message}
                expanded={expandedRequestIds.has(item.id)}
                onToggleExpanded={() => toggleExpanded(item.id)}
                onAccept={() => handleAccept(item)}
                onDecline={() => handleDecline(item)}
                isAccepting={acceptingUserId === item.userId}
                isDeclining={decliningUserId === item.userId}
                testID={`join-request-${item.id}`}
              />
            )}
            ItemSeparatorComponent={EventRequestRowSeparator}
            contentContainerStyle={
              pendingRequests.length === 0 ? styles.emptyListContent : styles.listContent
            }
            refreshing={isRefreshing}
            onRefresh={() => loadRequests(true).catch(() => undefined)}
          />
        </View>
      </ScreenContainer>
      <FullPageEmptyState
        visible={pendingRequests.length === 0}
        imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
      >
        <EmptyState
          title="No requests"
          description="Join requests will appear here."
          imageSource={EMPTY_ILLUSTRATION}
          imageWidth={EMPTY_ILLUSTRATION_WIDTH}
          imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
        />
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
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyListContent: {
    flexGrow: 1,
  },
});

export default JoinRequestScreen;
