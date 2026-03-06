import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  Pressable,
  StatusBar,
} from "react-native";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  RouteProp,
  useIsFocused,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors, spacing, typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";
import { useEvents, UserEvent } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { useChat, ChatJoinRequest } from "@context/ChatContext";
import { API_BASE_URL } from "@api/config";
import EventActionBadge from "@components/EventActionBadge";
import EventActionOverlay from "@components/EventActionOverlay";

type EventDetailsRoute = RouteProp<RootStackParamList, "EventDetails" | "EventDetailsOverlay">;
type EventDetailsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "EventDetails" | "EventDetailsOverlay"
>;

const readableDateLabel = (label: "Today" | "Tmrw") =>
  label === "Today" ? "Today" : "Tomorrow";

const EventDetailsScreen = () => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const readOnly = (route.params as { readOnly?: boolean }).readOnly ?? false;
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const {
    events,
    deleteUserEvent,
    markEventRequested,
    isEventRequested,
    unmarkEventRequested,
    markEventReported,
  } = useEvents();
  const { user, token, authFetch } = useAuth();
  const {
    conversations,
    setActiveConversation,
    joinRequestsByConversation,
    refreshJoinRequests,
    approveJoinRequest,
    denyJoinRequest,
    refreshConversations,
  } = useChat();

  const rawEvent = useMemo(
    () => events.find((item) => item.id === route.params.eventId),
    [events, route.params.eventId],
  );
  const [eventSnapshot, setEventSnapshot] = useState<UserEvent | null>(
    () => rawEvent ?? null,
  );
  useEffect(() => {
    if (rawEvent) {
      setEventSnapshot(rawEvent);
    }
  }, [rawEvent]);
  const event = eventSnapshot;
  const origin = (route.params as { origin?: string }).origin ?? "Events";
  const [showInvitePrompt, setShowInvitePrompt] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(() =>
    eventSnapshot ? isEventRequested(eventSnapshot.id) : false,
  );

  useEffect(() => {
    if (!eventSnapshot) {
      setHasPendingRequest(false);
      return;
    }
    setHasPendingRequest(isEventRequested(eventSnapshot.id));
  }, [eventSnapshot, isEventRequested]);
  const [showRequestSentBadge, setShowRequestSentBadge] = useState(false);
  const [showRequestCancelledBadge, setShowRequestCancelledBadge] =
    useState(false);
  const [showManagePrompt, setShowManagePrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userIntroMessage, setUserIntroMessage] = useState<string | null>(null);
  const [showPendingRequestPrompt, setShowPendingRequestPrompt] =
    useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showMenuOverlay, setShowMenuOverlay] = useState(false);
  const [showViewIntroOverlay, setShowViewIntroOverlay] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "requests" | "accepted" | "members"
  >("requests");
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(
    new Set(),
  );
  const [acceptingUserId, setAcceptingUserId] = useState<number | null>(null);
  const [decliningUserId, setDecliningUserId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<ChatJoinRequest | null>(null);
  const [isReportingMember, setIsReportingMember] = useState(false);
  // Group member menu state
  const [selectedMember, setSelectedMember] = useState<{
    id: number;
    name: string;
    avatarUrl?: string;
  } | null>(null);
  const [showMemberMenu, setShowMemberMenu] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removedMemberBadgeLabel, setRemovedMemberBadgeLabel] = useState<
    string | null
  >(null);
  const [reportedMemberBadgeLabel, setReportedMemberBadgeLabel] = useState<
    string | null
  >(null);
  const [disableHostRequestPolling, setDisableHostRequestPolling] =
    useState(false);
  const [showEventUpdatedBadge, setShowEventUpdatedBadge] = useState(false);

  useEffect(() => {
    setDisableHostRequestPolling(false);
  }, [route.params.eventId]);

  const showEventUpdatedBadgeParam = (route.params as { showEventUpdatedBadge?: boolean }).showEventUpdatedBadge;
  useEffect(() => {
    if (!showEventUpdatedBadgeParam) {
      return;
    }
    setShowEventUpdatedBadge(true);
  }, [showEventUpdatedBadgeParam]);

  if (!event) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.fallbackContainer}>
          <Pressable
            accessibilityRole="button"
            onPress={navigation.goBack}
            style={styles.fallbackBackButton}
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.fallbackText}>We couldn't find that event.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = user?.id === event.ownerId;
  const isSingleEvent = event?.groupType === "Single";
  const shouldShowInvitePrompt = showInvitePrompt && !isOwner;
  const hostLine = isOwner ? "Hosted by you" : `Hosted by ${event.hostName}`;
  const scheduleLine = `${readableDateLabel(event.dateLabel)}, ${event.time}`;
  const audienceLine = `${event.groupType === "Single" ? "1:1" : "Group"}, ${event.audience}`;
  const eventNumericId = useMemo(() => {
    const parsed = Number(event.id);
    return Number.isNaN(parsed) ? null : parsed;
  }, [event.id]);
  const eventConversation = useMemo(() => {
    if (eventNumericId == null) {
      return null;
    }
    return conversations.find(
      (conversation) => conversation.eventId === eventNumericId,
    );
  }, [conversations, eventNumericId]);
  const eventConversationId = eventConversation?.id ?? null;
  const requestStoreKey = useMemo(() => {
    if (eventNumericId == null) {
      return null;
    }
    if (eventConversationId != null) {
      return eventConversationId;
    }
    // For 1:1 host flows, pending requests may exist before any conversation exists.
    return isSingleEvent ? -eventNumericId : null;
  }, [eventConversationId, eventNumericId, isSingleEvent]);
  const eventScopedRequestStoreKey = useMemo(() => {
    if (eventNumericId == null) {
      return null;
    }
    // Event-scoped cache key used as a stable fallback for host request state.
    return -eventNumericId;
  }, [eventNumericId]);
  const hostRequestStoreKey = useMemo(() => {
    if (!isOwner) {
      return requestStoreKey;
    }
    return requestStoreKey ?? eventScopedRequestStoreKey;
  }, [isOwner, requestStoreKey, eventScopedRequestStoreKey]);

  const isConversationMember = useMemo(() => {
    if (!user || !eventConversation) {
      return false;
    }
    return eventConversation.memberIds.includes(user.id);
  }, [eventConversation, user]);
  const fallbackHostParticipant = useMemo(
    () => ({
      id: event.ownerId,
      name: event.hostName,
    }),
    [event.ownerId, event.hostName],
  );
  const goingParticipants = useMemo(() => {
    if (eventConversation?.participants?.length) {
      return eventConversation.participants;
    }
    return [fallbackHostParticipant];
  }, [eventConversation, fallbackHostParticipant]);
  const goingCount = useMemo(() => {
    if (!eventConversation) {
      return 1;
    }
    const memberCount =
      eventConversation.memberIds?.length ??
      eventConversation.participants?.length ??
      0;
    return memberCount > 0 ? memberCount : 1;
  }, [eventConversation]);

  useEffect(() => {
    if (isConversationMember) {
      setHasPendingRequest(false);
    }
  }, [isConversationMember]);

  // Keep host-side requests fresh while viewing details.
  useEffect(() => {
    if (
      !isFocused ||
      !rawEvent ||
      !isOwner ||
      !event ||
      hostRequestStoreKey == null ||
      eventNumericId == null ||
      disableHostRequestPolling ||
      readOnly
    ) {
      return;
    }

    const refreshHostRequests = () => {
      refreshConversations().catch((err) => {
        console.error("Failed to refresh conversations for host details", err);
      });
      refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
        includeApproved: isSingleEvent,
      }).catch((err: unknown) => {
        const status =
          typeof err === "object" &&
          err !== null &&
          "status" in err &&
          typeof (err as { status?: unknown }).status === "number"
            ? ((err as { status?: number }).status ?? undefined)
            : undefined;
        if (status === 404) {
          setDisableHostRequestPolling(true);
        }
      });
    };

    refreshHostRequests();
    const interval = setInterval(() => {
      refreshHostRequests();
    }, 5000);
    return () => clearInterval(interval);
  }, [
    isFocused,
    rawEvent,
    isOwner,
    event,
    hostRequestStoreKey,
    eventNumericId,
    refreshJoinRequests,
    refreshConversations,
    isSingleEvent,
    disableHostRequestPolling,
    readOnly,
  ]);

  useEffect(() => {
    if (isSingleEvent && activeTab === "members") {
      setActiveTab("requests");
    }
    if (!isSingleEvent && activeTab === "accepted") {
      setActiveTab("requests");
    }
  }, [activeTab, isSingleEvent]);

  const hostRequests = useMemo(() => {
    if (hostRequestStoreKey == null) {
      return [];
    }
    const primary = joinRequestsByConversation[hostRequestStoreKey] ?? [];
    if (
      eventScopedRequestStoreKey == null ||
      eventScopedRequestStoreKey === hostRequestStoreKey
    ) {
      return primary;
    }

    const fallback =
      joinRequestsByConversation[eventScopedRequestStoreKey] ?? [];
    if (fallback.length === 0) {
      return primary;
    }
    if (primary.length === 0) {
      return fallback;
    }

    const merged = new Map<number, ChatJoinRequest>();
    for (const item of fallback) {
      merged.set(item.id, item);
    }
    for (const item of primary) {
      merged.set(item.id, item);
    }
    return Array.from(merged.values());
  }, [
    joinRequestsByConversation,
    hostRequestStoreKey,
    eventScopedRequestStoreKey,
  ]);
  const pendingRequests = useMemo(
    () => hostRequests.filter((request) => request.status === "pending"),
    [hostRequests],
  );
  const acceptedRequests = useMemo(
    () => hostRequests.filter((request) => request.status === "approved"),
    [hostRequests],
  );

  // Get confirmed members (excluding host)
  const confirmedMembers = useMemo(() => {
    if (!eventConversation || !user) return [];
    return eventConversation.participants.filter((p) => p.id !== user.id);
  }, [eventConversation, user]);

  // Fetch the user's introduction message when they have a pending request or are a member
  useEffect(() => {
    const shouldFetch = (hasPendingRequest || isConversationMember) && !isOwner && !readOnly;
    if (!shouldFetch || !token || !event) {
      setUserIntroMessage(null);
      return;
    }

    const fetchUserRequest = async () => {
      try {
        const response = await authFetch(
          `${API_BASE_URL}/api/chat/requests/me?include_approved=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => ({}));
        const requests = payload.requests ?? [];
        const matchingRequest = requests.find(
          (req: { event_id?: number; eventId?: number }) =>
            (req.event_id ?? req.eventId) === Number(event.id),
        );
        if (matchingRequest?.message) {
          setUserIntroMessage(matchingRequest.message);
        }
      } catch (err) {
        console.error("Failed to fetch user join request", err);
      }
    };

    fetchUserRequest();
  }, [
    authFetch,
    hasPendingRequest,
    isConversationMember,
    token,
    event,
    isOwner,
  ]);

  const ctaLabel = hasPendingRequest ? "Pending Request" : "Interested";

  // Show standard CTA only for non-owners who haven't joined
  const showStandardCTA = !isOwner && !isConversationMember;
  // Show "Go to Chat" for:
  // - 1:1 hosts (opens accepted users list even before private chats exist)
  // - hosts/members with an existing conversation
  const showOpenChatCTA = isOwner
    ? isSingleEvent || !!eventConversation
    : isConversationMember && !!eventConversation;

  const handleCtaPress = () => {
    // Pending state: CTA is disabled, actions handled via three-dot menu
    if (hasPendingRequest) {
      return;
    }
    if (isConversationMember) {
      return;
    }
    setShowInvitePrompt((prev) => !prev);
  };

  const handleOpenChat = () => {
    if (
      isOwner &&
      isSingleEvent &&
      eventNumericId != null &&
      requestStoreKey != null
    ) {
      (navigation as any).navigate("JoinRequests", {
        conversationId: requestStoreKey,
        eventId: eventNumericId,
        title: event.title,
        groupType: "Single",
        eventDetails: {
          coverKey: event.coverKey ?? undefined,
          dateLabel: event.dateLabel,
          location: event.location,
          time: event.time,
        },
      });
      return;
    }

    if (!eventConversation) {
      return;
    }
    setActiveConversation(eventConversation.id);
    (navigation as any).navigate("ChatThread");
  };

  // Avatar colors for generating fallback avatars
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

  const getAvatarColor = (userId: number): string => {
    return AVATAR_COLORS[userId % AVATAR_COLORS.length];
  };

  const renderAvatar = (
    participant: { id: number; name: string; avatarUrl?: string },
    size: number = 40,
    compact: boolean = false,
  ) => {
    if (participant.avatarUrl) {
      return (
        <Image
          source={{ uri: participant.avatarUrl }}
          style={[
            styles.avatar,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        />
      );
    }
    const initial = participant.name?.charAt(0).toUpperCase() ?? "?";
    const bgColor = getAvatarColor(participant.id);
    return (
      <View
        style={[
          styles.avatarFallback,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
          },
        ]}
      >
        <Text
          style={[styles.avatarInitial, compact && styles.avatarInitialCompact]}
        >
          {initial}
        </Text>
      </View>
    );
  };

  const handleAcceptRequest = async (request: ChatJoinRequest) => {
    if (!event || hostRequestStoreKey == null || eventNumericId == null) return;
    setAcceptingUserId(request.userId);
    try {
      await approveJoinRequest(
        hostRequestStoreKey,
        eventNumericId,
        request.userId,
      );
      await refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
        includeApproved: isSingleEvent,
      });
      await refreshConversations().catch((err) => {
        console.error(
          "Failed to refresh conversations after approving request",
          err,
        );
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (err) {
      console.error("Failed to accept request", err);
    } finally {
      setAcceptingUserId(null);
    }
  };

  const handleDeclineRequest = async (request: ChatJoinRequest) => {
    if (!event || hostRequestStoreKey == null || eventNumericId == null) return;
    setDecliningUserId(request.userId);
    try {
      await denyJoinRequest(
        hostRequestStoreKey,
        eventNumericId,
        request.userId,
      );
      await refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
        includeApproved: isSingleEvent,
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (err) {
      console.error("Failed to decline request", err);
    } finally {
      setDecliningUserId(null);
    }
  };

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

  const handleRequesterPress = async (request: ChatJoinRequest) => {
    if (!request.conversationId) return;
    setActiveConversation(request.conversationId);
    (navigation as any).navigate("ChatThread");
  };

  const openMemberMenu = (member: {
    id: number;
    name: string;
    avatarUrl?: string;
  }) => {
    setSelectedMember(member);
    setShowMemberMenu(true);
  };

  const handleRemoveMember = async () => {
    if (!event || !token || !selectedMember) return;
    if (isRemovingMember) return;
    const removedMemberName = selectedMember.name;
    setRemoveError(null);
    setIsRemovingMember(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/chat/members/${selectedMember.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to remove member right now.");
      }
      await refreshConversations().catch((err) => {
        console.error(
          "Failed to refresh conversations after removing member",
          err,
        );
      });
      if (hostRequestStoreKey != null && eventNumericId != null) {
        await refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
          includeApproved: isSingleEvent,
        }).catch((err) => {
          console.error(
            "Failed to refresh join requests after removing member",
            err,
          );
        });
      }
      setShowRemoveConfirm(false);
      setSelectedMember(null);
      const firstName = removedMemberName.trim().split(/\s+/)[0] ?? "";
      setRemovedMemberBadgeLabel(
        firstName.length > 0 ? `${firstName} removed` : "Member removed",
      );
    } catch (err) {
      console.error("Failed to remove member", err);
      setRemoveError("Unable to remove this member. Please try again.");
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleReportMemberFromMenu = () => {
    setShowMemberMenu(false);
    setReportMessage("");
    setReportError(null);
    // Set selectedRequest-like context so handleSubmitMemberReport works
    if (selectedMember) {
      setSelectedRequest({ userId: selectedMember.id } as ChatJoinRequest);
    }
    setShowReportPrompt(true);
  };

  const handleRemovePromptFromMenu = () => {
    setShowMemberMenu(false);
    setRemoveError(null);
    setShowRemoveConfirm(true);
  };

  const handleRemoveCancel = () => {
    if (isRemovingMember) return;
    setShowRemoveConfirm(false);
  };

  const handleSubmitMemberReport = async () => {
    if (!event || !token || !selectedRequest) return;
    if (isReportingMember) return;
    const trimmed = reportMessage.trim();
    if (!trimmed.length) {
      setReportError("Please tell us why you are reporting this member.");
      return;
    }
    setReportError(null);
    setIsReportingMember(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/members/${selectedRequest.userId}/report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: trimmed }),
        },
      );
      if (response.status === 409) {
        setReportError("You have already reported this member.");
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to submit report right now.");
      }
      const reportTargetName = (
        selectedMember?.name ??
        selectedRequest.requester?.name ??
        pendingRequests.find(
          (request) => request.userId === selectedRequest.userId,
        )?.requester?.name ??
        acceptedRequests.find(
          (request) => request.userId === selectedRequest.userId,
        )?.requester?.name ??
        confirmedMembers.find((member) => member.id === selectedRequest.userId)
          ?.name ??
        ""
      ).trim();
      const firstName = reportTargetName.split(/\s+/)[0] ?? "";
      setReportMessage("");
      setShowReportPrompt(false);
      setSelectedRequest(null);
      setSelectedMember(null);
      setReportedMemberBadgeLabel(
        firstName.length > 0
          ? `${firstName} reported and blocked`
          : "Member reported and blocked",
      );
      // Refresh requests since the reported member should be removed
      if (hostRequestStoreKey != null && eventNumericId != null) {
        refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
          includeApproved: isSingleEvent,
        });
      }
    } catch (err) {
      console.error("Failed to submit member report", err);
      setReportError(
        err instanceof Error
          ? err.message
          : "Unable to submit report. Please try again.",
      );
    } finally {
      setIsReportingMember(false);
    }
  };

  const handleSendInvite = async () => {
    if (!event) {
      return;
    }
    if (!user || !token) {
      navigation.navigate("Login");
      return;
    }
    if (isSendingInvite) {
      return;
    }
    const trimmed = inviteMessage.trim();
    if (!trimmed.length) {
      setInviteError("Please include a brief note for the host.");
      return;
    }
    setInviteError(null);
    setIsSendingInvite(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/chat/requests`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: trimmed }),
        },
      );
      if (response.status === 409) {
        setHasPendingRequest(true);
        markEventRequested(event.id);
        setInviteError("You already have a pending request for this event.");
        return;
      }
      if (response.status === 401) {
        navigation.navigate("Login");
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to send request right now.");
      }
      setInviteMessage("");
      setShowInvitePrompt(false);
      setHasPendingRequest(true);
      markEventRequested(event.id);
      setShowRequestSentBadge(true);
    } catch (err) {
      console.error("Failed to send invite", err);
      setInviteError(
        err instanceof Error
          ? err.message
          : "Unable to send request. Please try again.",
      );
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleEdit = () => {
    (navigation as any).navigate("Main", {
      screen: "Create",
      params: { editEventId: event.id },
    });
    setShowManagePrompt(false);
  };

  const handleDeletePrompt = () => {
    setShowManagePrompt(false);
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!event) {
      return;
    }
    if (isDeleting) {
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);
    setDisableHostRequestPolling(true);
    try {
      await deleteUserEvent(event.id);
      setShowDeleteConfirm(false);
      const targetTab = origin === "MyEvents" ? "MyEvents" : "Events";
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Main",
            params: {
              screen: targetTab,
              params: { showEventDeletedBadge: true },
            },
          },
        ],
      });
    } catch (err) {
      console.error("Failed to delete event", err);
      setDeleteError("Unable to delete this event. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    if (isDeleting) {
      return;
    }
    setShowDeleteConfirm(false);
  };

  const handleCancelRequest = async () => {
    if (!event || !token) {
      return;
    }
    if (isCancellingRequest) {
      return;
    }
    setIsCancellingRequest(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/chat/requests/me`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to cancel request right now.");
      }
      setShowPendingRequestPrompt(false);
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
      setShowRequestCancelledBadge(true);
    } catch (err) {
      console.error("Failed to cancel request", err);
    } finally {
      setIsCancellingRequest(false);
    }
  };

  const handleOpenReportPrompt = () => {
    setShowPendingRequestPrompt(false);
    setReportMessage("");
    setReportError(null);
    setShowReportPrompt(true);
  };

  const handleSubmitReport = async () => {
    if (!event || !token) {
      return;
    }
    if (isSubmittingReport) {
      return;
    }
    const trimmed = reportMessage.trim();
    if (!trimmed.length) {
      setReportError("Please tell us why you are reporting this event.");
      return;
    }
    setReportError(null);
    setIsSubmittingReport(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: trimmed }),
        },
      );
      if (response.status === 409) {
        setReportError("You have already reported this event.");
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to submit report right now.");
      }
      setReportMessage("");
      setShowReportPrompt(false);
      markEventReported(event.id);
      // Clear local state for pending request since backend also cancels it
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
      await refreshConversations().catch((err) => {
        console.error("Failed to refresh conversations after report", err);
      });
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Main",
            params: {
              screen: "Events",
              params: { showEventReportedBadge: true },
            },
          },
        ],
      });
    } catch (err) {
      console.error("Failed to submit report", err);
      setReportError(
        err instanceof Error
          ? err.message
          : "Unable to submit report. Please try again.",
      );
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleLeavePrompt = () => {
    setShowMenuOverlay(false);
    setLeaveError(null);
    setShowLeaveConfirm(true);
  };

  const handleLeaveEvent = async () => {
    if (!event || !user || !token) {
      return;
    }
    if (isLeaving) {
      return;
    }
    setLeaveError(null);
    setIsLeaving(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/chat/members/${user.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to leave event right now.");
      }
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
      await refreshConversations().catch((err) => {
        console.error(
          "Failed to refresh conversations after leaving event",
          err,
        );
      });
      setShowLeaveConfirm(false);
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Main",
            params: {
              screen: "Events",
              params: { showEventLeftBadge: true },
            },
          },
        ],
      });
    } catch (err) {
      console.error("Failed to leave event", err);
      setLeaveError("Unable to leave this event. Please try again.");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleLeaveCancel = () => {
    if (isLeaving) {
      return;
    }
    setShowLeaveConfirm(false);
  };

  const handleMenuReportEvent = () => {
    setShowMenuOverlay(false);
    setReportMessage("");
    setReportError(null);
    setShowReportPrompt(true);
  };

  const handleMenuCancelRequest = () => {
    setShowMenuOverlay(false);
    handleCancelRequest();
  };

  const handleMenuViewIntro = () => {
    setShowMenuOverlay(false);
    setShowViewIntroOverlay(true);
  };

  const handleMenuEdit = () => {
    setShowMenuOverlay(false);
    handleEdit();
  };

  const handleMenuDelete = () => {
    setShowMenuOverlay(false);
    handleDeletePrompt();
  };

  const menuItems = useMemo(() => {
    if (isOwner) {
      // Host: Edit Details, Delete Event
      return [
        { label: "Edit Details", onPress: handleMenuEdit },
        { label: "Delete Event", onPress: handleMenuDelete, destructive: true },
      ];
    }
    if (isConversationMember) {
      // Joined: View Intro Message, Leave Event, Report Event
      return [
        { label: "View Intro Message", onPress: handleMenuViewIntro },
        { label: "Leave Event", onPress: handleLeavePrompt, destructive: true },
        {
          label: "Report Event",
          onPress: handleMenuReportEvent,
          destructive: true,
        },
      ];
    }
    if (hasPendingRequest) {
      // Pending: Cancel Request, Report Event
      return [
        {
          label: "Cancel Request",
          onPress: handleMenuCancelRequest,
          loading: isCancellingRequest,
        },
        {
          label: "Report Event",
          onPress: handleMenuReportEvent,
          destructive: true,
        },
      ];
    }
    // Not joined: Report Event
    return [
      {
        label: "Report Event",
        onPress: handleMenuReportEvent,
        destructive: true,
      },
    ];
  }, [isOwner, isConversationMember, hasPendingRequest, isCancellingRequest]);

  const screenContent = (
    <>
      <StatusBar
        barStyle="light-content" // For white icons/text
        translucent
        backgroundColor="transparent"
      />

      <View style={styles.contentWrapper}>
        <View
          style={[
            styles.heroContainer,
            readOnly
              ? { paddingTop: 12, paddingBottom: 16 }
              : { height: 320 + insets.top, paddingTop: insets.top + 10 },
          ]}
        >
          <Image
            source={{ uri: event.imageUri }}
            style={styles.heroBackgroundImage}
            resizeMode="cover"
            blurRadius={28}
          />
          <View pointerEvents="none" style={styles.heroOverlayDark} />
          <View pointerEvents="none" style={styles.heroOverlayLight} />
          {readOnly ? (
            <>
              <View style={styles.overlayHeaderRow}>
                <Text style={styles.overlayHeaderTitle} numberOfLines={1}>
                  {event.title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={navigation.goBack}
                  hitSlop={12}
                  style={styles.overlayCloseButton}
                >
                  <Feather name="x" size={24} color={colors.buttonText} />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={navigation.goBack}
                style={[styles.backButton, { top: insets.top + 10 }]}
              >
                <Feather name="chevron-left" size={24} color={colors.buttonText} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMenuOverlay(true)}
                style={[styles.menuButton, { top: insets.top + 10 }]}
              >
                <Feather
                  name="more-horizontal"
                  size={24}
                  color={colors.buttonText}
                />
              </Pressable>
            </>
          )}

          {/* Elevated Image Card */}
          <View style={styles.imageCardContainer}>
            <Image
              source={{ uri: event.imageUri }}
              style={styles.imageCard}
              resizeMode="cover"
            />
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        > */}
          <View style={styles.card}>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.hostedBy}>{hostLine}</Text>
            {!isOwner && !readOnly && (
              <View style={styles.goingRow} testID="going-row">
                <View style={styles.goingAvatarStack}>
                  {goingParticipants.slice(0, 2).map((participant, index) => (
                    <View
                      key={`${participant.id}-${index}`}
                      style={[
                        styles.goingAvatarItem,
                        index > 0 && styles.goingAvatarOverlap,
                      ]}
                      testID={`going-avatar-${index}`}
                    >
                      {renderAvatar(participant, 24, true)}
                    </View>
                  ))}
                </View>
                <Text style={styles.goingLabel} testID="going-count-label">
                  {`${goingCount} Going`}
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>Details</Text>
            <View style={styles.detailDiv}>
              <View style={styles.detailRow}>
                <Feather
                  name="map-pin"
                  size={16}
                  color={colors.iconColor}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{event.location}</Text>
              </View>
              <View style={styles.detailRow}>
                <Feather
                  name="clock"
                  size={16}
                  color={colors.iconColor}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{scheduleLine}</Text>
              </View>
              <View style={styles.detailRow}>
                <Feather
                  name="users"
                  size={16}
                  color={colors.iconColor}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{audienceLine}</Text>
              </View>
            </View>

            {!!event.description && (
              <View>
                <Text
                  style={styles.description}
                  numberOfLines={descriptionExpanded ? undefined : 3}
                >
                  {event.description}
                </Text>
                {event.description.length > 100 && !descriptionExpanded && (
                  <Text
                    style={styles.seeMoreText}
                    onPress={() => setDescriptionExpanded(true)}
                  >
                    ...See more
                  </Text>
                )}
              </View>
            )}

            {/* Host-only: Separator, Tabs, Requests/Members lists */}
            {isOwner && !readOnly && (
              <>
                <View style={styles.tabSeparator} />

                {/* Tabs header */}
                <View style={styles.tabContainer}>
                  <Pressable
                    style={styles.tabItem}
                    onPress={() => setActiveTab("requests")}
                  >
                    <View style={styles.tabLabelRow}>
                      <Text
                        style={[
                          styles.tabLabel,
                          activeTab === "requests" && styles.tabLabelActive,
                        ]}
                      >
                        Requests
                      </Text>
                      <Text style={styles.tabCount}>
                        {" "}
                        {pendingRequests.length}
                      </Text>
                    </View>
                    {activeTab === "requests" && (
                      <View style={styles.tabUnderline} />
                    )}
                  </Pressable>

                  {isSingleEvent && (
                    <Pressable
                      style={styles.tabItem}
                      onPress={() => setActiveTab("accepted")}
                    >
                      <View style={styles.tabLabelRow}>
                        <Text
                          style={[
                            styles.tabLabel,
                            activeTab === "accepted" && styles.tabLabelActive,
                          ]}
                        >
                          Accepted
                        </Text>
                        <Text style={styles.tabCount}>
                          {" "}
                          {acceptedRequests.length}
                        </Text>
                      </View>
                      {activeTab === "accepted" && (
                        <View style={styles.tabUnderline} />
                      )}
                    </Pressable>
                  )}

                  {activeTab !== "accepted" && !isSingleEvent && (
                    <Pressable
                      style={styles.tabItem}
                      onPress={() => setActiveTab("members")}
                    >
                      <View style={styles.tabLabelRow}>
                        <Text
                          style={[
                            styles.tabLabel,
                            activeTab === "members" && styles.tabLabelActive,
                          ]}
                        >
                          Members
                        </Text>
                        <Text style={styles.tabCount}>
                          {" "}
                          {confirmedMembers.length}
                        </Text>
                      </View>
                      {activeTab === "members" && (
                        <View style={styles.tabUnderline} />
                      )}
                    </Pressable>
                  )}
                </View>

                {/* Requests list */}
                {activeTab === "requests" && (
                  <View style={styles.listContainer}>
                    {pendingRequests.length === 0 ? (
                      <Text style={styles.emptyStateText}>No requests yet</Text>
                    ) : (
                      pendingRequests.map((request) => {
                        const isExpanded = expandedRequestIds.has(request.id);
                        const isAccepting = acceptingUserId === request.userId;
                        const isDeclining = decliningUserId === request.userId;
                        const isLoading = isAccepting || isDeclining;

                        return (
                          <View key={request.id} style={styles.requestItem}>
                            {renderAvatar(request.requester)}

                            <View style={styles.requestContent}>
                              <Text style={styles.requestName}>
                                {request.requester.name}
                              </Text>
                              <Text
                                style={styles.requestMessage}
                                numberOfLines={isExpanded ? undefined : 3}
                              >
                                {request.message}
                              </Text>
                              {!isExpanded && request.message.length > 100 && (
                                <Text
                                  style={styles.seeMoreText}
                                  onPress={() =>
                                    toggleRequestExpanded(request.id)
                                  }
                                >
                                  See more
                                </Text>
                              )}
                            </View>

                            <View style={styles.requestActions}>
                              <Pressable
                                style={[
                                  styles.actionButton,
                                  styles.declineButton,
                                ]}
                                onPress={() => handleDeclineRequest(request)}
                                disabled={isLoading}
                              >
                                {isDeclining ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={colors.text}
                                  />
                                ) : (
                                  <Feather
                                    name="x"
                                    size={18}
                                    color={colors.text}
                                  />
                                )}
                              </Pressable>

                              <Pressable
                                style={[
                                  styles.actionButton,
                                  styles.acceptButton,
                                ]}
                                onPress={() => handleAcceptRequest(request)}
                                disabled={isLoading}
                              >
                                {isAccepting ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={colors.buttonText}
                                  />
                                ) : (
                                  <Feather
                                    name="check"
                                    size={18}
                                    color={colors.buttonText}
                                  />
                                )}
                              </Pressable>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}

                {isSingleEvent && activeTab === "accepted" && (
                  <View style={styles.listContainer}>
                    {acceptedRequests.length === 0 ? (
                      <Text style={styles.emptyStateText}>
                        No accepted members yet
                      </Text>
                    ) : (
                      acceptedRequests.map((request) => (
                        <Pressable
                          key={request.id}
                          onPress={() => handleRequesterPress(request)}
                          style={styles.memberItem}
                        >
                          {renderAvatar(request.requester)}
                          <Text style={styles.memberName}>
                            {request.requester.name}
                          </Text>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              openMemberMenu(request.requester);
                            }}
                            style={styles.requestMenuButton}
                          >
                            <Feather
                              name="more-horizontal"
                              size={24}
                              color="#666"
                            />
                          </Pressable>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}

                {/* Members tab - Group only */}
                {!isSingleEvent && activeTab === "members" && (
                  <View style={styles.listContainer}>
                    {confirmedMembers.length === 0 ? (
                      <Text style={styles.emptyStateText}>No members yet</Text>
                    ) : (
                      confirmedMembers.map((member) => (
                        <View key={member.id} style={styles.memberItem}>
                          {renderAvatar(member)}
                          <Text style={styles.memberName}>{member.name}</Text>
                          <Pressable
                            onPress={() => openMemberMenu(member)}
                            style={styles.requestMenuButton}
                          >
                            <Feather
                              name="more-horizontal"
                              size={24}
                              color="#666"
                            />
                          </Pressable>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </>
            )}

            {userIntroMessage && !readOnly ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionHeading}>Introduction</Text>
                <Text style={styles.introMessageText}>
                  "{userIntroMessage}"
                </Text>
              </>
            ) : null}
          </View>
        </ScrollView>
        {showStandardCTA && !readOnly && (
          <View
            style={[
              styles.ctaContainer,
              shouldShowInvitePrompt && styles.ctaContainerActive,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={handleCtaPress}
              style={({ pressed }) => [
                styles.ctaButton,
                pressed && styles.ctaButtonPressed,
                (shouldShowInvitePrompt || hasPendingRequest) &&
                  styles.ctaButtonDisabled,
              ]}
              disabled={shouldShowInvitePrompt || hasPendingRequest}
            >
              <Text
                style={[
                  styles.ctaLabel,
                  (shouldShowInvitePrompt || hasPendingRequest) &&
                    styles.ctaLabelDisabled,
                ]}
              >
                {ctaLabel}
              </Text>
            </Pressable>
          </View>
        )}
        {showOpenChatCTA && !readOnly ? (
          <View style={styles.ctaContainer}>
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenChat}
              style={({ pressed }) => [
                styles.ctaButton,
                isOwner && styles.ctaButtonSecondary,
                pressed && styles.ctaButtonPressed,
              ]}
            >
              <Text
                style={[styles.ctaLabel, isOwner && styles.ctaLabelSecondary]}
              >
                Go to Chat
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <EventActionOverlay
        isVisible={shouldShowInvitePrompt}
        onBackdropPress={
          isSendingInvite ? undefined : () => setShowInvitePrompt(false)
        }
        type="invite"
        inviteMessage={inviteMessage}
        onInviteMessageChange={(text) => {
          setInviteMessage(text);
          if (inviteError) {
            setInviteError(null);
          }
        }}
        onSendInvite={handleSendInvite}
        inviteError={inviteError}
        inviteSubmitting={isSendingInvite}
        inviteDisabled={!inviteMessage.trim()}
      />
      <EventActionOverlay
        isVisible={showManagePrompt}
        onBackdropPress={() => setShowManagePrompt(false)}
        type="manage"
        onEdit={handleEdit}
        onDelete={handleDeletePrompt}
      />
      <EventActionOverlay
        isVisible={showDeleteConfirm}
        onBackdropPress={isDeleting ? undefined : handleDeleteCancel}
        type="confirm"
        title="Delete this event?"
        description="This will remove the event for everyone and can't be undone."
        confirmLabel="Delete event"
        cancelLabel="Keep event"
        confirmTone="destructive"
        onConfirm={handleDelete}
        onCancel={handleDeleteCancel}
        isConfirmLoading={isDeleting}
        errorMessage={deleteError}
      />
      <EventActionOverlay
        isVisible={showPendingRequestPrompt}
        onBackdropPress={
          isCancellingRequest
            ? undefined
            : () => setShowPendingRequestPrompt(false)
        }
        type="pendingRequest"
        onCancelRequest={handleCancelRequest}
        onReportEvent={handleOpenReportPrompt}
        isCancelling={isCancellingRequest}
      />
      <EventActionOverlay
        isVisible={showReportPrompt}
        onBackdropPress={
          isSubmittingReport || isReportingMember
            ? undefined
            : () => {
                setShowReportPrompt(false);
                setSelectedRequest(null);
              }
        }
        type="report"
        reportMessage={reportMessage}
        onReportMessageChange={(text) => {
          setReportMessage(text);
          if (reportError) {
            setReportError(null);
          }
        }}
        onSubmitReport={
          selectedRequest ? handleSubmitMemberReport : handleSubmitReport
        }
        reportError={reportError}
        reportSubmitting={isSubmittingReport || isReportingMember}
        reportDisabled={!reportMessage.trim()}
      />
      <EventActionOverlay
        isVisible={showMenuOverlay}
        onBackdropPress={() => setShowMenuOverlay(false)}
        type="menu"
        items={menuItems}
      />
      <EventActionOverlay
        isVisible={showViewIntroOverlay}
        onBackdropPress={() => setShowViewIntroOverlay(false)}
        type="viewIntro"
        introMessage={userIntroMessage ?? ""}
        onDismiss={() => setShowViewIntroOverlay(false)}
      />
      <EventActionOverlay
        isVisible={showLeaveConfirm}
        onBackdropPress={isLeaving ? undefined : handleLeaveCancel}
        type="confirm"
        title="Leave this event?"
        description="You'll need to request to join again if you change your mind."
        confirmLabel="Leave Event"
        cancelLabel="Stay"
        confirmTone="destructive"
        onConfirm={handleLeaveEvent}
        onCancel={handleLeaveCancel}
        isConfirmLoading={isLeaving}
        errorMessage={leaveError}
      />
      {/* Member menu */}
      <EventActionOverlay
        isVisible={showMemberMenu}
        onBackdropPress={() => {
          setShowMemberMenu(false);
          setSelectedMember(null);
        }}
        type="menu"
        items={[
          {
            label: "Report & Block Member",
            onPress: handleReportMemberFromMenu,
          },
          {
            label: "Remove Member",
            onPress: handleRemovePromptFromMenu,
            destructive: true,
          },
        ]}
      />
      <EventActionOverlay
        isVisible={showRemoveConfirm}
        onBackdropPress={isRemovingMember ? undefined : handleRemoveCancel}
        type="confirm"
        title="Remove this member?"
        description={
          isSingleEvent
            ? "They will be removed from this event and private chat."
            : "They will be removed from the group chat and will need to request to join again."
        }
        confirmLabel="Remove Member"
        cancelLabel="Cancel"
        confirmTone="destructive"
        onConfirm={handleRemoveMember}
        onCancel={handleRemoveCancel}
        isConfirmLoading={isRemovingMember}
        errorMessage={removeError}
      />
      <EventActionBadge
        visible={showEventUpdatedBadge}
        label="Event details updated"
        bottomOffset={spacing.lg + insets.bottom}
        onHidden={() => {
          setShowEventUpdatedBadge(false);
          navigation.setParams({ showEventUpdatedBadge: false });
        }}
      />
      <EventActionBadge
        visible={showRequestSentBadge}
        label="Requested to join"
        bottomOffset={spacing.lg + insets.bottom}
        onHidden={() => {
          setShowRequestSentBadge(false);
        }}
      />
      <EventActionBadge
        visible={showRequestCancelledBadge}
        label="Requested to join cancelled"
        bottomOffset={spacing.lg + insets.bottom}
        onHidden={() => {
          setShowRequestCancelledBadge(false);
        }}
      />
      <EventActionBadge
        visible={removedMemberBadgeLabel != null}
        label={removedMemberBadgeLabel ?? ""}
        bottomOffset={spacing.lg + insets.bottom}
        onHidden={() => {
          setRemovedMemberBadgeLabel(null);
        }}
      />
      <EventActionBadge
        visible={reportedMemberBadgeLabel != null}
        label={reportedMemberBadgeLabel ?? ""}
        bottomOffset={spacing.lg + insets.bottom}
        onHidden={() => {
          setReportedMemberBadgeLabel(null);
        }}
      />
    </>
  );

  if (readOnly) {
    return (
      <View style={styles.overlayWrapper}>
        <Pressable style={styles.overlayDismissZone} onPress={navigation.goBack} />
        <View style={styles.overlayContentContainer}>
          {screenContent}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      {screenContent}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: colors.background, // Your original background color
  },
  heroContainer: {
    height: 320,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  heroBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlayDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  heroOverlayLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  overlayWrapper: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  overlayDismissZone: {
    height: "10%",
  },
  overlayContentContainer: {
    flex: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  overlayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    zIndex: 10,
  },
  overlayHeaderTitle: {
    flex: 1,
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.buttonText,
    textAlign: "center",
    marginRight: -40,
  },
  overlayCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    position: "absolute",
    top: 10,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  menuButton: {
    position: "absolute",
    top: 10,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },

  // Image card container
  imageCardContainer: {
    width: "60%", // 50% of heroContainer width
    aspectRatio: 1, // Square card
  },

  // The elevated image card
  imageCard: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15, // For Android
  },

  // heroImage: {
  //   position: 'absolute',
  //   top: 0,
  //   left: 0,
  //   right: 0,
  //   bottom: 0,
  //   width: undefined,
  //   height: undefined,
  //   resizeMode: 'cover'
  // },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 32,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    fontSize: 29,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.titleLineHeight,
    letterSpacing: typography.letterSpacing,
  },
  hostedBy: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.iconColor,
    lineHeight: 20,
    letterSpacing: typography.letterSpacing,
  },
  goingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  goingAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  goingAvatarItem: {
    borderRadius: 999,
  },
  goingAvatarOverlap: {
    marginLeft: -9,
  },
  goingLabel: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: "#707070",
    lineHeight: 20,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  sectionHeading: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: "#000000",
    lineHeight: typography.lineHeight,
    letterSpacing: -0.4,
  },
  detailDiv: {
    flexDirection: "column",
    gap: 1, // 1px vertical space between child views
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailIcon: {
    marginRight: spacing.sm,
  },
  detailText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.eventDetailRowText,
    letterSpacing: typography.detailLetterSpacing,
    flex: 1,
  },
  description: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: "#494949",
    lineHeight: 22,
    letterSpacing: typography.letterSpacing,
  },
  ctaContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.card,
  },
  ctaContainerActive: {
    backgroundColor: "#F5F5F5",
  },
  introMessageText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    fontStyle: "italic",
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  ctaButtonDisabled: {
    backgroundColor: colors.eventDetailButtonDisabledBackground,
  },
  ctaButtonPressed: {
    opacity: 0.7,
  },
  ctaLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  ctaLabelDisabled: {
    color: colors.eventDetailButtonDisabledText,
  },
  ownerButton: {
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
  ownerLabel: {
    color: colors.text,
  },
  fallbackContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  fallbackText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText,
    textAlign: "center",
  },
  fallbackBackButton: {
    position: "absolute",
    top: spacing.lg,
    left: spacing.lg,
  },

  // Separator bar before tabs (host only)
  tabSeparator: {
    height: 8,
    backgroundColor: "#F4F4F4",
    marginHorizontal: -spacing.md,
    marginTop: spacing.md,
  },

  // Tab container and items
  tabContainer: {
    flexDirection: "row",
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  tabItem: {
    alignItems: "flex-start",
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tabLabel: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText,
    lineHeight: 16,
    letterSpacing: -0.3,
  },
  tabLabelActive: {
    color: colors.text,
  },
  tabCount: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#808080",
    lineHeight: 15,
    letterSpacing: -0.3,
  },
  tabUnderline: {
    alignSelf: "stretch",
    height: 2,
    backgroundColor: colors.text,
    marginTop: 4,
  },

  // List container for requests/members
  listContainer: {
    marginTop: spacing.sm,
  },

  // Request item styles
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
  requestActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginTop: spacing.xs,
  },

  // Action buttons (accept/decline)
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

  // Member item styles
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  memberName: {
    flex: 1,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: typography.lineHeight,
  },

  // Avatar styles
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: 16,
    textAlign: "center",
    includeFontPadding: false,
  },
  avatarInitialCompact: {
    fontSize: 11,
    lineHeight: 11,
  },

  // See more text
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#707070",
    lineHeight: 20,
    letterSpacing: -0.5,
    marginTop: 2,
  },

  // Empty state text
  emptyStateText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },

  // Secondary CTA button (for host)
  ctaButtonSecondary: {
    backgroundColor: "#E6E6E6",
  },
  ctaLabelSecondary: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: "#000000",
    lineHeight: 24,
    letterSpacing: -0.5,
    textAlign: "center",
  },

  // 1:1 event request row styles
  requestInfo: {
    flex: 1,
  },
  requesterName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.5,
  },
  requestMessagePreview: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  requestMenuButton: {
    padding: 8,
  },
});

export default EventDetailsScreen;
