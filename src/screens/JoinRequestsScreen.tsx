import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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
import { useAuth } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";
import ScreenContainer from "@components/ScreenContainer";
import EventActionOverlay from "@components/EventActionOverlay";
import { COVER_OPTIONS } from "@constants/covers";
import { API_BASE_URL } from "@api/config";

type JoinRequestsRoute = RouteProp<RootStackParamList, "JoinRequests">;
type JoinRequestsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "JoinRequests"
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

const getCoverSource = (coverKey?: string) => {
  const option = COVER_OPTIONS.find((item) => item.key === coverKey);
  return option?.source ?? COVER_OPTIONS[0].source;
};

const JoinRequestsScreen = () => {
  const navigation = useNavigation<JoinRequestsNavigation>();
  const route = useRoute<JoinRequestsRoute>();
  const { token, authFetch, user } = useAuth();
  const {
    joinRequestsByConversation,
    refreshJoinRequests,
    approveJoinRequest,
    denyJoinRequest,
    setActiveConversation,
    conversations,
  } = useChat();
  const { conversationId, eventId, title, groupType, eventDetails } =
    route.params;
  const requests = joinRequestsByConversation[conversationId] ?? [];
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mode detection
  const is1to1Mode = groupType === "Single";

  // State for 1:1 mode menu and report overlays
  const [selectedRequest, setSelectedRequest] =
    useState<ChatJoinRequest | null>(null);
  const [showRequestMenu, setShowRequestMenu] = useState(false);
  const [showReportOverlay, setShowReportOverlay] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshJoinRequests(conversationId, eventId, {
      includeApproved: is1to1Mode,
    })
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  }, [conversationId, eventId, refreshJoinRequests, is1to1Mode]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const handleAction = useCallback(
    async (_requestId: number, userId: number, action: "approve" | "deny") => {
      try {
        if (action === "approve") {
          await approveJoinRequest(conversationId, eventId, userId);
        } else {
          await denyJoinRequest(conversationId, eventId, userId);
        }
        await refreshJoinRequests(conversationId, eventId, {
          includeApproved: is1to1Mode,
        });
      } catch (err) {
        Alert.alert(
          "Unable to update request",
          err instanceof Error ? err.message : "Please try again.",
        );
      }
    },
    [
      approveJoinRequest,
      conversationId,
      denyJoinRequest,
      eventId,
      is1to1Mode,
      refreshJoinRequests,
    ],
  );

  const handleRequesterPress = useCallback(
    async (request: ChatJoinRequest & { conversationId?: number }) => {
      if (request.status !== "approved" || !request.conversationId) return;
      setActiveConversation(request.conversationId);
      navigation.replace("ChatThread");
    },
    [navigation, setActiveConversation],
  );

  // 1:1 mode: handle 3-dot menu press
  const handleMenuPress = useCallback((request: ChatJoinRequest) => {
    setSelectedRequest(request);
    setShowRequestMenu(true);
  }, []);

  const handleReportFromMenu = useCallback(() => {
    setShowRequestMenu(false);
    setShowReportOverlay(true);
  }, []);

  const handleRemoveFromMenu = useCallback(async () => {
    if (!selectedRequest || isRemovingMember) return;
    setIsRemovingMember(true);
    setShowRequestMenu(false);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${eventId}/chat/members/${selectedRequest.userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to remove member.");
      }
      await refreshJoinRequests(conversationId, eventId, {
        includeApproved: is1to1Mode,
      });
    } catch (err) {
      Alert.alert(
        "Unable to remove member",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSelectedRequest(null);
      setIsRemovingMember(false);
    }
  }, [
    authFetch,
    conversationId,
    eventId,
    is1to1Mode,
    isRemovingMember,
    refreshJoinRequests,
    selectedRequest,
    token,
  ]);

  const handleSubmitReport = useCallback(async () => {
    if (!selectedRequest) return;
    setIsSubmittingReport(true);
    setReportError(null);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${eventId}/members/${selectedRequest.userId}/report`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: reportMessage }),
        },
      );
      if (!response.ok) throw new Error("Failed to report");
      setShowReportOverlay(false);
      setReportMessage("");
      await refreshJoinRequests(conversationId, eventId, {
        includeApproved: is1to1Mode,
      });
      setSelectedRequest(null);
    } catch (err) {
      setReportError("Failed to submit report. Please try again.");
    } finally {
      setIsSubmittingReport(false);
    }
  }, [
    authFetch,
    conversationId,
    eventId,
    is1to1Mode,
    refreshJoinRequests,
    reportMessage,
    selectedRequest,
    token,
  ]);

  // Close overlays
  const handleCloseMenu = useCallback(() => {
    setShowRequestMenu(false);
    setSelectedRequest(null);
  }, []);

  const handleCloseReportOverlay = useCallback(() => {
    setShowReportOverlay(false);
    setReportMessage("");
    setReportError(null);
  }, []);

  // Group mode empty state
  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {is1to1Mode ? "No accepted users yet" : "No pending requests"}
        </Text>
        {!is1to1Mode && (
          <Text style={styles.emptySubtitle}>
            You&apos;ll see new join requests here when attendees tap
            Interested.
          </Text>
        )}
      </View>
    ),
    [is1to1Mode],
  );

  const conversationById = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations],
  );

  const getApprovedPreview = useCallback(
    (request: ChatJoinRequest & { conversationId?: number }) => {
      const conversation = request.conversationId
        ? conversationById.get(request.conversationId)
        : undefined;
      const lastMessage = conversation?.lastMessage;
      if (!lastMessage) {
        const intro = request.message.trim();
        return intro.length > 0 ? intro : "No messages yet";
      }

      if (lastMessage.senderId === user?.id) {
        return `You: ${lastMessage.body}`;
      }

      const senderFirstName =
        conversation?.participants
          .find((participant) => participant.id === lastMessage.senderId)
          ?.name?.split(" ")[0] ??
        request.requester.name.split(" ")[0] ??
        "";

      return `${senderFirstName}: ${lastMessage.body}`;
    },
    [conversationById, user?.id],
  );

  const displayRequests = useMemo(() => {
    if (!is1to1Mode) {
      return requests;
    }
    return requests
      .filter((request) => request.status === "approved")
      .sort((a, b) => {
        const aConvo = a.conversationId
          ? conversationById.get(a.conversationId)
          : undefined;
        const bConvo = b.conversationId
          ? conversationById.get(b.conversationId)
          : undefined;
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

  // 1:1 mode header
  const render1to1Header = () => {
    if (!eventDetails) return null;
    const coverSource = getCoverSource(eventDetails.coverKey);
    const subtitle = `${eventDetails.dateLabel}, ${eventDetails.time} at ${eventDetails.location}`;

    return (
      <View style={styles.header1to1}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Image source={coverSource} style={styles.headerCoverImage} />
        <View style={styles.headerCopy1to1}>
          <Text style={styles.headerTitle1to1} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle1to1} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {displayRequests.length > 0 && (
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{displayRequests.length}</Text>
          </View>
        )}
      </View>
    );
  };

  // 1:1 mode request item
  const render1to1RequestItem = ({
    item,
  }: {
    item: ChatJoinRequest & { conversationId?: number };
  }) => {
    const initial = item.requester.name?.charAt(0).toUpperCase() ?? "?";
    const avatarColor = getAvatarColor(item.userId);
    const previewText = getApprovedPreview(item);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.requestRow1to1,
          pressed && styles.requestRowPressed,
        ]}
        onPress={() => handleRequesterPress(item)}
      >
        <View style={[styles.avatar1to1, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.requestInfo1to1}>
          <Text style={styles.requesterName1to1}>{item.requester.name}</Text>
          <Text style={styles.introMessage1to1} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => handleMenuPress(item)}
          style={styles.menuButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="more-horizontal" size={20} color={colors.subText} />
        </Pressable>
      </Pressable>
    );
  };

  // Group mode header
  const renderGroupHeader = () => (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <Feather name="chevron-left" size={24} color={colors.text} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>Join Requests</Text>
      </View>
    </View>
  );

  // Group mode request item
  const renderGroupRequestItem = ({ item }: { item: ChatJoinRequest }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{item.requester.name}</Text>
        <Text style={styles.cardTime}>
          {new Date(item.createdAt).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      {item.message ? (
        <Text style={styles.cardMessage}>{item.message}</Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable
          onPress={() => handleAction(item.id, item.userId, "deny")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>Decline</Text>
        </Pressable>
        <Pressable
          onPress={() => handleAction(item.id, item.userId, "approve")}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryLabel}>Accept</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <View style={styles.container}>
        {is1to1Mode ? render1to1Header() : renderGroupHeader()}
        <FlatList
          data={displayRequests}
          keyExtractor={(item) => String(item.id)}
          renderItem={is1to1Mode ? render1to1RequestItem : renderGroupRequestItem}
          ItemSeparatorComponent={() => (
            <View
              style={is1to1Mode ? styles.separator1to1 : styles.separator}
            />
          )}
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

      {/* 1:1 mode: Request menu overlay */}
      <EventActionOverlay
        isVisible={showRequestMenu}
        onBackdropPress={handleCloseMenu}
        type="menu"
        items={[
          {
            label: "Report Member",
            onPress: handleReportFromMenu,
          },
          {
            label: "Remove Member",
            onPress: handleRemoveFromMenu,
            loading: isRemovingMember,
            destructive: true,
          },
        ]}
      />

      {/* 1:1 mode: Report overlay */}
      <EventActionOverlay
        isVisible={showReportOverlay}
        onBackdropPress={handleCloseReportOverlay}
        type="report"
        reportMessage={reportMessage}
        onReportMessageChange={setReportMessage}
        onSubmitReport={handleSubmitReport}
        reportError={reportError}
        reportSubmitting={isSubmittingReport}
        reportDisabled={!reportMessage.trim()}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Group mode header styles
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.body,
    color: colors.subText,
    marginTop: spacing.xs,
  },
  // 1:1 mode header styles
  header1to1: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerCoverImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  headerCopy1to1: {
    flex: 1,
  },
  headerTitle1to1: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: "500",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#000000",
  },
  headerSubtitle1to1: {
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
    marginTop: 2,
  },
  badgeContainer: {
    backgroundColor: "#E6E6E6",
    borderRadius: 24,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  badgeText: {
    fontSize: 15,
    fontFamily: typography.fontFamilySemiBold,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    color: "#494949",
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
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: spacing.md,
  },
  separator1to1: {
    height: 1,
    backgroundColor: colors.border,
  },
  // Group mode card styles
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardName: {
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    fontSize: typography.subtitle,
  },
  cardTime: {
    fontSize: typography.caption,
    color: colors.subText,
  },
  cardMessage: {
    fontSize: typography.body,
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  secondaryButtonPressed: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  secondaryLabel: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryLabel: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
  },
  // 1:1 mode request row styles
  requestRow1to1: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  requestRowPressed: {
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  avatar1to1: {
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
  requestInfo1to1: {
    flex: 1,
  },
  pendingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  requesterName1to1: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: "500",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#000000",
  },
  introMessage1to1: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
    marginTop: 2,
  },
  menuButton: {
    padding: spacing.xs,
  },
  // Empty state styles
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
  emptySubtitle: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: typography.body,
    color: colors.subText,
    textAlign: "center",
  },
});

export default JoinRequestsScreen;
