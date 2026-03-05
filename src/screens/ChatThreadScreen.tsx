import { Feather } from "@expo/vector-icons";
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
  Image,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenContainer from "@components/ScreenContainer";
import { colors, spacing, typography } from "@theme/index";
import { useChat } from "@context/ChatContext";
import type { ChatMessage } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import { useEvents } from "@context/EventsContext";
import { resolveCoverUri } from "@constants/covers";
import { RootStackParamList } from "@navigation/types";

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

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId,
      ) ?? null,
    [conversations, activeConversationId],
  );

  const eventCoverUri = useMemo(() => {
    if (!activeConversation?.eventId) {
      return null;
    }
    const match = events.find(
      (eventItem) => Number(eventItem.id) === activeConversation.eventId,
    );
    if (!match) {
      return null;
    }
    return resolveCoverUri(match.coverKey ?? null);
  }, [activeConversation, events]);

  const activeEvent = useMemo(() => {
    if (!activeConversation?.eventId) {
      return null;
    }
    return (
      events.find((eventItem) => Number(eventItem.id) === activeConversation.eventId) ??
      null
    );
  }, [activeConversation, events]);

  const activeEventGroupType = useMemo(
    () => activeConversation?.event?.groupType ?? activeEvent?.groupType ?? null,
    [activeConversation, activeEvent],
  );

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
    const memberCount =
      activeConversation.memberIds?.length ??
      activeConversation.participants?.length ??
      0;
    return (
      !!activeConversation.eventId ||
      memberCount > 2 ||
      (!!activeConversation.title && memberCount > 1)
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
      !isConversationHost ||
      activeEventGroupType !== "Single"
    ) {
      return;
    }
    refreshJoinRequests(
      activeConversation.id,
      activeConversation.eventId,
      {
        includeApproved: true,
      },
    ).catch(() => undefined);
  }, [activeConversation, activeEventGroupType, isConversationHost, refreshJoinRequests]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      const windowHeight = Dimensions.get("window").height;
      const screenY = event.endCoordinates?.screenY ?? windowHeight;
      const keyboardHeight = Math.max(0, windowHeight - screenY);
      setAndroidKeyboardOffset(keyboardHeight);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const messagesListRef = useRef<FlatList<ChatMessage>>(null);

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
  const approvedJoinRequestCount = isConversationHost
    ? joinRequests.filter((request) => request.status === "approved").length
    : 0;
  const canViewJoinRequests =
    isConversationHost &&
    !!activeConversation?.eventId &&
    activeEventGroupType === "Single";

  if (!activeConversation) {
    return null;
  }

  const handleOpenJoinRequests = () => {
    if (
      !activeConversation ||
      !activeConversation.eventId ||
      !isConversationHost ||
      activeEventGroupType !== "Single"
    ) {
      return;
    }
    navigation.navigate("JoinRequests", {
      conversationId: activeConversation.id,
      eventId: activeConversation.eventId,
      title: activeConversation.event?.title ?? activeConversation.displayName,
      groupType: "Single",
      eventDetails: activeConversation.event
        ? {
            coverKey: activeConversation.event.coverKey,
            dateLabel: activeConversation.event.dateLabel ?? "",
            location: activeConversation.event.location ?? "",
            time: activeConversation.event.time ?? "",
          }
        : activeEvent
          ? {
              coverKey: activeEvent.coverKey ?? undefined,
              dateLabel: activeEvent.dateLabel,
              location: activeEvent.location,
              time: activeEvent.time,
            }
          : undefined,
    });
  };

  const getAvatarColor = (id: number) => {
    const hue = (id * 47) % 360;
    return `hsl(${hue}, 55%, 45%)`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const renderMessage = ({ item }: { item: (typeof messages)[number] }) => {
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
    const senderName = participant?.name ?? activeConversation.displayName ?? "";

    const bubble = (
      <View
        style={[
          styles.messageBubble,
          isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
          item.failed ? styles.messageBubbleFailed : undefined,
        ]}
      >
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
          {item.pending
            ? "Sending…"
            : item.failed
              ? "Failed. Tap to retry."
              : new Date(item.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
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

    const showAvatar = !isOwn && isGroupConversation;

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.messageRowOwn : styles.messageRowOther,
        ]}
      >
        {showAvatar ? (
          <View
            style={[
              styles.avatar,
              { backgroundColor: getAvatarColor(item.senderId) },
            ]}
          >
            <Text style={styles.avatarText}>{getInitials(senderName)}</Text>
          </View>
        ) : null}
        <View style={styles.messageBubbleContainer}>
          {showAvatar && senderName ? (
            <Text style={styles.senderName}>{senderName}</Text>
          ) : null}
          {bubbleContent}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <View style={styles.threadHeader}>
          <Pressable
            accessibilityRole="button"
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={8}
            testID="chat-back-button"
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.threadHeaderCopy}>
            <View style={styles.threadTitleRow}>
              {eventCoverUri ? (
                <Image
                  source={{ uri: eventCoverUri }}
                  style={styles.threadTitleCover}
                />
              ) : null}
              <Text style={styles.threadTitle} numberOfLines={1}>
                {activeConversation.displayName}
              </Text>
            </View>
            {isConnecting ? (
              <Text style={styles.threadSubtitle}>Connecting…</Text>
            ) : null}
          </View>
          {canViewJoinRequests && approvedJoinRequestCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View join requests"
              onPress={handleOpenJoinRequests}
            >
              <View style={styles.joinBadge}>
                <Text style={styles.joinBadgeText}>
                  {approvedJoinRequestCount > 99
                    ? "99+"
                    : approvedJoinRequestCount}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={styles.threadContainer}
          behavior="padding"
          keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
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
                { paddingBottom: spacing.xs },
              ]}
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
                  <Feather
                    name="send"
                    size={18}
                    color={isSendDisabled ? colors.muted : colors.buttonText}
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
                {
                  paddingBottom:
                    spacing.xs + Math.max(0, androidKeyboardOffset - insets.bottom),
                },
              ]}
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
                  <Feather
                    name="send"
                    size={18}
                    color={isSendDisabled ? colors.muted : colors.buttonText}
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
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
  },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  threadHeaderCopy: {
    flex: 1,
  },
  threadTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  threadTitleCover: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  threadTitle: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilyBold,
    color: colors.text,
  },
  threadSubtitle: {
    fontSize: typography.caption,
    color: colors.muted,
  },
  joinBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    marginLeft: spacing.sm,
  },
  joinBadgeText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilySemiBold,
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
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    flexShrink: 0,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: typography.fontFamilySemiBold,
  },
  senderName: {
    fontSize: typography.caption,
    color: colors.subText,
    fontFamily: typography.fontFamilySemiBold,
    marginBottom: 2,
    marginLeft: spacing.xs,
  },
  messageBubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  messageBubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  messageBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageBubbleFailed: {
    borderColor: colors.accent,
  },
  messageText: {
    fontFamily: typography.fontFamilyRegular,
  },
  messageTextOwn: {
    color: colors.buttonText,
  },
  messageTextOther: {
    color: colors.text,
  },
  messageMeta: {
    marginTop: 4,
    fontSize: typography.caption,
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
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  systemMessageText: {
    fontSize: typography.caption,
    color: colors.subText,
    textAlign: "center",
  },
  composerContainer: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  composerInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    fontFamily: typography.fontFamilyRegular,
  },
  sendIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sendIconButtonDisabled: {
    backgroundColor: "transparent",
  },
});

export default ChatThreadScreen;
