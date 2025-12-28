import { useEffect, useMemo, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors, spacing, typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";
import { useEvents, UserEvent } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { useChat } from "@context/ChatContext";
import { API_BASE_URL } from "@api/config";
import EventActionOverlay from "@components/EventActionOverlay";

type EventDetailsRoute = RouteProp<RootStackParamList, "EventDetails">;
type EventDetailsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "EventDetails"
>;

const readableDateLabel = (label: "Today" | "Tmrw") =>
  label === "Today" ? "Today" : "Tomorrow";

const EventDetailsScreen = () => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const insets = useSafeAreaInsets();
  const { events, deleteUserEvent, markEventRequested, isEventRequested, unmarkEventRequested } =
    useEvents();
  const { user, token } = useAuth();
  const { conversations, setActiveConversation } = useChat();

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
  const origin = route.params.origin ?? "Events";
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
  const [inviteSuccessVisible, setInviteSuccessVisible] = useState(false);
  const [showManagePrompt, setShowManagePrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResultVisible, setDeleteResultVisible] = useState(false);
  const [userIntroMessage, setUserIntroMessage] = useState<string | null>(null);
  const [showPendingRequestPrompt, setShowPendingRequestPrompt] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessVisible, setReportSuccessVisible] = useState(false);

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
  const shouldShowInvitePrompt = showInvitePrompt && !isOwner;
  const hostLine = isOwner ? "Hosted by you" : `Hosted by ${event.hostName}`;
  const scheduleLine = `${readableDateLabel(event.dateLabel)}, ${event.time}`;
  const eventConversation = useMemo(() => {
    if (!event) {
      return null;
    }
    const numericId = Number(event.id);
    if (Number.isNaN(numericId)) {
      return null;
    }
    return conversations.find(
      (conversation) => conversation.eventId === numericId,
    );
  }, [conversations, event]);

  const isConversationMember = useMemo(() => {
    if (!user || !eventConversation) {
      return false;
    }
    return eventConversation.memberIds.includes(user.id);
  }, [eventConversation, user]);

  useEffect(() => {
    if (isConversationMember) {
      setHasPendingRequest(false);
    }
  }, [isConversationMember]);

  // Fetch the user's introduction message when they have a pending request
  useEffect(() => {
    if (!hasPendingRequest || !token || !event || isOwner) {
      setUserIntroMessage(null);
      return;
    }

    const fetchUserRequest = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/chat/requests/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
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
  }, [hasPendingRequest, token, event, isOwner]);

  const ctaLabel = isOwner
    ? "Manage Event"
    : hasPendingRequest
      ? "Request Pending"
      : "Interested";

  const showStandardCTA = isOwner || (!isOwner && !isConversationMember);
  const showOpenChatCTA =
    !isOwner && isConversationMember && !!eventConversation;

  const handleCtaPress = () => {
    if (isOwner) {
      setShowManagePrompt(true);
      return;
    }
    if (hasPendingRequest) {
      setShowPendingRequestPrompt(true);
      return;
    }
    if (isConversationMember) {
      return;
    }
    setShowInvitePrompt((prev) => !prev);
  };

  const handleOpenChat = () => {
    if (!eventConversation) {
      return;
    }
    setActiveConversation(eventConversation.id);
    (navigation as any).navigate("ChatThread");
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
      const response = await fetch(
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
      if (response.status === 401) {
        navigation.navigate("Login");
        return;
      }
      if (response.status === 409) {
        setHasPendingRequest(true);
        markEventRequested(event.id);
        setInviteError("You already have a pending request for this event.");
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to send request right now.");
      }
      setInviteMessage("");
      setShowInvitePrompt(false);
      setHasPendingRequest(true);
      markEventRequested(event.id);
      setInviteSuccessVisible(true);
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
    try {
      await deleteUserEvent(event.id);
      setShowDeleteConfirm(false);
      setDeleteResultVisible(true);
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

  const handleDismissDeleteResult = () => {
    setDeleteResultVisible(false);
    const targetTab = origin === "MyEvents" ? "MyEvents" : "Events";
    navigation.reset({
      index: 0,
      routes: [
        {
          name: "Main",
          params: { screen: targetTab },
        },
      ],
    });
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
      const response = await fetch(
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
      const response = await fetch(
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
      setReportSuccessVisible(true);
      // Clear local state for pending request since backend also cancels it
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
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

  const handleDismissReportSuccess = () => {
    setReportSuccessVisible(false);
    navigation.reset({
      index: 0,
      routes: [
        {
          name: "Main",
          params: { screen: "Events" },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <StatusBar
        barStyle="light-content" // For white icons/text
        translucent
        backgroundColor="transparent"
      />

      <View style={styles.contentWrapper}>
        <View
          style={[
            styles.heroContainer,
            { height: 320 + insets.top, paddingTop: insets.top + 10 },
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
          <Pressable
            accessibilityRole="button"
            onPress={navigation.goBack}
            style={[styles.backButton, { top: insets.top + 10 }]}
          >
            <Feather name="chevron-left" size={24} color={colors.buttonText} />
          </Pressable>

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

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>Details</Text>
            <View style={styles.detailDiv}>
              <View style={styles.detailRow}>
                <Feather
                  name="map-pin"
                  size={18}
                  color={colors.subText}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{event.location}</Text>
              </View>
              <View style={styles.detailRow}>
                <Feather
                  name="clock"
                  size={18}
                  color={colors.subText}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{scheduleLine}</Text>
              </View>
              <View style={styles.detailRow}>
                <Feather
                  name="users"
                  size={18}
                  color={colors.subText}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{event.audience}</Text>
              </View>
            </View>

            {!!event.description && (
              <>
                <Text style={styles.description}>{event.description}</Text>
              </>
            )}

            {userIntroMessage ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionHeading}>Introduction</Text>
                <Text style={styles.introMessageText}>"{userIntroMessage}"</Text>
              </>
            ) : null}
          </View>
        </ScrollView>
        {showStandardCTA && (
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
                isOwner && styles.ownerButton,
                pressed && styles.ctaButtonPressed,
                (shouldShowInvitePrompt || (hasPendingRequest && !isOwner)) &&
                  styles.ctaButtonDisabled,
              ]}
              disabled={
                shouldShowInvitePrompt ||
                (!isOwner && isConversationMember)
              }
            >
              <Text
                style={[
                  styles.ctaLabel,
                  isOwner && styles.ownerLabel,
                  shouldShowInvitePrompt && styles.ctaLabelDisabled,
                ]}
              >
                {ctaLabel}
              </Text>
            </Pressable>
            
          </View>
        )}
        {showOpenChatCTA ? (
          <View style={styles.ctaContainer}>
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenChat}
              style={({ pressed }) => [
                styles.ctaButton,
                pressed && styles.ctaButtonPressed,
              ]}
            >
              <Text style={styles.ctaLabel}>Open Chat</Text>
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
        isVisible={deleteResultVisible}
        onBackdropPress={handleDismissDeleteResult}
        type="result"
        title="Event removed"
        description="We've cleared the event from the list."
        dismissLabel="Done"
        onDismiss={handleDismissDeleteResult}
        tone="default"
      />
      <EventActionOverlay
        isVisible={inviteSuccessVisible}
        onBackdropPress={() => setInviteSuccessVisible(false)}
        type="result"
        title="Request sent"
        description="We'll notify you in chat when the host responds."
        dismissLabel="Done"
        onDismiss={() => setInviteSuccessVisible(false)}
        tone="success"
      />
      <EventActionOverlay
        isVisible={showPendingRequestPrompt}
        onBackdropPress={
          isCancellingRequest ? undefined : () => setShowPendingRequestPrompt(false)
        }
        type="pendingRequest"
        onCancelRequest={handleCancelRequest}
        onReportEvent={handleOpenReportPrompt}
        isCancelling={isCancellingRequest}
      />
      <EventActionOverlay
        isVisible={showReportPrompt}
        onBackdropPress={
          isSubmittingReport ? undefined : () => setShowReportPrompt(false)
        }
        type="report"
        reportMessage={reportMessage}
        onReportMessageChange={(text) => {
          setReportMessage(text);
          if (reportError) {
            setReportError(null);
          }
        }}
        onSubmitReport={handleSubmitReport}
        reportError={reportError}
        reportSubmitting={isSubmittingReport}
        reportDisabled={!reportMessage.trim()}
      />
      <EventActionOverlay
        isVisible={reportSuccessVisible}
        onBackdropPress={handleDismissReportSuccess}
        type="result"
        title="Report submitted"
        description="Thank you for helping keep our community safe."
        dismissLabel="Done"
        onDismiss={handleDismissReportSuccess}
        tone="success"
      />
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
    paddingTop: spacing.lg,
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
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.cardMeta,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  sectionHeading: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: "#525252",
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
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
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    flex: 1,
  },
  description: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: typography.lineHeight,
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
    backgroundColor: colors.eventDetailButtonBackground,
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
    color: colors.eventDetailButtonText,
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
});

export default EventDetailsScreen;
