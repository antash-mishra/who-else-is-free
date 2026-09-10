import { useCallback, useEffect, useMemo, useState } from 'react';

import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import CloseIcon from '@assets/ui/close.svg';
import EmptyState from '@components/EmptyState';
import { EventRequestRow, EventRequestRowSeparator } from '@components/events';
import ScreenContainer from '@components/ScreenContainer';
import { IconButton } from '@components/ui';
import { useChat, ChatJoinRequest } from '@context/ChatContext';
import { RootStackParamList } from '@navigation/types';
import { colors, spacing, typography } from '@theme/index';

// Shared illustration for the request empty state.
const EMPTY_ILLUSTRATION = require('@assets/empty-state/members.png');
const EMPTY_ILLUSTRATION_WIDTH = 227;
const EMPTY_ILLUSTRATION_HEIGHT = 245;

type JoinRequestRoute = RouteProp<RootStackParamList, 'JoinRequest'>;
type JoinRequestNavigation = NativeStackNavigationProp<RootStackParamList, 'JoinRequest'>;

/**
 * The Requests sheet: the host's pending join requests for one plan. Opened
 * over the group chat thread, the 1:1 hub, and (via notification taps) on top
 * of whichever of those the request belongs to.
 */
const JoinRequestScreen = () => {
  const navigation = useNavigation<JoinRequestNavigation>();
  const route = useRoute<JoinRequestRoute>();
  const { joinRequestsByConversation, refreshJoinRequests, approveJoinRequest, denyJoinRequest } =
    useChat();
  const { conversationId, eventId, includeApproved = false } = route.params;
  // 1:1 requests can exist before any conversation does; they share the
  // negative-event-id store key used by OneToOneHub and Event Details.
  const requestStoreKey = conversationId ?? -eventId;
  const requests = useMemo(
    () => joinRequestsByConversation[requestStoreKey] ?? [],
    [joinRequestsByConversation, requestStoreKey],
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [acceptingUserId, setAcceptingUserId] = useState<number | null>(null);
  const [decliningUserId, setDecliningUserId] = useState<number | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(() => new Set());

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshJoinRequests(requestStoreKey, eventId, { includeApproved })
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  }, [eventId, includeApproved, refreshJoinRequests, requestStoreKey]);

  useEffect(() => {
    refreshJoinRequests(requestStoreKey, eventId, { includeApproved }).catch(() => undefined);
  }, [eventId, includeApproved, refreshJoinRequests, requestStoreKey]);

  const handleAccept = useCallback(
    async (request: ChatJoinRequest) => {
      setAcceptingUserId(request.userId);
      try {
        await approveJoinRequest(requestStoreKey, eventId, request.userId);
        await refreshJoinRequests(requestStoreKey, eventId, { includeApproved });
      } catch {
        // silently fail
      } finally {
        setAcceptingUserId(null);
      }
    },
    [approveJoinRequest, eventId, includeApproved, refreshJoinRequests, requestStoreKey],
  );

  const handleDecline = useCallback(
    async (request: ChatJoinRequest) => {
      setDecliningUserId(request.userId);
      try {
        await denyJoinRequest(requestStoreKey, eventId, request.userId);
        await refreshJoinRequests(requestStoreKey, eventId, { includeApproved });
      } catch {
        // silently fail
      } finally {
        setDecliningUserId(null);
      }
    },
    [denyJoinRequest, eventId, includeApproved, refreshJoinRequests, requestStoreKey],
  );

  const toggleRequestExpanded = (requestId: number) => {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Requests</Text>
          <IconButton
            icon={<CloseIcon width={18} height={18} color={colors.iconMuted} />}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close"
            size="sm"
            variant="soft"
          />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            pendingRequests.length === 0 ? styles.listEmptyContent : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {pendingRequests.length === 0 ? (
            <EmptyState
              title="No requests"
              description="Join requests will appear here."
              imageSource={EMPTY_ILLUSTRATION}
              imageWidth={EMPTY_ILLUSTRATION_WIDTH}
              imageHeight={EMPTY_ILLUSTRATION_HEIGHT}
            />
          ) : (
            pendingRequests.map((item, index) => (
              <View key={item.id}>
                <EventRequestRow
                  requester={{ ...item.requester, id: item.userId }}
                  message={item.message}
                  expanded={expandedRequestIds.has(item.id)}
                  onToggleExpanded={() => toggleRequestExpanded(item.id)}
                  onAccept={() => handleAccept(item)}
                  onDecline={() => handleDecline(item)}
                  isAccepting={acceptingUserId === item.userId}
                  isDeclining={decliningUserId === item.userId}
                />
                {index < pendingRequests.length - 1 && <EventRequestRowSeparator />}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.lg - spacing.md + 12,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: colors.text,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  listEmptyContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Shift the centered empty state up so it sits higher in the tall sheet.
    paddingBottom: 120,
  },
});

export default JoinRequestScreen;
