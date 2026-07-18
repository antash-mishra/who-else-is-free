import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CloseIcon from '@assets/ui/close.svg';

import { colors, spacing, typography } from '@theme/index';
import { useChat, ChatJoinRequest } from '@context/ChatContext';
import { RootStackParamList } from '@navigation/types';
import EmptyState from '@components/EmptyState';
import ScreenContainer from '@components/ScreenContainer';
import { EventRequestRow, EventRequestRowSeparator } from '@components/events';
import { IconButton } from '@components/ui';

// Shared illustration for the request empty state.
const EMPTY_ILLUSTRATION = require('@assets/empty-state/members.png');
const EMPTY_ILLUSTRATION_WIDTH = 149;
const EMPTY_ILLUSTRATION_HEIGHT = 160;

type PendingRequestsRoute = RouteProp<RootStackParamList, 'PendingRequests'>;
type PendingRequestsNavigation = NativeStackNavigationProp<RootStackParamList, 'PendingRequests'>;

const PendingRequestsScreen = () => {
  const navigation = useNavigation<PendingRequestsNavigation>();
  const route = useRoute<PendingRequestsRoute>();
  const { joinRequestsByConversation, refreshJoinRequests, approveJoinRequest, denyJoinRequest } =
    useChat();
  const { conversationId, eventId, includeApproved = false } = route.params;
  const requests = joinRequestsByConversation[conversationId] ?? [];
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
    refreshJoinRequests(conversationId, eventId, { includeApproved })
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  }, [conversationId, eventId, includeApproved, refreshJoinRequests]);

  useEffect(() => {
    refreshJoinRequests(conversationId, eventId, { includeApproved }).catch(() => undefined);
  }, [conversationId, eventId, includeApproved, refreshJoinRequests]);

  const handleAccept = useCallback(
    async (request: ChatJoinRequest) => {
      setAcceptingUserId(request.userId);
      try {
        await approveJoinRequest(conversationId, eventId, request.userId);
        await refreshJoinRequests(conversationId, eventId, { includeApproved });
      } catch {
        // silently fail
      } finally {
        setAcceptingUserId(null);
      }
    },
    [approveJoinRequest, conversationId, eventId, includeApproved, refreshJoinRequests],
  );

  const handleDecline = useCallback(
    async (request: ChatJoinRequest) => {
      setDecliningUserId(request.userId);
      try {
        await denyJoinRequest(conversationId, eventId, request.userId);
        await refreshJoinRequests(conversationId, eventId, { includeApproved });
      } catch {
        // silently fail
      } finally {
        setDecliningUserId(null);
      }
    },
    [conversationId, denyJoinRequest, eventId, includeApproved, refreshJoinRequests],
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
            accessibilityLabel="Close pending requests"
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
              title="No pending requests"
              description="Join requests will appear here"
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
  },
});

export default PendingRequestsScreen;
