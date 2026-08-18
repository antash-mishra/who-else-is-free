import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AndroidSoftInputModes,
  KeyboardController,
  KeyboardEvents,
} from 'react-native-keyboard-controller';

import SendIcon from '@assets/chat/send.svg';
import ScreenContainer from '@components/ScreenContainer';
import ChatEventHeader from '@components/ChatEventHeader';
import ConnectionStatusIndicator from '@components/ConnectionStatusIndicator';
import { CountBadge } from '@components/ui';
import EventActionOverlay from '@components/EventActionOverlay';
import useSingleEventMemberActions from '@hooks/useSingleEventMemberActions';
import UserAvatar from '@components/UserAvatar';
import { colors, radii, spacing, typography } from '@theme/index';
import { useChat } from '@context/ChatContext';
import type { ChatMessage } from '@context/ChatContext';
import { useAuth } from '@context/AuthContext';
import { useEvents } from '@context/EventsContext';
import { resolveCoverUri } from '@constants/covers';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { buildEventMemberSubtitle, buildOneToOneSubtitle } from '@utils/chatHeaderSubtitle';

const ANDROID_KEYBOARD_GAP = spacing.xs;

export const getAndroidComposerKeyboardTranslation = (
  keyboardHeight: number,
  composerBottomPadding: number,
) => -Math.max(0, keyboardHeight - composerBottomPadding + ANDROID_KEYBOARD_GAP);

interface ComposerProps {
  composerBottomPadding: number;
  draft: string;
  isSendDisabled: boolean;
  onDraftChange: (text: string) => void;
  onDismissReply: () => void;
  onSend: () => void;
  replySenderName: string;
  replyTarget: ChatMessage | null;
}

interface ReplyPreviewBarProps {
  replyTarget: ChatMessage;
  senderName: string;
  onDismiss: () => void;
}

const ReplyPreviewBar = ({ replyTarget, senderName, onDismiss }: ReplyPreviewBarProps) => (
  <View style={styles.replyBar} testID="reply-preview-bar">
    <View style={styles.replyBarInner} testID="reply-preview-surface">
      <View style={styles.replyBarBar} testID="reply-preview-rail" />
      <View style={styles.replyBarContent}>
        <Text style={styles.replyBarName} numberOfLines={1}>
          Replying to {senderName}
        </Text>
        <Text style={styles.replyBarBody} numberOfLines={1}>
          {replyTarget.body}
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        style={styles.replyBarDismissButton}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
      >
        <Text style={styles.replyBarDismiss}>✕</Text>
      </Pressable>
    </View>
  </View>
);

const ChatComposer = ({
  composerBottomPadding,
  draft,
  isSendDisabled,
  onDraftChange,
  onDismissReply,
  onSend,
  replySenderName,
  replyTarget,
}: ComposerProps) => (
  <View
    style={[styles.composerContainer, { paddingBottom: composerBottomPadding }]}
    testID="chat-composer-container"
  >
    <View
      style={[styles.composerShell, replyTarget && styles.composerShellWithReply]}
      testID="chat-composer-shell"
    >
      {replyTarget ? (
        <ReplyPreviewBar
          replyTarget={replyTarget}
          senderName={replySenderName}
          onDismiss={onDismissReply}
        />
      ) : null}
      <View
        style={[styles.composerInputRow, replyTarget && styles.composerInputRowWithReply]}
        testID="chat-composer-input-wrapper"
      >
        <TextInput
          placeholder="Write a message"
          value={draft}
          onChangeText={onDraftChange}
          style={styles.composerInput}
          placeholderTextColor={colors.tabInactive}
          multiline
        />
        <Pressable
          onPress={onSend}
          disabled={isSendDisabled}
          style={[styles.sendIconButton, isSendDisabled && styles.sendIconButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: isSendDisabled }}
        >
          <SendIcon
            width={15}
            height={16}
            color={isSendDisabled ? colors.tabInactive : colors.buttonText}
          />
        </Pressable>
      </View>
    </View>
  </View>
);

interface AndroidKeyboardDockProps {
  children: ReactNode;
  composerBottomPadding: number;
}

const AndroidKeyboardDock = ({ children, composerBottomPadding }: AndroidKeyboardDockProps) => {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);

    const showSub = KeyboardEvents.addListener('keyboardWillShow', (event) => {
      Animated.timing(translateY, {
        // Keep the closed-state safe-area padding behind the keyboard instead
        // of lifting it into a visible gap above the IME.
        toValue: getAndroidComposerKeyboardTranslation(event.height, composerBottomPadding),
        duration: event.duration || 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    const hideSub = KeyboardEvents.addListener('keyboardWillHide', (event) => {
      Animated.timing(translateY, {
        toValue: 0,
        duration: event.duration || 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      KeyboardController.setDefaultMode();
    };
  }, [composerBottomPadding, translateY]);

  return (
    <Animated.View style={{ transform: [{ translateY }] }} testID="android-keyboard-dock">
      {children}
    </Animated.View>
  );
};

const SWIPE_THRESHOLD = 60;
const LONG_PRESS_MS = 300;
const HIGHLIGHT_FADE_IN_MS = 160;
const HIGHLIGHT_HOLD_MS = 700;
const HIGHLIGHT_FADE_OUT_MS = 420;

const SwipeableBubble = ({
  children,
  onSwipeReply,
  onLongPress,
  isOwn,
  disabled,
  testID,
}: {
  children: React.ReactNode;
  onSwipeReply: () => void;
  onLongPress: () => void;
  isOwn: boolean;
  disabled?: boolean;
  testID: string;
}) => {
  const panX = useRef(new Animated.Value(0)).current;
  const swipeDirection = isOwn ? -1 : 1;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !disabled &&
        gestureState.dx * swipeDirection > 10 &&
        gestureState.dx * swipeDirection > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        panX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx * swipeDirection > SWIPE_THRESHOLD) {
          triggerHaptic('light');
          onSwipeReply();
        }
        Animated.spring(panX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(panX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        transform: [{ translateX: panX }],
        alignSelf: isOwn ? ('flex-end' as const) : ('flex-start' as const),
      }}
    >
      <Pressable testID={testID} onLongPress={onLongPress} delayLongPress={LONG_PRESS_MS}>
        {children}
      </Pressable>
    </Animated.View>
  );
};

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
    isRefreshingConversations,
    error,
    joinRequestsByConversation,
    refreshJoinRequests,
    refreshConversations,
  } = useChat();

  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesListRef = useRef<FlatList<ChatMessage>>(null);
  const visibleMessageIdsRef = useRef(new Set<string>());
  const pendingHighlightMessageIdRef = useRef<string | null>(null);
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightOpacity = useRef(new Animated.Value(0)).current;
  const highlightAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const highlightMessage = useCallback(
    (messageId: string) => {
      highlightAnimationRef.current?.stop();
      setHighlightedMessageId(messageId);
      highlightOpacity.setValue(0);

      const animation = Animated.sequence([
        Animated.timing(highlightOpacity, {
          toValue: 0.14,
          duration: HIGHLIGHT_FADE_IN_MS,
          useNativeDriver: true,
        }),
        Animated.delay(HIGHLIGHT_HOLD_MS),
        Animated.timing(highlightOpacity, {
          toValue: 0,
          duration: HIGHLIGHT_FADE_OUT_MS,
          useNativeDriver: true,
        }),
      ]);
      highlightAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (finished) {
          setHighlightedMessageId((current) => (current === messageId ? null : current));
        }
      });
    },
    [highlightOpacity],
  );
  const highlightMessageRef = useRef(highlightMessage);
  highlightMessageRef.current = highlightMessage;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken<ChatMessage>> }) => {
      const visibleIds = new Set(
        viewableItems
          .map((viewableItem) => viewableItem.item?.id)
          .filter((messageId): messageId is string => typeof messageId === 'string'),
      );
      visibleMessageIdsRef.current = visibleIds;

      const pendingMessageId = pendingHighlightMessageIdRef.current;
      if (pendingMessageId && visibleIds.has(pendingMessageId)) {
        pendingHighlightMessageIdRef.current = null;
        highlightMessageRef.current(pendingMessageId);
      }
    },
  ).current;
  const messageViewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;

  const handleScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      messagesListRef.current?.scrollToOffset({
        offset: Math.max(0, index * averageItemLength),
        animated: false,
      });
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
      scrollRetryTimerRef.current = setTimeout(() => {
        messagesListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }, 80);
    },
    [],
  );

  useEffect(
    () => () => {
      highlightAnimationRef.current?.stop();
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
    },
    [],
  );

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  useEffect(() => {
    if (activeConversationId == null || activeConversation || isRefreshingConversations) {
      return;
    }
    refreshConversations().catch((err) => {
      logger.error('Failed to refresh missing active conversation', err);
    });
  }, [activeConversation, activeConversationId, isRefreshingConversations, refreshConversations]);

  const activeEvent = useMemo(() => {
    if (!activeConversation?.eventId) {
      return null;
    }
    return events.find((eventItem) => Number(eventItem.id) === activeConversation.eventId) ?? null;
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

  const counterpart = useMemo(() => {
    if (!activeConversation || !user) {
      return null;
    }
    return (
      activeConversation.participants?.find((participant) => participant.id !== user.id) ?? null
    );
  }, [activeConversation, user]);

  const activeEventOwnerId = useMemo(() => {
    if (!activeEventDetails) {
      return null;
    }
    if ('ownerId' in activeEventDetails && typeof activeEventDetails.ownerId === 'number') {
      return activeEventDetails.ownerId;
    }
    if ('userId' in activeEventDetails && typeof activeEventDetails.userId === 'number') {
      return activeEventDetails.userId;
    }
    return null;
  }, [activeEventDetails]);

  const isGroupEventConversation = activeEventGroupType === 'Group';
  const isSingleEventConversation = activeEventGroupType === 'Single';

  const headerTitle = useMemo(() => {
    if (isSingleEventConversation && counterpart?.name) {
      return counterpart.name;
    }
    if (activeEventGroupType === 'Single' && activeConversation && user) {
      const otherUser = activeConversation.participants?.find((p) => p.id !== user.id);
      if (otherUser?.name) {
        return otherUser.name;
      }
    }
    return activeConversation?.displayName ?? '';
  }, [activeConversation, activeEventGroupType, counterpart, isSingleEventConversation, user]);

  const headerSubtitle = useMemo(() => {
    if (isSingleEventConversation) {
      return buildOneToOneSubtitle({ schedule: activeEventDetails });
    }
    if (isGroupEventConversation) {
      return buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: activeConversation?.memberIds.length ?? 0,
        schedule: activeEventDetails,
      });
    }
    return undefined;
  }, [activeEventDetails, activeConversation, isGroupEventConversation, isSingleEventConversation]);

  const joinRequests = useMemo(() => {
    if (activeConversationId == null) {
      return [];
    }
    const primary = joinRequestsByConversation[activeConversationId] ?? [];
    const eventScopedKey = activeConversation?.eventId ? -activeConversation.eventId : null;
    if (eventScopedKey == null) {
      return primary;
    }

    const fallback = joinRequestsByConversation[eventScopedKey] ?? [];
    if (fallback.length === 0) {
      return primary;
    }
    if (primary.length === 0) {
      return fallback;
    }

    const merged = new Map<number, (typeof primary)[number]>();
    for (const item of fallback) {
      merged.set(item.id, item);
    }
    for (const item of primary) {
      merged.set(item.id, item);
    }
    return Array.from(merged.values());
  }, [activeConversation?.eventId, activeConversationId, joinRequestsByConversation]);

  const isConversationHost = useMemo(() => {
    if (!activeConversation || !user) {
      return false;
    }
    return (
      user.id === activeConversation.createdBy ||
      (activeEventOwnerId != null && user.id === activeEventOwnerId)
    );
  }, [activeConversation, activeEventOwnerId, user]);
  const canOpenSingleChatActions =
    isSingleEventConversation &&
    isConversationHost &&
    !!activeConversation?.eventId &&
    counterpart != null;

  const isManuallyLeavingRef = useRef(false);
  const isRouteRemovingRef = useRef(false);

  useEffect(() => {
    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', () => {
      isRouteRemovingRef.current = true;
    });
    const unsubscribeTransitionEnd = navigation.addListener('transitionEnd', (event) => {
      if (event.data?.closing) {
        setActiveConversation(null);
      } else {
        isRouteRemovingRef.current = false;
      }
    });

    return () => {
      unsubscribeBeforeRemove();
      unsubscribeTransitionEnd();
    };
  }, [navigation, setActiveConversation]);

  useEffect(() => {
    if (!activeConversationId) {
      if (isManuallyLeavingRef.current) {
        isManuallyLeavingRef.current = false;
        return;
      }
      if (isRouteRemovingRef.current) {
        return;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main', { screen: 'Messages' });
      }
    }
  }, [activeConversationId, navigation]);

  useEffect(() => {
    if (
      !activeConversation ||
      !activeConversation.eventId ||
      !isConversationHost ||
      !isGroupEventConversation
    ) {
      return;
    }
    refreshJoinRequests(activeConversation.id, activeConversation.eventId, {
      includeApproved: false,
    }).catch(() => undefined);
  }, [activeConversation, isConversationHost, isGroupEventConversation, refreshJoinRequests]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });

    return () => showSub.remove();
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
    triggerHaptic('light');
    isManuallyLeavingRef.current = true;
    setActiveConversation(null);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main', { screen: 'Messages' });
    }
  };

  const refreshSingleConversation = useCallback(async () => {
    if (!activeConversation?.eventId) {
      return;
    }
    await refreshConversations().catch((err) => {
      logger.error('Failed to refresh conversations after single chat action', err);
    });
    await refreshJoinRequests(
      activeConversationId ?? activeConversation.eventId,
      activeConversation.eventId,
      {
        includeApproved: true,
      },
    ).catch((err) => {
      logger.error('Failed to refresh join requests after single chat action', err);
    });
    setActiveConversation(null);
  }, [
    activeConversation?.eventId,
    activeConversationId,
    refreshConversations,
    refreshJoinRequests,
    setActiveConversation,
  ]);

  const memberActions = useSingleEventMemberActions({
    eventId: activeConversation?.eventId,
    onSuccess: refreshSingleConversation,
    reportErrorMessages: {
      generic: 'Unable to submit report right now.',
    },
  });

  useEffect(() => {
    memberActions.reset();
  }, [activeConversationId, memberActions.reset]);

  const handleSend = () => {
    if (!activeConversationId || !draft.trim()) {
      return;
    }
    triggerHaptic('submit');
    const replyPreview: ChatMessage['replyTo'] | undefined = replyTarget
      ? {
          id: replyTarget.id,
          senderId: replyTarget.senderId,
          body: replyTarget.body,
          senderName:
            activeConversation?.participants?.find((p) => p.id === replyTarget.senderId)?.name ??
            '',
        }
      : undefined;
    sendMessage(activeConversationId, draft.trim(), replyPreview);
    setDraft('');
    setReplyTarget(null);
  };

  const isSendDisabled = draft.trim().length === 0;
  const composerBottomPadding =
    Platform.OS === 'ios'
      ? insets.bottom + spacing.xs
      : insets.bottom >= spacing.lg
        ? insets.bottom
        : spacing.sm;
  const pendingJoinRequestCount =
    isConversationHost && isGroupEventConversation
      ? joinRequests.filter((request) => request.status === 'pending').length
      : 0;
  const canViewJoinRequests =
    isConversationHost && isGroupEventConversation && !!activeConversation?.eventId;

  if (!activeConversation) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const handleOpenJoinRequests = () => {
    if (
      !activeConversation ||
      !activeConversation.eventId ||
      !isConversationHost ||
      !isGroupEventConversation
    ) {
      return;
    }
    triggerHaptic('light');
    navigation.navigate('PendingRequests', {
      conversationId: activeConversation.id,
      eventId: activeConversation.eventId,
    });
  };

  const renderMessage = ({ item, index }: { item: (typeof messages)[number]; index: number }) => {
    const lowerBody = item.body.toLowerCase();
    const isJoinSystemMessage = lowerBody.endsWith('joined the chat');
    const isEventUpdateSystemMessage = lowerBody === 'updated event detail';

    if (isJoinSystemMessage || isEventUpdateSystemMessage) {
      return (
        <View style={styles.systemMessageRow}>
          <Text style={styles.systemMessageText}>{item.body}</Text>
        </View>
      );
    }

    const isOwn = item.senderId === user?.id;
    const participant = activeConversation.participants?.find((p) => p.id === item.senderId);
    const senderName = participant?.name ?? '';
    const firstName = senderName.split(' ')[0] || '';

    const prevMessage = index > 0 ? messages[index - 1] : null;
    const prevIsSystem = prevMessage
      ? prevMessage.body.toLowerCase().endsWith('joined the chat') ||
        prevMessage.body.toLowerCase() === 'updated event detail'
      : false;
    const isFirstInRun = !prevMessage || prevMessage.senderId !== item.senderId || prevIsSystem;

    const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
    const nextIsSystem = nextMessage
      ? nextMessage.body.toLowerCase().endsWith('joined the chat') ||
        nextMessage.body.toLowerCase() === 'updated event detail'
      : false;
    const isLastInRun = !nextMessage || nextMessage.senderId !== item.senderId || nextIsSystem;

    const showAvatar = !isOwn;
    const showName = showAvatar && isFirstInRun;
    // Every message shows its own inline timestamp (kept compact by being inline).
    const showMeta = true;

    const timeText = item.pending
      ? 'Sending…'
      : item.failed
        ? "Couldn't send. Tap to retry."
        : new Date(item.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

    const replyToPreview = item.replyTo;
    const replyToName = replyToPreview ? replyToPreview.senderName.split(' ')[0] || 'Someone' : '';

    const handleLongPress = () => {
      if (item.pending || item.failed) return;
      triggerHaptic('light');
      setReplyTarget(item);
    };

    const handleReplyTap = () => {
      if (!replyToPreview) return;
      const targetIndex = messages.findIndex((m) => m.id === replyToPreview.id);
      if (targetIndex < 0) return;

      triggerHaptic('selection');
      if (visibleMessageIdsRef.current.has(replyToPreview.id)) {
        highlightMessage(replyToPreview.id);
        return;
      }

      pendingHighlightMessageIdRef.current = replyToPreview.id;
      messagesListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.5,
      });
    };

    const bubble = (
      <View
        style={[
          styles.messageBubble,
          isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
          item.failed ? styles.messageBubbleFailed : undefined,
        ]}
      >
        {highlightedMessageId === item.id ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.messageHighlight,
              isOwn ? styles.messageHighlightOwn : styles.messageHighlightOther,
              { opacity: highlightOpacity },
            ]}
            testID={`message-highlight-${item.id}`}
          />
        ) : null}
        {replyToPreview ? (
          <Pressable
            style={[styles.replyPreview, isOwn ? styles.replyPreviewOwn : styles.replyPreviewOther]}
            onPress={handleReplyTap}
            accessibilityRole="button"
            accessibilityLabel={`Jump to message from ${replyToName}`}
            testID={`reply-preview-${item.id}`}
          >
            <View
              style={[
                styles.replyPreviewBar,
                isOwn ? styles.replyPreviewBarOwn : styles.replyPreviewBarOther,
              ]}
            />
            <View style={styles.replyPreviewContent}>
              <Text
                style={[
                  styles.replyPreviewName,
                  isOwn ? styles.replyPreviewNameOwn : styles.replyPreviewNameOther,
                ]}
                numberOfLines={1}
              >
                {replyToName}
              </Text>
              <Text
                style={[
                  styles.replyPreviewBody,
                  isOwn ? styles.replyPreviewBodyOwn : styles.replyPreviewBodyOther,
                ]}
                numberOfLines={1}
              >
                {replyToPreview.body}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
          {item.body}
          {showMeta ? (
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
              {`  ${timeText}`}
            </Text>
          ) : null}
        </Text>
      </View>
    );

    const handleSwipeReply = () => {
      if (item.pending || item.failed) return;
      setReplyTarget(item);
    };

    const bubbleContent = item.failed ? (
      <Pressable
        onPress={() => {
          triggerHaptic('warning');
          retryMessage(item.conversationId, item);
        }}
        style={isOwn ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }}
      >
        {bubble}
      </Pressable>
    ) : (
      <SwipeableBubble
        onSwipeReply={handleSwipeReply}
        onLongPress={handleLongPress}
        isOwn={isOwn}
        disabled={item.pending}
        testID={`chat-message-${item.id}`}
      >
        {bubble}
      </SwipeableBubble>
    );

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.messageRowOwn : styles.messageRowOther,
          // Tight gap within a run, full gap between senders (grouping).
          { marginBottom: isLastInRun ? spacing.sm : 3 },
        ]}
      >
        {showAvatar ? (
          isLastInRun ? (
            <UserAvatar
              avatar={participant?.avatar}
              name={senderName}
              seed={item.senderId}
              size={30}
              style={styles.avatarCircle}
            />
          ) : (
            <View style={styles.avatarSpacer} />
          )
        ) : null}
        <View style={styles.messageBubbleContainer}>
          {showName && firstName ? <Text style={styles.senderName}>{firstName}</Text> : null}
          {bubbleContent}
        </View>
      </View>
    );
  };

  const composerProps: ComposerProps = {
    composerBottomPadding,
    draft,
    isSendDisabled,
    onDraftChange: setDraft,
    onDismissReply: () => setReplyTarget(null),
    onSend: handleSend,
    replySenderName:
      activeConversation?.participants
        ?.find((participant) => participant.id === replyTarget?.senderId)
        ?.name?.split(' ')[0] ?? 'Someone',
    replyTarget,
  };

  return (
    <ScreenContainer edges={['top']}>
      <ChatEventHeader
        onBack={handleBack}
        title={headerTitle}
        subtitle={headerSubtitle}
        coverUri={canOpenSingleChatActions ? undefined : eventCoverUri}
        leadingElement={
          isSingleEventConversation && counterpart ? (
            <UserAvatar
              avatar={counterpart.avatar}
              name={counterpart.name}
              seed={counterpart.id}
              size={40}
            />
          ) : undefined
        }
        onTitlePress={() => {
          if (canOpenSingleChatActions && counterpart) {
            memberActions.openMenu({
              userId: counterpart.id,
              name: counterpart.name,
            });
            return;
          }
          if (activeConversation?.eventId) {
            triggerHaptic('light');
            navigation.navigate('EventDetailsOverlay', {
              eventId: String(activeConversation.eventId),
              readOnly: true,
            });
          }
        }}
        titleAccessibilityLabel={
          canOpenSingleChatActions ? 'Open actions' : 'View plan details'
        }
        rightElement={
          <>
            {isConnecting ? (
              <ConnectionStatusIndicator visible testID="chat-connection-status" />
            ) : null}
            {canViewJoinRequests && pendingJoinRequestCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View requests"
                onPress={handleOpenJoinRequests}
                style={styles.joinIconButton}
              >
                <CountBadge count={pendingJoinRequestCount} />
              </Pressable>
            ) : null}
          </>
        }
        testID="chat-event-info-button"
      />
      {Platform.OS === 'ios' ? (
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
              keyboardDismissMode="interactive"
              viewabilityConfig={messageViewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              onScrollToIndexFailed={handleScrollToIndexFailed}
            />
            <ChatComposer {...composerProps} />
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
              keyboardDismissMode="on-drag"
              viewabilityConfig={messageViewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              onScrollToIndexFailed={handleScrollToIndexFailed}
            />
            <AndroidKeyboardDock composerBottomPadding={composerBottomPadding}>
              <ChatComposer {...composerProps} />
            </AndroidKeyboardDock>
          </View>
        </View>
      )}
      <EventActionOverlay
        isVisible={memberActions.showMenu}
        onBackdropPress={memberActions.closeMenu}
        type="menu"
        items={memberActions.menuItems}
      />
      <EventActionOverlay
        isVisible={memberActions.showReportOverlay}
        onBackdropPress={memberActions.closeReportOverlay}
        type="report"
        reportMessage={memberActions.reportMessage}
        onReportMessageChange={memberActions.setReportMessage}
        onSubmitReport={memberActions.handleSubmitReport}
        reportError={memberActions.reportError}
        reportSubmitting={memberActions.isSubmittingReport}
        reportDisabled={!memberActions.reportMessage.trim()}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  joinIconButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  messageRow: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubbleContainer: {
    maxWidth: '75%',
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
  // Sender label above the bubble: distinct from the smaller, centered system notices.
  senderName: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 16,
    letterSpacing: -0.3,
    color: colors.subText,
    marginBottom: 4,
    marginLeft: spacing.md, // = messageBubble paddingLeft, so the name lines up with the text
  },
  messageBubble: {
    position: 'relative',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  messageHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    zIndex: 1,
  },
  messageHighlightOwn: {
    backgroundColor: colors.buttonText,
  },
  messageHighlightOther: {
    backgroundColor: colors.primary,
  },
  messageBubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.inputSurface,
  },
  messageBubbleFailed: {
    borderColor: colors.accent,
  },
  messageText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: -0.5,
  },
  messageTextOwn: {
    color: colors.buttonText,
  },
  messageTextOther: {
    color: colors.text,
  },
  // Inline timestamp appended to the message text (nested Text).
  messageMeta: {
    fontSize: 11,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: '400',
    letterSpacing: -0.3,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingHorizontal: spacing.lg,
  },
  // Quiet system notices: small (12) keeps them recessive; grey stays readable.
  systemMessageText: {
    fontSize: 12,
    color: colors.subText,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  composerContainer: {
    backgroundColor: colors.transparent,
    paddingHorizontal: 0,
  },
  composerShell: {
    backgroundColor: colors.inputSurface,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  composerShellWithReply: {
    borderRadius: radii.xl,
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  composerInputRowWithReply: {
    paddingTop: 6,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    paddingVertical: spacing.xs,
    paddingLeft: 12,
    paddingRight: spacing.sm,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: -0.3,
  },
  sendIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendIconButtonDisabled: {
    backgroundColor: colors.secondaryButtonBackground,
  },
  replyPreview: {
    flexDirection: 'row',
    minWidth: 140,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  replyPreviewOwn: {
    backgroundColor: colors.buttonBackground,
    borderColor: colors.muted,
  },
  replyPreviewOther: {
    backgroundColor: colors.background,
    borderColor: colors.borderSubtle,
  },
  replyPreviewBar: {
    width: 3,
    borderRadius: 1.5,
  },
  replyPreviewBarOwn: {
    backgroundColor: colors.buttonText,
    opacity: 0.8,
  },
  replyPreviewBarOther: {
    backgroundColor: colors.primary,
  },
  replyPreviewContent: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 1,
  },
  replyPreviewName: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: '500',
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  replyPreviewNameOwn: {
    color: colors.buttonText,
  },
  replyPreviewNameOther: {
    color: colors.text,
  },
  replyPreviewBody: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  replyPreviewBodyOwn: {
    color: colors.selectedTextMutedOnDark,
  },
  replyPreviewBodyOther: {
    color: colors.muted,
  },
  replyBar: {
    zIndex: 10,
    marginTop: spacing.xs,
    marginHorizontal: spacing.xs,
  },
  replyBarInner: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  replyBarBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: colors.muted,
    flexShrink: 0,
  },
  replyBarContent: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    gap: 1,
  },
  replyBarName: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: '500',
    lineHeight: 17,
    color: colors.text,
    letterSpacing: -0.3,
  },
  replyBarBody: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 17,
    color: colors.subText,
    letterSpacing: -0.3,
  },
  replyBarDismiss: {
    fontSize: 16,
    color: colors.subText,
  },
  replyBarDismissButton: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});

export default ChatThreadScreen;
