import { Feather } from "@expo/vector-icons";
import SendIcon from "@assets/chat-icons/send.svg";
import {
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenContainer from "@components/ScreenContainer";
import ChatEventHeader from "@components/ChatEventHeader";
import UserAvatar from "@components/UserAvatar";
import { colors, spacing, typography } from "@theme/index";
import { useChat } from "@context/ChatContext";
import type { ChatMessage } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import { useEvents } from "@context/EventsContext";
import { resolveCoverUri } from "@constants/covers";
import { RootStackParamList } from "@navigation/types";
import { formatAbsoluteDateLabel } from "@utils/dateTime";

const HEADER_HEIGHT = 56;

const ChatThreadScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { events } = useEvents();
  const {
    activeConversationId,
    conversations,
    setActiveConversation,
    messages,
    sendMessage,
    retryMessage,
    isConnecting,
    error,
    joinRequestsByConversation,
    refreshJoinRequests,
  } = useChat();

  const [draft, setDraft] = useState("");
  const [androidKeyboardOffset, setAndroidKeyboardOffset] = useState(0);
  const messagesListRef = useRef<FlatList<ChatMessage>>(null);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId,
      ) ?? null,
    [conversations, activeConversationId],
  );

  const activeEvent = useMemo(() => {
    if (!activeConversation?.eventId) {
      return null;
    }
    return (
      events.find((eventItem) => Number(eventItem.id) === activeConversation.eventId) ??
      null
    );
  }, [activeConversation, events]);

  const eventCoverUri = useMemo(() => {
    if (activeEvent?.imageUri) {
      return activeEvent.imageUri;
    }
    if (!activeConversation?.event?.coverKey) {
      return null;
    }
    return resolveCoverUri(activeConversation.event.coverKey ?? null);
  }, [activeConversation, activeEvent]);

  const activeEventDetails = useMemo(
    () => activeEvent ?? activeConversation?.event ?? null,
    [activeConversation, activeEvent],
  );

  const activeEventGroupType = useMemo(
    () => activeEventDetails?.groupType ?? null,
    [activeEventDetails],
  );

  const headerTitle = useMemo(() => {
    if (activeEventGroupType === "Single" && activeConversation && user) {
      const otherUser = activeConversation.participants?.find(
        (p) => p.id !== user.id,
      );
      if (otherUser?.name) return otherUser.name;
    }
    return activeConversation?.displayName ?? "";
  }, [activeConversation, activeEventGroupType, user]);

  const headerSubtitle = useMemo(() => {
    if (isConnecting) return "Connecting\u2026";
    if (activeEventGroupType === "Single" && activeEventDetails) {
      const title = activeEventDetails.title;
      const datePart = activeEventDetails.eventDate
        ? formatAbsoluteDateLabel(activeEventDetails.eventDate)
        : activeEventDetails.dateLabel;
      return datePart ? `${title}, ${datePart}` : title;
    }
    if (activeEventDetails?.time && activeEventDetails?.location) {
      const datePart = activeEventDetails.eventDate
        ? formatAbsoluteDateLabel(activeEventDetails.eventDate)
        : activeEventDetails.dateLabel;
      return `${datePart}, ${activeEventDetails.time} at ${activeEventDetails.location}`;
    }
    return undefined;
  }, [isConnecting, activeEventDetails, activeEventGroupType]);

  const joinRequests = useMemo(() => {
    if (!activeConversationId) {
      return [];
    }
    return joinRequestsByConversation[activeConversationId] ?? [];
  }, [activeConversationId, joinRequestsByConversation]);

  const isConversationHost = useMemo(() => {
    if (!activeConversation || !user) {
      return false;
    }
    return user.id === activeConversation.createdBy;
  }, [activeConversation, user]);

  const isGroupConversation = useMemo(() => {
    if (!activeConversation) return false;
    return (
      activeConversation.memberIds.length > 2 ||
      !!activeConversation.title ||
      !!activeConversation.eventId
    );
  }, [activeConversation]);

  useEffect(() => {
    if (!activeConversationId) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate("Main", { screen: "Messages" });
      }
    }
  }, [activeConversationId, navigation]);

  useEffect(() => {
    if (
      !activeConversation ||
      !activeConversation.eventId ||
      !isConversationHost
    ) {
      return;
    }
    refreshJoinRequests(
      activeConversation.id,
      activeConversation.eventId,
      {
        includeApproved: activeEventGroupType === "Single",
      },
    ).catch(() => undefined);
  }, [activeConversation, activeEventGroupType, isConversationHost, refreshJoinRequests]);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
    return () => showSub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      const windowHeight = Dimensions.get("window").height;
      const screenY = event.endCoordinates?.screenY ?? windowHeight;
      const keyboardHeightFromWindow = Math.max(0, windowHeight - screenY);
      const keyboardHeight =
        keyboardHeightFromWindow || event.endCoordinates?.height || 0;

      setAndroidKeyboardOffset(keyboardHeight);

      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Scroll to bottom when new messages arrive (non-inverted list)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length === 0) return;
    const animated = prevMessageCount.current > 0 && messages.length > prevMessageCount.current;
    prevMessageCount.current = messages.length;
    const timer = setTimeout(() => {
      messagesListRef.current?.scrollToEnd({ animated });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleBack = () => {
    setActiveConversation(null);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Main", { screen: "Messages" });
    }
  };

  const handleSend = () => {
    if (!activeConversationId || !draft.trim()) {
      return;
    }
    sendMessage(activeConversationId, draft.trim());
    setDraft("");
  };

  const isSendDisabled = draft.trim().length === 0;
  const closedComposerBottomPadding = insets.bottom + spacing.sm;
  const keyboardVisibleComposerPadding =
    spacing.sm + Math.max(0, androidKeyboardOffset - insets.bottom);
  const composerBottomPadding =
    Platform.OS === "android" && androidKeyboardOffset > 0
      ? keyboardVisibleComposerPadding
      : closedComposerBottomPadding;
  const pendingJoinRequestCount = isConversationHost
    ? joinRequests.filter((request) => request.status === "pending").length
    : 0;
  const canViewJoinRequests =
    isConversationHost &&
    !!activeConversation?.eventId;

  if (!activeConversation) {
    return null;
  }

  const handleOpenJoinRequests = () => {
    if (
      !activeConversation ||
      !activeConversation.eventId ||
      !isConversationHost
    ) {
      return;
    }
    navigation.navigate("PendingRequests", {
      conversationId: activeConversation.id,
      eventId: activeConversation.eventId,
    });
  };

  const renderMessage = ({ item, index }: { item: (typeof messages)[number]; index: number }) => {
    const lowerBody = item.body.toLowerCase();
    const isJoinSystemMessage = lowerBody.endsWith("joined the chat");
    const isEventUpdateSystemMessage = lowerBody === "updated event detail";

    if (isJoinSystemMessage || isEventUpdateSystemMessage) {
      return (
        <View style={styles.systemMessageRow}>
          <Text style={styles.systemMessageText}>{item.body}</Text>
        </View>
      );
    }

    const isOwn = item.senderId === user?.id;
    const participant = activeConversation.participants?.find(
      (p) => p.id === item.senderId,
    );
    const senderName = participant?.name ?? "";
    const firstName = senderName.split(" ")[0] || "";

    const prevMessage = index > 0 ? messages[index - 1] : null;
    const prevIsSystem = prevMessage
      ? prevMessage.body.toLowerCase().endsWith("joined the chat") ||
        prevMessage.body.toLowerCase() === "updated event detail"
      : false;
    const isFirstInRun =
      !prevMessage || prevMessage.senderId !== item.senderId || prevIsSystem;
    const showAvatar = !isOwn;
    const showName = showAvatar && isFirstInRun;

    const timeText = item.pending
      ? "Sending…"
      : item.failed
        ? "Failed. Tap to retry."
        : new Date(item.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

    const bubble = (
      <View
        style={[
          styles.messageBubble,
          isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
          item.failed ? styles.messageBubbleFailed : undefined,
        ]}
      >
        {showName && firstName ? (
          <Text style={styles.senderName}>{firstName}</Text>
        ) : null}
        <Text
          style={[
            styles.messageText,
            isOwn ? styles.messageTextOwn : styles.messageTextOther,
          ]}
        >
          {item.body}
        </Text>
        <Text
          style={[
            styles.messageMeta,
            item.failed
              ? styles.messageMetaFailed
              : isOwn
                ? styles.messageMetaOwn
                : styles.messageMetaOther,
          ]}
        >
          {timeText}
        </Text>
      </View>
    );

    const bubbleContent = item.failed ? (
      <Pressable onPress={() => retryMessage(item.conversationId, item)}>
        {bubble}
      </Pressable>
    ) : (
      bubble
    );

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.messageRowOwn : styles.messageRowOther,
        ]}
      >
        {showAvatar ? (
          isFirstInRun ? (
            <UserAvatar
              avatar={participant?.avatar}
              name={senderName}
              seed={item.senderId}
              size={30}
              maxInitials={2}
              style={styles.avatarCircle}
            />
          ) : (
            <View style={styles.avatarSpacer} />
          )
        ) : null}
        <View style={styles.messageBubbleContainer}>
          {bubbleContent}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top"]}>
      <ChatEventHeader
        onBack={handleBack}
        title={headerTitle}
        subtitle={headerSubtitle}
        coverUri={eventCoverUri}
        onTitlePress={() => {
          if (activeConversation?.eventId) {
            navigation.navigate("EventDetailsOverlay", {
              eventId: String(activeConversation.eventId),
              readOnly: true,
            });
          }
        }}
        rightElement={
          canViewJoinRequests && pendingJoinRequestCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View join requests"
              onPress={handleOpenJoinRequests}
              style={styles.joinIconButton}
            >
              <View style={styles.joinCountBadge}>
                <Text style={styles.joinCountBadgeText}>
                  {pendingJoinRequestCount > 99 ? "99+" : pendingJoinRequestCount}
                </Text>
              </View>
            </Pressable>
          ) : undefined
        }
        testID="chat-event-info-button"
      />
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={styles.threadContainer}
          behavior="padding"
          keyboardVerticalOffset={16}
        >
          <View style={styles.threadBody}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <FlatList
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={renderMessage}
              ref={messagesListRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
            <View
              style={[
                styles.composerContainer,
                { paddingBottom: composerBottomPadding },
              ]}
              testID="chat-composer-container"
            >
              <View style={styles.composerInputWrapper}>
                <TextInput
                  placeholder={`Message ${activeConversation.displayName}`}
                  value={draft}
                  onChangeText={setDraft}
                  style={styles.composerInput}
                  placeholderTextColor={colors.muted}
                  multiline
                />
                <Pressable
                  onPress={handleSend}
                  disabled={isSendDisabled}
                  style={[
                    styles.sendIconButton,
                    isSendDisabled && styles.sendIconButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <SendIcon
                    width={15}
                    height={16}
                    color={isSendDisabled ? "#A3A3A3" : colors.buttonText}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.threadContainer}>
          <View style={styles.threadBody}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <FlatList
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={renderMessage}
              ref={messagesListRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
            <View
              style={[
                styles.composerContainer,
                { paddingBottom: composerBottomPadding },
              ]}
              testID="chat-composer-container"
            >
              <View style={styles.composerInputWrapper}>
                <TextInput
                  placeholder={`Message ${activeConversation.displayName}`}
                  value={draft}
                  onChangeText={setDraft}
                  style={styles.composerInput}
                  placeholderTextColor={colors.muted}
                  multiline
                />
                <Pressable
                  onPress={handleSend}
                  disabled={isSendDisabled}
                  style={[
                    styles.sendIconButton,
                    isSendDisabled && styles.sendIconButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <SendIcon
                    width={15}
                    height={16}
                    color={isSendDisabled ? "#A3A3A3" : colors.buttonText}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  joinIconButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  joinCountBadge: {
    backgroundColor: "#E6E6E6",
    borderRadius: 999,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  joinCountBadgeText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.3,
  },
  errorText: {
    fontSize: typography.caption,
    color: colors.accent,
  },
  threadContainer: {
    flex: 1,
  },
  threadBody: {
    flex: 1,
  },
  messagesList: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  messageRow: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  messageBubbleContainer: {
    maxWidth: "75%",
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: spacing.xs,
    flexShrink: 0,
  },
  avatarSpacer: {
    width: 30,
    marginRight: spacing.xs,
    flexShrink: 0,
  },
  senderName: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: "500",
    lineHeight: 22,
    letterSpacing: -0.5,
    color: "#000000",
    marginBottom: 2,
  },
  messageBubble: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: 20,
    borderCurve: "continuous",
  },
  messageBubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  messageBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#F4F4F4",
  },
  messageBubbleFailed: {
    borderColor: colors.accent,
  },
  messageText: {
    fontSize: 17,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 22,
    letterSpacing: -0.5,
  },
  messageTextOwn: {
    color: colors.buttonText,
  },
  messageTextOther: {
    color: colors.text,
  },
  messageMeta: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 11,
    letterSpacing: -0.3,
    textAlign: "right",
  },
  messageMetaOwn: {
    color: colors.buttonText,
    opacity: 0.8,
  },
  messageMetaOther: {
    color: colors.subText,
  },
  messageMetaFailed: {
    color: colors.accent,
  },
  systemMessageRow: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    paddingHorizontal: spacing.lg,
  },
  systemMessageText: {
    fontSize: typography.caption,
    color: colors.subText,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  composerContainer: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  composerInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#F4F4F4",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    paddingVertical: spacing.xs,
    paddingLeft: 12,
    paddingRight: spacing.sm,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 16,
    letterSpacing: -0.3,
  },
  sendIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sendIconButtonDisabled: {
    backgroundColor: "#E6E6E6",
  },
});

export default ChatThreadScreen;
