import { useEffect, useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import ScalePressable from "@components/ScalePressable";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  Pressable,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";

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
import LocationIcon from "@assets/EventDetails-icons/location.svg";
import TimeIcon from "@assets/EventDetails-icons/time.svg";
import PeopleIcon from "@assets/EventDetails-icons/people.svg";
import { LinearGradient } from "expo-linear-gradient";
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
import { getEventAnalyticsParams, trackEvent } from "@services/analytics";
import EventActionBadge from "@components/EventActionBadge";
import EventActionOverlay from "@components/EventActionOverlay";
import BottomSheetModal from "@components/BottomSheetModal";
import SignInButtons from "@components/SignInButtons";
import UserAvatar from "@components/UserAvatar";
import { formatEventDetailDateLabel } from "@utils/dateTime";
import { formatEventDetailAudienceLine } from "@utils/eventDisplay";

type EventDetailsRoute = RouteProp<
  RootStackParamList,
  "EventDetails" | "EventDetailsOverlay"
>;
type EventDetailsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "EventDetails" | "EventDetailsOverlay"
>;


const EventDetailsScreen = () => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const readOnly = (route.params as { readOnly?: boolean }).readOnly ?? false;
  const isOverlay = route.name === "EventDetailsOverlay";
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
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
  const [signInVisible, setSignInVisible] = useState(false);
  const [pendingSendAfterSignIn, setPendingSendAfterSignIn] = useState(false);
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

  useEffect(() => {
    if (user && signInVisible) {
      setSignInVisible(false);
    }
  }, [user, signInVisible]);

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
  const [descriptionHasMore, setDescriptionHasMore] = useState(false);
  const [fullDescHeight, setFullDescHeight] = useState(0);
  const [truncatedDescHeight, setTruncatedDescHeight] = useState(0);
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
    avatar?: string;
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

  const showEventUpdatedBadgeParam = (
    route.params as { showEventUpdatedBadge?: boolean }
  ).showEventUpdatedBadge;
  useEffect(() => {
    if (!showEventUpdatedBadgeParam) {
      return;
    }
    setShowEventUpdatedBadge(true);
  }, [showEventUpdatedBadgeParam]);

  useEffect(() => {
    if (fullDescHeight > 0 && truncatedDescHeight > 0) {
      setDescriptionHasMore(fullDescHeight > truncatedDescHeight + 1);
    }
  }, [fullDescHeight, truncatedDescHeight]);

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
  const eventAnalyticsParams = getEventAnalyticsParams({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
    scheduledAt: event.scheduledAt,
  });
  const hostLine = isOwner ? "Hosted by you" : `Hosted by ${event.hostName}`;
  const scheduleDateLabel = event.eventDate
    ? formatEventDetailDateLabel(event.eventDate)
    : event.dateLabel;
  const scheduleLine = `${scheduleDateLabel}, ${event.time}`;
  const audienceLine = formatEventDetailAudienceLine({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
  });
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
      avatar: event.hostAvatar,
    }),
    [event.hostAvatar, event.ownerId, event.hostName],
  );
  const goingParticipants = useMemo(() => {
    if (eventConversation?.participants?.length) {
      const memberSet = new Set(eventConversation.memberIds ?? []);
      return eventConversation.participants.filter((p) => memberSet.has(p.id));
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
    const memberSet = new Set(eventConversation.memberIds ?? []);
    return eventConversation.participants.filter(
      (p) => p.id !== user.id && memberSet.has(p.id),
    );
  }, [eventConversation, user]);

  // Overlay: all members with host sorted to top (for group events)
  const overlayMembers = useMemo(() => {
    if (!eventConversation) return [];
    const memberSet = new Set(eventConversation.memberIds ?? []);
    const allMembers = eventConversation.participants.filter((p) =>
      memberSet.has(p.id),
    );
    const hostId = event?.ownerId;
    return [...allMembers].sort((a, b) => {
      if (a.id === hostId) return -1;
      if (b.id === hostId) return 1;
      return 0;
    });
  }, [eventConversation, event?.ownerId]);

  // Fetch the user's introduction message when they have a pending request or are a member
  useEffect(() => {
    const shouldFetch =
      (hasPendingRequest || isConversationMember) && !isOwner && !readOnly;
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
  const shouldPinBottomCTA = !readOnly && (showStandardCTA || showOpenChatCTA);
  const pageScrollContentStyle = [
    styles.pageScrollContent,
    shouldPinBottomCTA
      ? { paddingBottom: 70 + insets.bottom }
      : null,
  ];

  const handleCtaPress = () => {
    // Pending state: CTA is disabled, actions handled via three-dot menu
    if (hasPendingRequest) {
      return;
    }
    if (isConversationMember) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!showInvitePrompt) {
      trackEvent("join_request_started", {
        ...eventAnalyticsParams,
        source: "event_details_cta",
      }).catch(() => undefined);
    }
    setShowInvitePrompt((prev) => !prev);
  };

  const handleOpenChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      });
      return;
    }

    if (!eventConversation) {
      return;
    }
    setActiveConversation(eventConversation.id);
    (navigation as any).push("ChatThread");
  };

  const renderAvatar = (
    participant: { id: number; name: string; avatar?: string },
    size: number = 40,
  ) => (
    <UserAvatar
      avatar={participant.avatar}
      name={participant.name}
      seed={participant.id}
      size={size}
    />
  );

  const handleAcceptRequest = async (request: ChatJoinRequest) => {
    if (!event || hostRequestStoreKey == null || eventNumericId == null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAcceptingUserId(request.userId);
    try {
      await approveJoinRequest(
        hostRequestStoreKey,
        eventNumericId,
        request.userId,
      );
      trackEvent("join_request_approved", eventAnalyticsParams).catch(
        () => undefined,
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDecliningUserId(request.userId);
    try {
      await denyJoinRequest(
        hostRequestStoreKey,
        eventNumericId,
        request.userId,
      );
      trackEvent("join_request_denied", eventAnalyticsParams).catch(
        () => undefined,
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveConversation(request.conversationId);
    (navigation as any).push("ChatThread");
  };

  const openMemberMenu = (member: {
    id: number;
    name: string;
    avatar?: string;
  }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMember(member);
    setShowMemberMenu(true);
  };

  const handleRemoveMember = async () => {
    if (!event || !token || !selectedMember) return;
    if (isRemovingMember) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      trackEvent("member_reported", eventAnalyticsParams).catch(
        () => undefined,
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
      trackEvent("guest_join_requires_auth", {
        ...eventAnalyticsParams,
        source: "event_details_invite",
      }).catch(() => undefined);
      setPendingSendAfterSignIn(true);
      setSignInVisible(true);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setInviteError(null);
    setIsSendingInvite(true);
    trackEvent("join_request_submitted", eventAnalyticsParams).catch(
      () => undefined,
    );
    let failureTracked = false;
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
        trackEvent("join_request_failed", {
          ...eventAnalyticsParams,
          status_code: response.status,
          reason_category: "duplicate_request",
        }).catch(() => undefined);
        return;
      }
      if (response.status === 401) {
        trackEvent("join_request_failed", {
          ...eventAnalyticsParams,
          status_code: response.status,
          reason_category: "unauthorized",
        }).catch(() => undefined);
        setSignInVisible(true);
        return;
      }
      if (!response.ok) {
        let serverMsg = "";
        try {
          const body = await response.json();
          serverMsg = body?.error || "";
        } catch {}
        console.warn(
          `Join request failed: status=${response.status} error=${serverMsg}`,
        );
        if (response.status === 403) {
          failureTracked = true;
          trackEvent("join_request_failed", {
            ...eventAnalyticsParams,
            status_code: response.status,
            reason_category: "forbidden",
          }).catch(() => undefined);
          throw new Error("You are unable to join this event.");
        }
        if (response.status === 404) {
          failureTracked = true;
          trackEvent("join_request_failed", {
            ...eventAnalyticsParams,
            status_code: response.status,
            reason_category: "not_found",
          }).catch(() => undefined);
          throw new Error("This event is no longer available.");
        }
        failureTracked = true;
        trackEvent("join_request_failed", {
          ...eventAnalyticsParams,
          status_code: response.status,
          reason_category: "api_error",
        }).catch(() => undefined);
        throw new Error(serverMsg || "Unable to send request right now.");
      }
      setInviteMessage("");
      setShowInvitePrompt(false);
      setHasPendingRequest(true);
      markEventRequested(event.id);
      setShowRequestSentBadge(true);
      trackEvent("join_request_succeeded", eventAnalyticsParams).catch(
        () => undefined,
      );
    } catch (err) {
      if (!failureTracked) {
        trackEvent("join_request_failed", {
          ...eventAnalyticsParams,
          reason_category: "network_error",
        }).catch(() => undefined);
      }
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

  // Auto-send invite after sign-in completes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user && token && pendingSendAfterSignIn) {
      setPendingSendAfterSignIn(false);
      handleSendInvite();
    }
  }, [user, token, pendingSendAfterSignIn]);

  const handleEdit = () => {
    (navigation as any).navigate("CreateEvent", { editEventId: event.id });
    setShowManagePrompt(false);
  };

  const handleDeletePrompt = () => {
    setShowManagePrompt(false);
    setDeleteError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!event) {
      return;
    }
    if (isDeleting) {
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      trackEvent("join_request_cancelled", eventAnalyticsParams).catch(
        () => undefined,
      );
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      trackEvent("event_reported", eventAnalyticsParams).catch(
        () => undefined,
      );
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

  const handleLeavePrompt = () => afterMenuClose(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setLeaveError(null);
    setShowLeaveConfirm(true);
  });

  const handleLeaveEvent = async () => {
    if (!event || !user || !token) {
      return;
    }
    if (isLeaving) {
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

  // On iOS, opening a new Modal while the previous one is animating closed
  // causes the second Modal to silently fail. Delay by 300ms to let the first finish.
  const afterMenuClose = (fn: () => void) => {
    setShowMenuOverlay(false);
    if (Platform.OS === 'ios') {
      setTimeout(fn, 300);
    } else {
      fn();
    }
  };

  const handleMenuReportEvent = () => afterMenuClose(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setReportMessage("");
    setReportError(null);
    setShowReportPrompt(true);
  });

  const handleMenuCancelRequest = () => {
    setShowMenuOverlay(false);
    handleCancelRequest();
  };

  const handleMenuViewIntro = () => afterMenuClose(() => setShowViewIntroOverlay(true));

  const handleMenuEdit = () => {
    setShowMenuOverlay(false);
    handleEdit();
  };

  const handleMenuDelete = () => afterMenuClose(handleDeletePrompt);

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
      // Pending: View Intro Message, Cancel Request, Report Event
      return [
        { label: "View Intro Message", onPress: handleMenuViewIntro },
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
        {!readOnly ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
              style={[styles.backButton, { top: insets.top + 10 }]}
            >
              <Feather
                name="chevron-left"
                size={24}
                color={colors.buttonText}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowMenuOverlay(true);
              }}
              style={[styles.menuButton, { top: insets.top + 10 }]}
            >
              <Feather
                name="more-horizontal"
                size={24}
                color={colors.buttonText}
              />
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
            hitSlop={12}
            style={[styles.overlayCloseButton, styles.overlayCloseButtonFixed]}
          >
            <Feather name="x" size={24} color={colors.buttonText} />
          </Pressable>
        )}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          contentContainerStyle={pageScrollContentStyle}
        >
          <View
            style={[
              styles.heroContainer,
              readOnly
                ? {
                    paddingTop: screenHeight * 0.065,
                    paddingBottom: screenHeight * 0.039,
                  }
                : { height: 320 + insets.top, paddingTop: insets.top + 10 },
            ]}
          >
            <Image
              source={{ uri: event.imageUri }}
              style={styles.heroBackgroundImage}
              contentFit="cover"
              blurRadius={28}
              transition={150}
            />
            <View pointerEvents="none" style={styles.heroOverlayDark} />
            <View pointerEvents="none" style={styles.heroOverlayLight} />

            {/* Elevated Image Card */}
            <View
              style={[
                styles.imageCardContainer,
                readOnly && styles.imageCardContainerOverlay,
              ]}
            >
              <Image
                source={{ uri: event.imageUri }}
                style={styles.imageCard}
                contentFit="cover"
                transition={150}
              />
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.hostedBy}>{hostLine}</Text>
            {!readOnly && isSingleEvent && (
              <Text style={styles.goingLabel} testID="going-count-label">
                1:1
              </Text>
            )}
            {!readOnly && !isSingleEvent && (
              <View style={styles.goingRow} testID="going-row">
                <View style={styles.goingAvatarStack}>
                  {goingParticipants.slice(0, 4).map((participant, index) => (
                    <View
                      key={`${participant.id}-${index}`}
                      style={[
                        styles.goingAvatarItem,
                        index > 0 && styles.goingAvatarOverlap,
                      ]}
                      testID={`going-avatar-${index}`}
                    >
                      {renderAvatar(participant, 24)}
                    </View>
                  ))}
                </View>
                <Text style={styles.goingLabel} testID="going-count-label">
                  {`${goingCount} Going`}
                </Text>
              </View>
            )}

            <View style={[styles.divider, { marginTop: 12, marginBottom: 12 }]} />

            <Text style={styles.sectionHeading}>Details</Text>
            <View style={styles.detailDiv}>
              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <LocationIcon width={20} height={20} color={colors.iconColor} />
                </View>
                <Text style={styles.detailText}>{event.location}</Text>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <TimeIcon width={20} height={20} color={colors.iconColor} />
                </View>
                <Text style={styles.detailText}>{scheduleLine}</Text>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <PeopleIcon width={20} height={20} color={colors.iconColor} />
                </View>
                <Text style={styles.detailText}>{audienceLine}</Text>
              </View>
            </View>

            {!!event.description && (
              <View style={{ marginTop: 6 }}>
                <View style={styles.measureContainer}>
                  <Text
                    style={styles.description}
                    onLayout={(e) => setFullDescHeight(e.nativeEvent.layout.height)}
                    testID="description-full-measure"
                  >
                    {event.description}
                  </Text>
                  <Text
                    style={styles.description}
                    numberOfLines={2}
                    onLayout={(e) => setTruncatedDescHeight(e.nativeEvent.layout.height)}
                    testID="description-truncated-measure"
                  >
                    {event.description}
                  </Text>
                </View>
                <Text
                  style={styles.description}
                  numberOfLines={descriptionExpanded ? undefined : 2}
                >
                  {event.description}
                </Text>
                {descriptionHasMore && (
                  <Text
                    style={styles.seeMoreText}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDescriptionExpanded((prev) => !prev);
                    }}
                  >
                    {descriptionExpanded ? "Show less" : "...See more"}
                  </Text>
                )}
              </View>
            )}

            {/* Host-only: Separator, Tabs, Requests/Members lists */}
            {isOwner && !readOnly && !(isOverlay && !isSingleEvent) && (
              <>
                {/* Tabs header + divider as one unit to avoid card gap */}
                <View>
                  <View style={styles.tabContainer}>
                    <ScalePressable
                      style={styles.tabItem}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setActiveTab("requests");
                      }}
                    >
                      <View style={styles.tabLabelRow}>
                        <Text style={[styles.tabLabel, activeTab === "requests" && styles.tabLabelActive]}>
                          Requests
                        </Text>
                        <Text style={[styles.tabCount, activeTab === "requests" && styles.tabCountActive]}>
                          {" "}{pendingRequests.length}
                        </Text>
                      </View>
                      {activeTab === "requests" && <View style={styles.tabUnderline} />}
                    </ScalePressable>

                    {isSingleEvent && (
                      <ScalePressable
                        style={styles.tabItem}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveTab("accepted");
                        }}
                      >
                        <View style={styles.tabLabelRow}>
                          <Text style={[styles.tabLabel, activeTab === "accepted" && styles.tabLabelActive]}>
                            Accepted
                          </Text>
                          <Text style={[styles.tabCount, activeTab === "accepted" && styles.tabCountActive]}>
                            {" "}{acceptedRequests.length}
                          </Text>
                        </View>
                        {activeTab === "accepted" && <View style={styles.tabUnderline} />}
                      </ScalePressable>
                    )}

                    {activeTab !== "accepted" && !isSingleEvent && (
                      <ScalePressable
                        style={styles.tabItem}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveTab("members");
                        }}
                      >
                        <View style={styles.tabLabelRow}>
                          <Text style={[styles.tabLabel, activeTab === "members" && styles.tabLabelActive]}>
                            Members
                          </Text>
                          <Text style={[styles.tabCount, activeTab === "members" && styles.tabCountActive]}>
                            {" "}{confirmedMembers.length}
                          </Text>
                        </View>
                        {activeTab === "members" && <View style={styles.tabUnderline} />}
                      </ScalePressable>
                    )}
                  </View>
                  <View style={[styles.divider, { marginVertical: 0 }]} />
                </View>

                {/* Requests list */}
                {activeTab === "requests" && (
                  <View style={styles.listContainer}>
                    {pendingRequests.length === 0 ? (
                      <Text style={styles.emptyStateText}>No requests yet</Text>
                    ) : (
                      pendingRequests.map((request, index) => {
                        const isExpanded = expandedRequestIds.has(request.id);
                        const isAccepting = acceptingUserId === request.userId;
                        const isDeclining = decliningUserId === request.userId;
                        const isLoading = isAccepting || isDeclining;

                        return (
                          <View key={request.id}>
                          <View style={styles.requestItem}>
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
                                <ScalePressable
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    toggleRequestExpanded(request.id);
                                  }}
                                >
                                  <Text style={styles.seeMoreText}>See more</Text>
                                </ScalePressable>
                              )}
                            </View>

                            <View style={styles.requestActions}>
                              <ScalePressable
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
                              </ScalePressable>

                              <ScalePressable
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
                              </ScalePressable>
                            </View>
                          </View>
                          {index < pendingRequests.length - 1 && (
                            <View style={styles.requestSeparator} />
                          )}
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
                        <ScalePressable
                          key={request.id}
                          onPress={() => handleRequesterPress(request)}
                          style={styles.memberItem}
                        >
                          {renderAvatar(request.requester)}
                          <Text style={styles.memberName}>
                            {request.requester.name}
                          </Text>
                          <ScalePressable
                            onPress={() => openMemberMenu(request.requester)}
                            style={styles.requestMenuButton}
                          >
                            <Feather
                              name="more-horizontal"
                              size={24}
                              color="#666"
                            />
                          </ScalePressable>
                        </ScalePressable>
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
                          <ScalePressable
                            onPress={() => openMemberMenu(member)}
                            style={styles.requestMenuButton}
                          >
                            <Feather
                              name="more-horizontal"
                              size={24}
                              color="#666"
                            />
                          </ScalePressable>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </>
            )}

            {/* Overlay: Members tab for group events (all users) */}
            {!isSingleEvent &&
              isOverlay &&
              (isOwner || isConversationMember) && (
                <>
                  <View>
                    <View style={styles.tabContainer}>
                      <View style={styles.tabItem}>
                        <View style={styles.tabLabelRow}>
                          <Text style={[styles.tabLabel, styles.tabLabelActive]}>
                            Members
                          </Text>
                          <Text style={styles.tabCount}>
                            {" "}{overlayMembers.length}
                          </Text>
                        </View>
                        <View style={styles.tabUnderline} />
                      </View>
                    </View>
                    <View style={[styles.divider, { marginVertical: 0 }]} />
                  </View>
                  <View style={styles.listContainer}>
                    {overlayMembers.length === 0 ? (
                      <Text style={styles.emptyStateText}>No members yet</Text>
                    ) : (
                      overlayMembers.map((member) => (
                        <View key={member.id} style={styles.memberItem}>
                          {renderAvatar(member)}
                          <Text style={styles.memberName}>{member.name}</Text>
                          {member.id === user?.id && isOwner ? (
                            <Text style={styles.hostBadgeText}>Host</Text>
                          ) : isOwner && member.id !== user?.id ? (
                            <ScalePressable
                              onPress={() => openMemberMenu(member)}
                              style={styles.requestMenuButton}
                            >
                              <Feather
                                name="more-horizontal"
                                size={24}
                                color="#666"
                              />
                            </ScalePressable>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}

            {userIntroMessage && !readOnly && isConversationMember ? (
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
        {shouldPinBottomCTA && showStandardCTA && !readOnly && (
          <View style={styles.pinnedCtaWrapper}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)']}
              locations={[0, 0.4]}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.ctaContainer,
                shouldShowInvitePrompt && styles.ctaContainerActive,
                { paddingBottom: insets.bottom + 4 },
              ]}
            >
              <ScalePressable
                onPress={handleCtaPress}
                disabled={shouldShowInvitePrompt || hasPendingRequest}
                style={[
                  styles.ctaButton,
                  (shouldShowInvitePrompt || hasPendingRequest) && styles.ctaButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.ctaLabel,
                    (shouldShowInvitePrompt || hasPendingRequest) && styles.ctaLabelDisabled,
                  ]}
                >
                  {ctaLabel}
                </Text>
              </ScalePressable>
            </View>
          </View>
        )}
        {shouldPinBottomCTA && showOpenChatCTA && !readOnly ? (
          <View style={styles.pinnedCtaWrapper}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)']}
              locations={[0, 0.4]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + 4 }]}>
              <ScalePressable
                onPress={handleOpenChat}
                style={[styles.ctaButton, isOwner && styles.ctaButtonSecondary]}
              >
                <Text style={[styles.ctaLabel, isOwner && styles.ctaLabelSecondary]}>
                  Go to Chat
                </Text>
              </ScalePressable>
            </View>
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
            label: `Report & Block ${selectedMember?.name?.split(" ")[0] ?? "Member"}`,
            onPress: handleReportMemberFromMenu,
          },
          {
            label: `Remove ${selectedMember?.name?.split(" ")[0] ?? "Member"}`,
            onPress: handleRemovePromptFromMenu,
            destructive: true,
          },
        ]}
      />
      <EventActionOverlay
        isVisible={showRemoveConfirm}
        onBackdropPress={isRemovingMember ? undefined : handleRemoveCancel}
        type="confirm"
        title={`Remove ${selectedMember?.name?.split(" ")[0] ?? "this member"}?`}
        description={
          isSingleEvent
            ? "They will be removed from this event and private chat."
            : "They will be removed from the group chat and will need to request to join again."
        }
        confirmLabel={`Remove ${selectedMember?.name?.split(" ")[0] ?? "Member"}`}
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
        onHidden={() => {
          setShowEventUpdatedBadge(false);
          navigation.setParams({ showEventUpdatedBadge: false });
        }}
      />
      <EventActionBadge
        visible={showRequestSentBadge}
        label="Requested to join"
        onHidden={() => {
          setShowRequestSentBadge(false);
        }}
      />
      <EventActionBadge
        visible={showRequestCancelledBadge}
        label="Requested to join cancelled"
        onHidden={() => {
          setShowRequestCancelledBadge(false);
        }}
      />
      <EventActionBadge
        visible={removedMemberBadgeLabel != null}
        label={removedMemberBadgeLabel ?? ""}
        onHidden={() => {
          setRemovedMemberBadgeLabel(null);
        }}
      />
      <EventActionBadge
        visible={reportedMemberBadgeLabel != null}
        label={reportedMemberBadgeLabel ?? ""}
        onHidden={() => {
          setReportedMemberBadgeLabel(null);
        }}
      />
      <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
        <SignInButtons />
      </BottomSheetModal>
    </>
  );

  if (readOnly) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        {screenContent}
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
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
  overlayCloseButtonFixed: {
    position: "absolute",
    top: 12,
    right: 16,
    zIndex: 10,
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
    width: "60%",
    aspectRatio: 1, // Square card
  },
  imageCardContainerOverlay: {
    width: "50%",
  },

  // The elevated image card
  imageCard: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    borderCurve: "continuous",
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
  pageScrollContent: {
    paddingBottom: 0,
  },
  card: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 20,
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
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: "#808080",
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
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  detailDiv: {
    flexDirection: "column",
    paddingTop: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 6,
  },
  detailIconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  detailText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: "#000000",
    letterSpacing: -0.4,
    flex: 1,
  },
  description: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: "#000000",
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  measureContainer: {
    position: "absolute",
    top: -9999,
    left: 0,
    right: 0,
    opacity: 0,
  },
  ctaContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: 'transparent',
  },
  pinnedCtaWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
    justifyContent: "flex-end",
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
    borderCurve: "continuous",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
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
    gap: 20,
    paddingTop: 20,
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
  tabCountActive: {
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
    marginTop: 8,
  },

  // List container for requests/members
  listContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },

  // Request item styles
  requestItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  requestSeparator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 48, // avatar (40) + gap (8)
    marginTop: spacing.sm + 6,
    marginBottom: spacing.sm + 6,
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
  // See more text
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: "#707070",
    lineHeight: 20,
    letterSpacing: -0.3,
    marginTop: 2,
  },

  // Empty state text
  emptyStateText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    textAlign: "center",
    paddingVertical: spacing.lg,
    letterSpacing: -0.3,
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
  hostBadgeText: {
    fontFamily: "Inter",
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 14,
    letterSpacing: -0.5,
    color: "#4E4E4E",
    marginLeft: "auto",
  },
});

export default EventDetailsScreen;
