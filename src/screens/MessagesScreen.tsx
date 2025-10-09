import { Feather } from '@expo/vector-icons';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';

import ScreenContainer from '@components/ScreenContainer';
import { colors, spacing, typography } from '@theme/index';
import { useChat } from '@context/ChatContext';
import type { ChatMessage } from '@context/ChatContext';
import { useAuth } from '@context/AuthContext';

const formatTimestamp = (value?: string) => {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const avatarPalette = ['#FFD7D7', '#FFE0B2', '#FFF3A6', '#C7F0D8', '#CFE7FF', '#E5D9FF'];

const getAvatarColor = (id: number | undefined, fallbackIndex = 0) => {
  const index = typeof id === 'number' ? Math.abs(id) % avatarPalette.length : fallbackIndex;
  return avatarPalette[index];
};

const getInitial = (label?: string | null) => {
  if (!label) {
    return '?';
  }
  const trimmed = label.trim();
  if (!trimmed.length) {
    return '?';
  }
  return trimmed.charAt(0).toUpperCase();
};

const MessagesScreen = () => {
  const { user } = useAuth();
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    messages,
    sendMessage,
    retryMessage,
    isConnecting,
    error,
    refreshConversations,
    isRefreshingConversations
  } = useChat();

  const [draft, setDraft] = useState('');

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const messagesListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!messagesListRef.current) {
      return;
    }
    messagesListRef.current.scrollToEnd({ animated: true });
  }, [activeConversationId, messages.length]);

  const handleSend = () => {
    if (!activeConversationId) {
      return;
    }
    sendMessage(activeConversationId, draft);
    setDraft('');
  };

  const renderMessage = ({ item }: { item: typeof messages[number] }) => {
    const isOwn = item.senderId === user?.id;

    const messageContent = (
      <View
        style={[
          styles.messageBubble,
          isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
          item.failed ? styles.messageBubbleFailed : undefined
        ]}
      >
        <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>{item.body}</Text>
        <Text
          style={[
            styles.messageMeta,
            item.failed
              ? styles.messageMetaFailed
              : isOwn
              ? styles.messageMetaOwn
              : styles.messageMetaOther
          ]}
        >
          {item.pending ? 'Sending…' : item.failed ? 'Failed. Tap to retry.' : formatTimestamp(item.createdAt)}
        </Text>
      </View>
    );

    if (item.failed) {
      return (
        <Pressable onPress={() => retryMessage(item.conversationId, item)}>{messageContent}</Pressable>
      );
    }

    return messageContent;
  };

  const renderConversation = ({ item }: { item: (typeof conversations)[number] }) => {
    const counterpart = item.participants.find((participant) => participant.id !== user?.id) ??
      item.participants[0];
    const avatarColor = getAvatarColor(counterpart?.id, item.id);
    const primaryLabel = counterpart?.name ?? item.displayName;
    const secondaryLabel = item.title ? `${primaryLabel} • ${item.title}` : primaryLabel;
    const previewText = item.lastMessage?.body ?? 'No messages yet';

    return (
      <Pressable
        onPress={() => setActiveConversation(item.id)}
        style={[styles.conversationRow, item.id === activeConversationId && styles.conversationRowActive]}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarInitial}>{getInitial(primaryLabel)}</Text>
        </View>
        <View style={styles.conversationCopy}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {secondaryLabel}
          </Text>
          <Text style={styles.conversationPreview} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
        <View style={styles.conversationMeta}>
          <Text style={styles.conversationTime}>{formatTimestamp(item.lastMessage?.createdAt)}</Text>
          {item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (!activeConversation) {
    return (
      <ScreenContainer>
        <View style={styles.container}>
          <Text style={styles.header}>Chat</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {isConnecting ? <Text style={styles.helperText}>Connecting to chat…</Text> : null}
          <FlatList
            data={conversations}
            keyExtractor={(conversation) => String(conversation.id)}
            renderItem={renderConversation}
            ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptySubtitle}>
                  Start chatting with someone and they will appear here once a direct message is created.
                </Text>
              </View>
            )}
            contentContainerStyle={
              conversations.length === 0 ? styles.emptyListContainer : styles.conversationListContent
            }
            refreshing={isRefreshingConversations}
            onRefresh={refreshConversations}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.threadHeader}>
          <Pressable
            accessibilityLabel="Back to conversations"
            onPress={() => setActiveConversation(null)}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.threadHeaderCopy}>
            <Text style={styles.threadTitle}>{activeConversation.displayName}</Text>
            {isConnecting ? <Text style={styles.threadSubtitle}>Connecting…</Text> : null}
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <FlatList
          data={messages}
          keyExtractor={(message) => message.id}
          renderItem={renderMessage}
          ref={messagesListRef}
          contentContainerStyle={styles.messagesList}
        />

        <View style={styles.composerContainer}>
          <TextInput
            placeholder={`Message ${activeConversation.displayName}`}
            value={draft}
            onChangeText={setDraft}
            editable={!!activeConversationId}
            style={styles.composerInput}
            placeholderTextColor={colors.muted}
          />
          <Pressable
            onPress={handleSend}
            disabled={!activeConversationId || draft.trim().length === 0}
            style={[styles.sendButton, (!activeConversationId || draft.trim().length === 0) && styles.sendButtonDisabled]}
          >
            <Text style={[styles.sendButtonText, (!activeConversationId || draft.trim().length === 0) && styles.sendButtonTextDisabled]}>Send</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md
  },
  header: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilyBold,
    color: colors.text
  },
  helperText: {
    fontSize: typography.caption,
    color: colors.muted
  },
  errorText: {
    fontSize: typography.caption,
    color: colors.accent
  },
  listSeparator: {
    height: spacing.sm
  },
  conversationListContent: {
    paddingBottom: spacing.lg
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  conversationRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.card
  },
  conversationCopy: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.md
  },
  conversationMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.subtitle,
    color: colors.text
  },
  conversationName: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.subtitle,
    color: colors.text,
    marginBottom: spacing.xs / 2
  },
  conversationPreview: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: typography.body,
    color: colors.subText
  },
  conversationTime: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: typography.small,
    color: colors.muted
  },
  unreadBadge: {
    minWidth: 24,
    paddingHorizontal: spacing.xs,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unreadBadgeText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.small
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  emptyTitle: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilyBold,
    color: colors.text
  },
  emptySubtitle: {
    fontSize: typography.body,
    color: colors.subText,
    textAlign: 'center',
    fontFamily: typography.fontFamilyRegular
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  threadHeaderCopy: {
    flex: 1
  },
  threadTitle: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilyBold,
    color: colors.text
  },
  threadSubtitle: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.muted
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: spacing.sm
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    marginBottom: spacing.sm
  },
  messageBubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  messageBubbleFailed: {
    borderColor: colors.accent
  },
  messageText: {
    fontFamily: typography.fontFamilyRegular
  },
  messageTextOwn: {
    color: colors.buttonText
  },
  messageTextOther: {
    color: colors.text
  },
  messageMeta: {
    marginTop: 4,
    fontSize: typography.caption
  },
  messageMetaOwn: {
    color: colors.buttonText,
    opacity: 0.8
  },
  messageMetaOther: {
    color: colors.subText
  },
  messageMetaFailed: {
    color: colors.accent
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: typography.fontFamilyRegular
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20
  },
  sendButtonDisabled: {
    backgroundColor: colors.muted
  },
  sendButtonText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilyMedium
  },
  sendButtonTextDisabled: {
    color: colors.surface
  }
});

export default MessagesScreen;
