import { Feather } from "@expo/vector-icons";
import {
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenContainer from "@components/ScreenContainer";
import { colors, spacing, typography } from "@theme/index";
import { useChat } from "@context/ChatContext";
import type { ChatMessage } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";

const ChatThreadScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
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
  const [keyboardExtraOffset, setKeyboardExtraOffset] = useState(0);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId,
      ) ?? null,
    [conversations, activeConversationId],
  );

  const joinRequests = useMemo(() => {
    if (!activeConversationId) {
      return [];
    }
    return joinRequestsByConversation[activeConversationId] ?? [];
  }, [activeConversationId, joinRequestsByConversation]);

  useEffect(() => {
    if (!activeConversationId) {
      navigation.goBack();
    }
  }, [activeConversationId, navigation]);

  useEffect(() => {
    if (!activeConversation || !activeConversation.eventId) {
      return;
    }
    refreshJoinRequests(
      activeConversation.id,
      activeConversation.eventId,
    ).catch(() => undefined);
  }, [activeConversation, refreshJoinRequests]);

  const messagesListRef = useRef<FlatList<ChatMessage>>(null);
  useEffect(() => {
    if (!messagesListRef.current) {
      return;
    }
    messagesListRef.current.scrollToEnd({ animated: true });
  }, [activeConversationId, messages.length]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardExtraOffset(insets.bottom);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardExtraOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleBack = () => {
    setActiveConversation(null);
    navigation.goBack();
  };

  const handleSend = () => {
    if (!activeConversationId || !draft.trim()) {
      return;
    }
    sendMessage(activeConversationId, draft.trim());
    setDraft("");
  };

  if (!activeConversation) {
    return null;
  }

  const isConversationHost = user?.id === activeConversation.createdBy;
  const pendingJoinRequestCount = isConversationHost ? joinRequests.length : 0;

  const renderMessage = ({ item }: { item: (typeof messages)[number] }) => {
    const isOwn = item.senderId === user?.id;
    const participant = activeConversation.participants?.find(
      (p) => p.id === item.senderId,
    );
    const avatarLabel =
      participant?.name ?? activeConversation.displayName ?? "";

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

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.messageRowOwn : styles.messageRowOther,
        ]}
      >
        <View style={styles.messageBubbleContainer}>{bubbleContent}</View>
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
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.threadHeaderCopy}>
            <Text style={styles.threadTitle}>{activeConversation.displayName}</Text>
            {isConnecting ? (
              <Text style={styles.threadSubtitle}>Connecting…</Text>
            ) : null}
          </View>
          {pendingJoinRequestCount > 0 ? (
            <View style={styles.joinBadge}>
              <Text style={styles.joinBadgeText}>
                {pendingJoinRequestCount > 99 ? "99+" : pendingJoinRequestCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <KeyboardAvoidingView
        style={styles.threadContainer}
        behavior={Platform.select({ ios: "padding", android: "height" })}
        keyboardVerticalOffset={keyboardExtraOffset}
      >
        <View style={styles.threadBody}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <FlatList
            data={messages}
            keyExtractor={(message) => message.id}
            renderItem={renderMessage}
            ref={messagesListRef}
            contentContainerStyle={[styles.messagesList, { paddingBottom: spacing.sm }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
          <View
            style={[
              styles.composerContainer,
              { paddingBottom: insets.bottom },
            ]}
          >
            <TextInput
              placeholder={`Message ${activeConversation.displayName}`}
              value={draft}
              onChangeText={setDraft}
              style={styles.composerInput}
              placeholderTextColor={colors.muted}
            />
            <Pressable
              onPress={handleSend}
              disabled={draft.trim().length === 0}
              style={[
                styles.sendButton,
                draft.trim().length === 0 && styles.sendButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.sendButtonText,
                  draft.trim().length === 0 && styles.sendButtonTextDisabled,
                ]}
              >
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  threadHeaderCopy: {
    flex: 1,
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
    paddingTop: spacing.sm,
  },
  messageRow: {
    marginBottom: spacing.sm,
  },
  messageRowOwn: {
    alignItems: "flex-end",
  },
  messageRowOther: {
    alignItems: "flex-start",
  },
  messageBubbleContainer: {
    maxWidth: "80%",
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
  composerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "transparent",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: typography.fontFamilyRegular,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  sendButtonDisabled: {
    backgroundColor: colors.muted,
  },
  sendButtonText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilyMedium,
  },
  sendButtonTextDisabled: {
    color: colors.surface,
  },
});

export default ChatThreadScreen;
