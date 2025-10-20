import { Feather } from '@expo/vector-icons';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenContainer from '@components/ScreenContainer';
import EmptyState from '@components/EmptyState';
import { colors, spacing, typography } from '@theme/index';
import { useChat } from '@context/ChatContext';
import type { ChatConversation, ChatMessage } from '@context/ChatContext';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import EmptyMessageIllustration from '@assets/empty-message.svg';

type MessagesNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Messages'>,
  NativeStackNavigationProp<RootStackParamList>
>;

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
  const navigation = useNavigation<MessagesNavigation>();
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

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        return undefined;
      }
      refreshConversations().catch(() => undefined);
      return undefined;
    }, [refreshConversations, user])
  );

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <EmptyState
          title="No chats to show"
          description="Log in to see all chats"
          actionLabel="Login"
          onActionPress={() => navigation.navigate('Login')}
          illustration={EmptyMessageIllustration}
          illustrationSize={40}
        />
      </ScreenContainer>
    );
  }

  const handleSend = () => {
    if (!activeConversationId) {
      return;
    }
    sendMessage(activeConversationId, draft);
    setDraft('');
  };

  const renderMessage = ({ item }: { item: typeof messages[number] }) => {
    const isOwn = item.senderId === user?.id;
    const participant = activeConversation?.participants.find((p) => p.id === item.senderId);
    const avatarLabel = participant?.name ?? activeConversation?.displayName ?? '';
    const avatarColor = getAvatarColor(participant?.id, item.conversationId);

    const bubble = (
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

    const bubbleContent = item.failed ? (
      <Pressable onPress={() => retryMessage(item.conversationId, item)}>{bubble}</Pressable>
    ) : (
      bubble
    );

    const avatar = (
      <View style={[styles.messageAvatar, { backgroundColor: avatarColor }]}> 
        <Text style={styles.messageAvatarInitial}>{getInitial(avatarLabel)}</Text>
      </View>
    );

    return (
      <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
        {!isOwn ? avatar : <View style={styles.messageAvatarPlaceholder} />}
        <View
          style={[
            styles.messageBubbleContainer,
            isOwn ? styles.messageBubbleContainerOwn : styles.messageBubbleContainerOther
          ]}
        >
          {bubbleContent}
        </View>
        {isOwn ? avatar : <View style={styles.messageAvatarPlaceholder} />}
      </View>
    );
  };

  const renderConversation = ({ item }: { item: ChatConversation }) => {
    const participants = item.participants ?? [];
    const counterpart = participants.find((participant) => participant.id !== user?.id) ?? participants[0];
    const avatarColor = getAvatarColor(counterpart?.id, item.id);
    const memberCount = item.memberIds?.length ?? participants.length;
    const isGroup = memberCount > 2 || !!item.event || (!!item.title && memberCount > 1);
    const titleLabel = isGroup ? item.event?.title ?? item.title ?? item.displayName : counterpart?.name ?? item.displayName;
    const primaryLabel = counterpart?.name ?? titleLabel;
    const eventMetaParts: string[] = [];
    if (item.event) {
      if (item.event.location) {
        eventMetaParts.push(item.event.location);
      }
      eventMetaParts.push(`${item.event.dateLabel} ${item.event.time}`);
      if (isGroup && counterpart?.name) {
        eventMetaParts.push(`With ${counterpart.name}`);
      }
    } else if (isGroup && counterpart?.name) {
      eventMetaParts.push(`With ${counterpart.name}`);
    }
    const eventDetails = eventMetaParts.join(' • ');
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
            {titleLabel}
          </Text>
          {eventDetails ? (
            <Text style={styles.conversationEvent} numberOfLines={1}>
              {eventDetails}
            </Text>
          ) : null}
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
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <View style={styles.container}>
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
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </View>
      </ScreenContainer>
    );
  }

  const threadTitleLabel = activeConversation.event?.title ?? activeConversation.displayName;
  const threadEventDetails = activeConversation.event ? [
    `${activeConversation.event.dateLabel} ${activeConversation.event.time}`,
    activeConversation.event.location
  ].filter(Boolean).join(' • ') : undefined;

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>
      <KeyboardAvoidingView
        style={styles.threadContainer}
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        keyboardVerticalOffset={Platform.select({ ios: 80, android: 0 })}
      >
        <View style={styles.threadHeader}>
          <Pressable
            accessibilityLabel="Back to conversations"
            onPress={() => setActiveConversation(null)}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.threadHeaderCopy}>
            <Text style={styles.threadTitle}>{threadTitleLabel}</Text>
            {threadEventDetails ? (
              <Text style={styles.threadEvent}>{threadEventDetails}</Text>
            ) : null}
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
          onContentSizeChange={() => {
            if (messagesListRef.current) {
              messagesListRef.current.scrollToEnd({ animated: false });
            }
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: spacing.md,
    gap: spacing.md
  },
  threadContainer: {
    flex: 1,
    paddingBottom: spacing.sm,
    gap: spacing.md
  },
  headerSpacing: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
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
    paddingHorizontal: spacing.sm,
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
  conversationEvent: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: typography.small,
    color: colors.muted,
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
  threadEvent: {
    fontSize: typography.small,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText
  },
  threadSubtitle: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.muted
  },
  messagesList: {
    flexGrow: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  messageRowOwn: {
    justifyContent: 'flex-end'
  },
  messageRowOther: {
    justifyContent: 'flex-start'
  },
  messageBubbleContainer: {
    flexShrink: 1,
    flexGrow: 1,
    maxWidth: '80%'
  },
  messageBubbleContainerOwn: {
    alignItems: 'flex-end'
  },
  messageBubbleContainerOther: {
    alignItems: 'flex-start'
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  messageAvatarInitial: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.small,
    color: colors.text
  },
  messageAvatarPlaceholder: {
    width: 32,
    height: 32
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16
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
    gap: spacing.sm,
    paddingBottom: spacing.sm
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
