import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import * as Haptics from "expo-haptics";

import { colors, spacing, typography } from "@theme/index";
import { useChat, ChatJoinRequest } from "@context/ChatContext";
import { RootStackParamList } from "@navigation/types";
import ScreenContainer from "@components/ScreenContainer";
import UserAvatar from "@components/UserAvatar";

type PendingRequestsRoute = RouteProp<RootStackParamList, "PendingRequests">;
type PendingRequestsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "PendingRequests"
>;

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

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Requests
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
            style={styles.closeButton}
            hitSlop={12}
          >
            <Feather name="x" size={18} color="#999999" />
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            pendingRequests.length === 0
              ? styles.listEmptyContent
              : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
        >
          {pendingRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No pending requests</Text>
            </View>
          ) : (
            pendingRequests.map((item, index) => {
              const isExpanded = expandedRequestIds.has(item.id);
              const isAccepting = acceptingUserId === item.userId;
              const isDeclining = decliningUserId === item.userId;
              const isLoading = isAccepting || isDeclining;

              return (
                <View key={item.id}>
                  <View style={styles.requestItem}>
                    <UserAvatar
                      avatar={item.requester.avatar}
                      name={item.requester.name}
                      seed={item.userId}
                      size={40}
                    />

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
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleRequestExpanded(item.id); }}
                        >
                          See more
                        </Text>
                      )}
                    </View>

                    <View style={styles.requestActions}>
                      <Pressable
                        style={[styles.actionButton, styles.declineButton]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleDecline(item); }}
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
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleAccept(item); }}
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
                  {index < pendingRequests.length - 1 && (
                    <View style={styles.separator} />
                  )}
                </View>
              );
            })
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 80,
    backgroundColor: "rgba(120, 120, 128, 0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: 24,
    letterSpacing: -0.5,
    color: "rgba(0, 0, 0, 1)",
  },
  listContent: {
    paddingTop: spacing.md,
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
    marginLeft: 48, // avatar (40) + gap (8)
    marginTop: spacing.sm + 6,
    marginBottom: spacing.sm + 6,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    color: "#000000",
    lineHeight: 22,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#707070",
    lineHeight: 20,
    letterSpacing: -0.3,
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
