import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, typography } from "@theme/index";
import { useChat, ChatJoinRequest } from "@context/ChatContext";
import { RootStackParamList } from "@navigation/types";
import ScreenContainer from "@components/ScreenContainer";

type PendingRequestsRoute = RouteProp<RootStackParamList, "PendingRequests">;
type PendingRequestsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "PendingRequests"
>;

const AVATAR_COLORS = [
  "#4CAF50",
  "#9C27B0",
  "#FF9800",
  "#2196F3",
  "#E91E63",
  "#00BCD4",
  "#8BC34A",
  "#673AB7",
];

const getAvatarColor = (userId: number) =>
  AVATAR_COLORS[userId % AVATAR_COLORS.length];

const PendingRequestsScreen = () => {
  const navigation = useNavigation<PendingRequestsNavigation>();
  const route = useRoute<PendingRequestsRoute>();
  const {
    joinRequestsByConversation,
    refreshJoinRequests,
    approveJoinRequest,
    denyJoinRequest,
  } = useChat();
  const { conversationId, eventId } = route.params;
  const requests = joinRequestsByConversation[conversationId] ?? [];
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [acceptingUserId, setAcceptingUserId] = useState<number | null>(null);
  const [decliningUserId, setDecliningUserId] = useState<number | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(
    () => new Set(),
  );

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshJoinRequests(conversationId, eventId)
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  }, [conversationId, eventId, refreshJoinRequests]);

  useEffect(() => {
    refreshJoinRequests(conversationId, eventId).catch(() => undefined);
  }, [conversationId, eventId, refreshJoinRequests]);

  const handleAccept = useCallback(
    async (request: ChatJoinRequest) => {
      setAcceptingUserId(request.userId);
      try {
        await approveJoinRequest(conversationId, eventId, request.userId);
        await refreshJoinRequests(conversationId, eventId);
      } catch {
        // silently fail
      } finally {
        setAcceptingUserId(null);
      }
    },
    [approveJoinRequest, conversationId, eventId, refreshJoinRequests],
  );

  const handleDecline = useCallback(
    async (request: ChatJoinRequest) => {
      setDecliningUserId(request.userId);
      try {
        await denyJoinRequest(conversationId, eventId, request.userId);
        await refreshJoinRequests(conversationId, eventId);
      } catch {
        // silently fail
      } finally {
        setDecliningUserId(null);
      }
    },
    [conversationId, denyJoinRequest, eventId, refreshJoinRequests],
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

  const renderItem = ({ item }: { item: ChatJoinRequest }) => {
    const initial = item.requester.name?.charAt(0).toUpperCase() ?? "?";
    const avatarColor = getAvatarColor(item.userId);
    const isExpanded = expandedRequestIds.has(item.id);
    const isAccepting = acceptingUserId === item.userId;
    const isDeclining = decliningUserId === item.userId;
    const isLoading = isAccepting || isDeclining;

    return (
      <View style={styles.requestItem}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.requestContent}>
          <Text style={styles.requestName}>{item.requester.name}</Text>
          <Text
            style={styles.requestMessage}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {item.message}
          </Text>
          {!isExpanded && item.message.length > 100 && (
            <Text
              style={styles.seeMoreText}
              onPress={() => toggleRequestExpanded(item.id)}
            >
              See more
            </Text>
          )}
        </View>

        <View style={styles.requestActions}>
          <Pressable
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => handleDecline(item)}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Decline request"
          >
            {isDeclining ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Feather name="x" size={18} color={colors.text} />
            )}
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => handleAccept(item)}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Accept request"
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color={colors.buttonText} />
            ) : (
              <Feather name="check" size={18} color={colors.buttonText} />
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No pending requests</Text>
      </View>
    ),
    [],
  );

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={24} color="#707070" />
          </Pressable>
          <Text style={styles.headerTitle}>
            Requests ({pendingRequests.length})
          </Text>
        </View>
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={
            pendingRequests.length === 0
              ? styles.listEmptyContent
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
  },
  header: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: "500",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#000000",
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  listEmptyContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: "#FFFFFF",
  },
  requestContent: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.5,
  },
  requestMessage: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: "#707070",
    lineHeight: 20,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#707070",
    lineHeight: 20,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginTop: spacing.xs,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  declineButton: {
    backgroundColor: "#E6E6E6",
  },
  acceptButton: {
    backgroundColor: colors.text,
  },
  emptyState: {
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.title,
    color: colors.text,
    textAlign: "center",
  },
});

export default PendingRequestsScreen;
