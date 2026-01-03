import { Feather } from "@expo/vector-icons";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback } from "react";
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
import EmptyMessageIllustration from "@assets/empty-message.svg";
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
  const { events } = useEvents();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        return undefined;
      }
      refreshConversations().catch(() => undefined);
      return undefined;
    }, [refreshConversations, user]),
  );

  const handleConversationPress = (conversation: ChatConversation) => {
    const is1to1Host =
      conversation.event?.groupType === "Single" &&
      conversation.createdBy === user?.id;

    if (is1to1Host && conversation.eventId) {
      navigation.navigate("JoinRequests", {
        conversationId: conversation.id,
        eventId: conversation.eventId,
        title: conversation.event?.title ?? conversation.displayName,
        groupType: "Single",
        eventDetails: {
          coverKey: conversation.event?.coverKey,
          dateLabel: conversation.event?.dateLabel ?? "",
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
    const eventDetails = eventMetaParts.join(" • ");
    const previewText = item.lastMessage?.body ?? "No messages yet";
    const isJoinSystemMessage =
      previewText.toLowerCase().endsWith("joined the chat");

    const eventImageUri =
      item.eventId != null
        ? events.find((event) => Number(event.id) === item.eventId)?.imageUri
        : undefined;

    return (
      <Pressable
        onPress={() => handleConversationPress(item)}
        style={[
          styles.conversationRow,
          item.id === activeConversationId && styles.conversationRowActive,
        ]}
      >
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
          <Text style={styles.conversationName} numberOfLines={1}>
            {titleLabel}
          </Text>
          {eventDetails ? (
            <Text style={styles.conversationEvent} numberOfLines={1}>
              {eventDetails}
            </Text>
          ) : null}
          <Text
            style={styles.conversationPreview}
            numberOfLines={isJoinSystemMessage ? 2 : 1}
          >
            {previewText}
          </Text>
        </View>
        <View style={styles.conversationMeta}>
          <Text style={styles.conversationTime}>
            {item.lastMessage
              ? new Date(item.lastMessage.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </Text>
          {item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

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
          onActionPress={() => navigation.navigate("Login")}
          illustration={EmptyMessageIllustration}
          illustrationSize={40}
        />
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
          data={conversations}
          keyExtractor={(conversation) => String(conversation.id)}
          renderItem={renderConversation}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
          ListEmptyComponent={() => (
            <EmptyState
              title="No conversations yet"
              description="Start a chat and it will show up here."
              illustration={EmptyMessageIllustration}
              illustrationSize={32}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingConversations}
              onRefresh={refreshConversations}
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
  listSeparator: {
    height: spacing.md,
  },
  conversationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  conversationRowActive: {
    // borderWidth: 1,
    // borderColor: colors.primary,
  },
  conversationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  conversationAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  avatarInitial: {
    fontSize: typography.title,
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
  },
  conversationCopy: {
    flex: 1,
    gap: 2,
  },
  conversationName: {
    fontSize: typography.subtitle,
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
  },
  conversationEvent: {
    fontSize: typography.caption,
    color: colors.muted,
  },
  conversationPreview: {
    fontSize: typography.caption,
    color: colors.cardMeta,
  },
  conversationMeta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  conversationTime: {
    fontSize: typography.caption,
    color: colors.cardMeta,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    color: colors.buttonText,
    fontSize: typography.caption,
    fontFamily: typography.fontFamilySemiBold,
  },
});

export default MessagesScreen;
