import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MoreHorizontalIcon from "@assets/ui/more-horizontal.svg";
import AcceptIcon from "@assets/event-details/accept.svg";
import RejectIcon from "@assets/event-details/reject.svg";

import * as Haptics from "expo-haptics";

import { colors, spacing, typography } from "@theme/index";
import { useChat, ChatJoinRequest } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import { useEvents } from "@context/EventsContext";
import { RootStackParamList } from "@navigation/types";
import ScreenContainer from "@components/ScreenContainer";
import ChatEventHeader from "@components/ChatEventHeader";
import EventActionOverlay from "@components/EventActionOverlay";
import UserAvatar from "@components/UserAvatar";
import { COVER_OPTIONS } from "@constants/covers";
import { API_BASE_URL } from "@api/config";
import { formatAbsoluteDateLabel } from "@utils/dateTime";

type JoinRequestsRoute = RouteProp<RootStackParamList, "JoinRequests">;
type JoinRequestsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "JoinRequests"
>;

const getCoverSource = (coverKey?: string) => {
  const option = COVER_OPTIONS.find((item) => item.key === coverKey);
  return option?.source ?? COVER_OPTIONS[0].source;
};

const JoinRequestsScreen = () => {
  const navigation = useNavigation<JoinRequestsNavigation>();
  const route = useRoute<JoinRequestsRoute>();
  const { token, authFetch, user } = useAuth();
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

  // State for 1:1 mode menu and report overlays
  const [selectedRequest, setSelectedRequest] =
    useState<ChatJoinRequest | null>(null);
  const [showRequestMenu, setShowRequestMenu] = useState(false);
  const [showReportOverlay, setShowReportOverlay] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

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
  const resolvedGroupType =
    resolvedEvent?.groupType ?? conversationEvent?.groupType ?? groupType;
  const is1to1Mode = resolvedGroupType === "Single";
  const resolvedTitle =
    resolvedEvent?.title ?? conversationEvent?.title ?? title;
  const resolvedCoverKey =
    resolvedEvent?.coverKey ?? conversationEvent?.coverKey ?? undefined;
  const resolvedSchedule = resolvedEvent ?? conversationEvent;
  const resolvedSubtitle = useMemo(() => {
    if (!resolvedSchedule?.time || !resolvedSchedule.location) {
      return undefined;
    }
    const datePart = resolvedSchedule.eventDate
      ? formatAbsoluteDateLabel(resolvedSchedule.eventDate)
      : resolvedSchedule.dateLabel;
    return `${datePart}, ${resolvedSchedule.time} at ${resolvedSchedule.location}`;
  }, [resolvedSchedule]);

  const loadRequests = useCallback(async (showRefreshing: boolean) => {
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
  }, [conversationId, eventId, refreshJoinRequests, is1to1Mode]);

  const handleRefresh = useCallback(() => {
    loadRequests(true).catch(() => undefined);
  }, [loadRequests]);

  useFocusEffect(
    useCallback(() => {
      loadRequests(false).catch(() => undefined);
    }, [loadRequests]),
  );

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveConversation(request.conversationId);
      (navigation as any).push("ChatThread");
    },
    [navigation, setActiveConversation],
  );

  // 1:1 mode: handle 3-dot menu press
  const handleMenuPress = useCallback((request: ChatJoinRequest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {is1to1Mode
            ? "No accepted users yet"
            : "No pending requests"}
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

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );

  // 1:1 mode header
  const render1to1Header = () => {
    return (
      <ChatEventHeader
        onBack={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
        title={resolvedTitle}
        subtitle={resolvedSubtitle}
        coverSource={getCoverSource(resolvedCoverKey)}
        onTitlePress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("EventDetailsOverlay", {
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("PendingRequests", {
                  conversationId,
                  eventId,
                });
              }}
              style={styles.joinIconButton}
            >
              <View style={styles.joinCountBadge}>
                <Text style={styles.joinCountBadgeText}>
                  {pendingRequests.length}
                </Text>
              </View>
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
    const convo = item.conversationId
      ? conversationById.get(item.conversationId)
      : undefined;
    const hasUnread = (convo?.unreadCount ?? 0) > 0;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.requestRow1to1,
          pressed && styles.requestRowPressed,
        ]}
        onPress={() => handleRequesterPress(item)}
      >
        {hasUnread && <View style={styles.unreadDot1to1} />}
        <UserAvatar
          avatar={item.requester.avatar}
          name={item.requester.name}
          seed={item.userId}
          size={40}
        />
        <View style={styles.requestInfo1to1}>
          <Text style={[styles.requesterName1to1, hasUnread && styles.requesterName1to1Unread]}>{item.requester.name}</Text>
          <Text style={[styles.introMessage1to1, hasUnread && styles.introMessage1to1Unread]} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => handleMenuPress(item)}
          style={styles.menuButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreHorizontalIcon width={20} height={20} color={colors.subText} />
        </Pressable>
      </Pressable>
    );
  };

  // Group mode header
  const renderGroupHeader = () => (
    <ChatEventHeader
      onBack={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
      title={resolvedTitle}
      subtitle="Join Requests"
      onTitlePress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("EventDetailsOverlay", {
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
          {item.message ? (
            <Text style={styles.requestMessage}>{item.message}</Text>
          ) : null}
        </View>
        <View style={styles.requestActions}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleAction(item.id, item.userId, "deny"); }}
            style={styles.declineButton}
          >
            <RejectIcon width={30} height={30} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleAction(item.id, item.userId, "approve"); }}
            style={styles.acceptButton}
          >
            <AcceptIcon width={30} height={30} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <View style={styles.container}>
        {is1to1Mode ? render1to1Header() : renderGroupHeader()}
        <FlatList
          data={displayRequests}
          extraData={conversations}
          keyExtractor={(item) => String(item.id)}
          style={is1to1Mode ? styles.flatList1to1 : undefined}
          renderItem={
            is1to1Mode
              ? render1to1RequestItem
              : renderGroupRequestItem
          }
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
            label: `Report & Block ${selectedRequest?.requester?.name?.split(" ")[0] ?? "Member"}`,
            onPress: handleReportFromMenu,
          },
          {
            label: `Remove ${selectedRequest?.requester?.name?.split(" ")[0] ?? "Member"}`,
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
    overflow: "visible",
  },
  joinIconButton: {
    marginLeft: spacing.sm,
  },
  joinCountBadge: {
    backgroundColor: "#E6E6E6",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  joinCountBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: 12,
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
    height: 1,
    backgroundColor: colors.border,
  },
  separator1to1: {
    height: 1,
    backgroundColor: colors.border,
  },
  // Group mode request item styles
  requestItem: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    color: "#000000",
    lineHeight: 22,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginTop: spacing.xs,
  },
  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E6E6E6",
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.text,
  },
  // 1:1 mode request row styles
  flatList1to1: {
    marginLeft: -spacing.md,
  },
  requestRow1to1: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  requestRowPressed: {
    backgroundColor: "rgba(0,0,0,0.03)",
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
  requesterName1to1Unread: {
    fontFamily: typography.fontFamilySemiBold,
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
  introMessage1to1Unread: {
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  unreadDot1to1: {
    position: "absolute",
    left: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2F81E6",
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
