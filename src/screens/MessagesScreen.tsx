import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import BottomSheetModal from "@components/BottomSheetModal";
import SignInButtons from "@components/SignInButtons";
import {
  useFocusEffect,
  useNavigation,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ScreenContainer from "@components/ScreenContainer";
import EmptyState from "@components/EmptyState";
import UserAvatar from "@components/UserAvatar";
import { colors, spacing, typography } from "@theme/index";
import { useChat } from "@context/ChatContext";
import type { ChatConversation } from "@context/ChatContext";
import { useAuth } from "@context/AuthContext";
import { useEvents } from "@context/EventsContext";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MessagesNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, "Messages">,
  NativeStackNavigationProp<RootStackParamList>
>;

const ConversationRow = ({
  item,
  onPress,
  activeConversationId,
  events,
  userId,
}: {
  item: ChatConversation;
  onPress: (item: ChatConversation) => void;
  activeConversationId: number | null;
  events: { id: string; imageUri: string }[];
  userId?: number;
}) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const { participants = [] } = item;
  const counterpart =
    participants.find((p) => p.id !== userId) ?? participants[0];
  const memberCount = item.memberIds?.length ?? participants.length;
  const isGroup =
    memberCount > 2 || !!item.event || (!!item.title && memberCount > 1);
  const titleLabel = isGroup
    ? (item.event?.title ?? item.title ?? item.displayName)
    : (counterpart?.name ?? item.displayName);
  const lastMessageBody = item.lastMessage?.body ?? "No messages yet";
  const isOwnMessage = item.lastMessage?.senderId === userId;
  const previewText = item.lastMessage
    ? `${isOwnMessage ? "You" : (counterpart?.name?.split(" ")[0] ?? "")}: ${lastMessageBody}`
    : lastMessageBody;
  const eventImageUri =
    item.eventId != null
      ? events.find((event) => Number(event.id) === item.eventId)?.imageUri
      : undefined;
  const hasUnread = (item.unreadCount ?? 0) > 0;
  const avatarName = isGroup ? titleLabel : (counterpart?.name ?? titleLabel);
  const avatarValue = isGroup ? undefined : counterpart?.avatar;
  const avatarSeed = isGroup ? titleLabel : (counterpart?.id ?? titleLabel);

  return (
    <Pressable
      onPress={() => onPress(item)}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 40, stiffness: 600, mass: 0.3 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300, mass: 0.3 }); }}
    >
      <Animated.View
        style={[
          animStyle,
          styles.conversationRow,
          item.id === activeConversationId && styles.conversationRowActive,
        ]}
      >
        {hasUnread && <View testID={`conversation-unread-dot-${item.id}`} style={styles.unreadDot} />}
        <View style={styles.conversationAvatar}>
          {eventImageUri ? (
            <Image source={{ uri: eventImageUri }} style={styles.conversationAvatarImage} contentFit="cover" transition={150} />
          ) : (
            <UserAvatar
              avatar={avatarValue}
              name={avatarName}
              seed={avatarSeed}
              size={52}
            />
          )}
        </View>
        <View style={styles.conversationCopyInner}>
          <Text style={[styles.conversationName, hasUnread && styles.conversationNameUnread]} numberOfLines={1}>
            {titleLabel}
          </Text>
          <Text style={[styles.conversationPreview, hasUnread && styles.conversationPreviewUnread]} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
      </Animated.View>
      <View style={styles.conversationDivider} />
    </Pressable>
  );
};

const MessagesScreen = () => {
  const navigation = useNavigation<MessagesNavigation>();
  const { user } = useAuth();
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    isConnecting,
    error,
    refreshConversations,
    isRefreshingConversations,
  } = useChat();
  const { events, isEventReported } = useEvents();
  const insets = useSafeAreaInsets();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setActiveConversation(null);
      if (!user) {
        return undefined;
      }

      refreshConversations().catch(() => undefined);
      return undefined;
    }, [refreshConversations, setActiveConversation, user]),
  );

  const handleRefresh = useCallback(() => {
    setIsPullRefreshing(true);
    refreshConversations()
      .catch(() => undefined)
      .finally(() => setIsPullRefreshing(false));
  }, [refreshConversations]);

  const displayConversations = useMemo(() => {
    if (!user) return conversations;

    // Filter out conversations linked to reported events
    const filtered = conversations.filter(
      (convo) => !convo.eventId || !isEventReported(String(convo.eventId)),
    );

    const singleHostGroups = new Map<number, ChatConversation[]>();
    const others: ChatConversation[] = [];

    for (const convo of filtered) {
      const isSingleHost =
        convo.event?.groupType === "Single" &&
        convo.event?.userId === user.id &&
        convo.eventId != null;

      if (isSingleHost) {
        const group = singleHostGroups.get(convo.eventId!) ?? [];
        group.push(convo);
        singleHostGroups.set(convo.eventId!, group);
      } else {
        others.push(convo);
      }
    }

    const consolidated: ChatConversation[] = [...others];
    for (const [, group] of singleHostGroups) {
      // Pick the conversation with the most recent message as representative
      const representative = group.reduce((best, current) => {
        const bestTime = best.lastMessage ? Date.parse(best.lastMessage.createdAt) : 0;
        const currentTime = current.lastMessage ? Date.parse(current.lastMessage.createdAt) : 0;
        return currentTime > bestTime ? current : best;
      });
      consolidated.push(representative);
    }

    // Sort by most recent message
    consolidated.sort((a, b) => {
      const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
      const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
      return bTime - aTime;
    });

    return consolidated;
  }, [conversations, user, isEventReported]);

  const handleConversationPress = (conversation: ChatConversation) => {
    const is1to1Host =
      conversation.event?.groupType === "Single" &&
      conversation.event?.userId === user?.id;

    if (is1to1Host && conversation.eventId) {
      navigation.navigate("JoinRequests", {
        conversationId: conversation.id,
        eventId: conversation.eventId,
        title: conversation.event?.title ?? conversation.displayName,
        groupType: "Single",
      });
    } else {
      setActiveConversation(conversation.id);
      navigation.navigate("ChatThread");
    }
  };

  const renderConversation = ({ item }: { item: ChatConversation }) => {
    return <ConversationRow item={item} onPress={handleConversationPress} activeConversationId={activeConversationId} events={events} userId={user?.id} />;
  };

  const [signInVisible, setSignInVisible] = useState(false);

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <EmptyState
          title="No messages to show"
          description={"Sign in to view conversations from\nevents you've created or joined"}
          actionLabel="Continue"
          onActionPress={() => setSignInVisible(true)}
          imageSource={require('@assets/emptystate_chat.png')}
        />
        <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
          <SignInButtons />
        </BottomSheetModal>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>
      <View style={styles.container}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {isConnecting ? (
          <Text style={styles.helperText}>Connecting to chat…</Text>
        ) : null}
        <FlatList
          data={displayConversations}
          extraData={displayConversations}
          keyExtractor={(conversation) => String(conversation.id)}
          renderItem={renderConversation}
          style={styles.flatList}
          contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom, flexGrow: 1 }}
          ListEmptyComponent={
            !isRefreshingConversations && !isConnecting ? (
              <EmptyState
                title="No Messages Yet"
                description={"Messages from your events\nwill appear here"}
                imageSource={require('@assets/emptystate_chat.png')}
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
    overflow: "visible",
  },
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  helperText: {
    fontSize: typography.caption,
    color: colors.muted,
  },
  errorText: {
    fontSize: typography.caption,
    color: colors.accent,
  },

  flatList: {
    marginLeft: -spacing.md,
  },
  conversationRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
  },
  conversationRowActive: {
    // borderWidth: 1,
    // borderColor: colors.primary,
  },
  conversationAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  conversationAvatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  conversationCopy: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
  },
  conversationCopyInner: {
    flex: 1,
    gap: 4,
    paddingVertical: spacing.md,
  },
  conversationDivider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginLeft: spacing.md + 52 + 12,
  },
  conversationName: {
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  conversationNameUnread: {},
  conversationPreview: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
  },
  conversationPreviewUnread: {},
  unreadDot: {
    position: "absolute",
    left: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2F81E6",
  },
});

export default MessagesScreen;
