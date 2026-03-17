import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useMemo, useState } from "react";
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
        eventDetails: {
          coverKey: conversation.event?.coverKey,
          dateLabel: conversation.event?.dateLabel ?? "",
          eventDate: conversation.event?.eventDate,
          location: conversation.event?.location ?? "",
          time: conversation.event?.time ?? "",
        },
      });
    } else {
      setActiveConversation(conversation.id);
      navigation.navigate("ChatThread");
    }
  };

  const renderConversation = ({ item }: { item: ChatConversation }) => {
    const { participants = [] } = item;
    const counterpart =
      participants.find((participant) => participant.id !== user?.id) ??
      participants[0];
    const memberCount = item.memberIds?.length ?? participants.length;
    const isGroup =
      memberCount > 2 || !!item.event || (!!item.title && memberCount > 1);
    const titleLabel = isGroup
      ? (item.event?.title ?? item.title ?? item.displayName)
      : (counterpart?.name ?? item.displayName);
    const lastMessageBody = item.lastMessage?.body ?? "No messages yet";
    const isOwnMessage = item.lastMessage?.senderId === user?.id;
    const previewText = item.lastMessage
      ? `${isOwnMessage ? "You" : (counterpart?.name?.split(" ")[0] ?? "")}: ${lastMessageBody}`
      : lastMessageBody;

    const eventImageUri =
      item.eventId != null
        ? events.find((event) => Number(event.id) === item.eventId)?.imageUri
        : undefined;

    const hasUnread = (item.unreadCount ?? 0) > 0;

    return (
      <Pressable
        onPress={() => handleConversationPress(item)}
        style={[
          styles.conversationRow,
          item.id === activeConversationId && styles.conversationRowActive,
        ]}
      >
        {hasUnread && <View testID={`conversation-unread-dot-${item.id}`} style={styles.unreadDot} />}
        <View style={styles.conversationAvatar}>
          {eventImageUri ? (
            <Image
              source={{ uri: eventImageUri }}
              style={styles.conversationAvatarImage}
            />
          ) : (
            <Text style={styles.avatarInitial}>{titleLabel.charAt(0)}</Text>
          )}
        </View>
        <View style={styles.conversationCopy}>
          <Text style={[styles.conversationName, hasUnread && styles.conversationNameUnread]} numberOfLines={1}>
            {titleLabel}
          </Text>
          <Text style={[styles.conversationPreview, hasUnread && styles.conversationPreviewUnread]} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
      </Pressable>
    );
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
                description="Once you create an event, or accepted an event request, your chats will appear here."
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  conversationAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  avatarInitial: {
    fontSize: typography.title,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  conversationCopy: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  conversationName: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  conversationNameUnread: {
    fontFamily: typography.fontFamilySemiBold,
  },
  conversationPreview: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
  },
  conversationPreviewUnread: {
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  unreadDot: {
    position: "absolute",
    left: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2F81E6",
  },
});

export default MessagesScreen;
