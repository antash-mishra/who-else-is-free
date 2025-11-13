import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, typography } from "@theme/index";
import { useChat } from "@context/ChatContext";
import { RootStackParamList } from "@navigation/types";

type JoinRequestsRoute = RouteProp<RootStackParamList, "JoinRequests">;
type JoinRequestsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "JoinRequests"
>;

const JoinRequestsScreen = () => {
  const navigation = useNavigation<JoinRequestsNavigation>();
  const route = useRoute<JoinRequestsRoute>();
  const {
    joinRequestsByConversation,
    refreshJoinRequests,
    approveJoinRequest,
    denyJoinRequest,
  } = useChat();
  const { conversationId, eventId, title } = route.params;
  const requests = joinRequestsByConversation[conversationId] ?? [];
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshJoinRequests(conversationId, eventId)
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  }, [conversationId, eventId, refreshJoinRequests]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const handleAction = useCallback(
    async (requestId: number, userId: number, action: "approve" | "deny") => {
      try {
        if (action === "approve") {
          await approveJoinRequest(conversationId, eventId, userId);
        } else {
          await denyJoinRequest(conversationId, eventId, userId);
        }
      } catch (err) {
        Alert.alert(
          "Unable to update request",
          err instanceof Error ? err.message : "Please try again.",
        );
      }
    },
    [approveJoinRequest, conversationId, denyJoinRequest, eventId],
  );

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No pending requests</Text>
        <Text style={styles.emptySubtitle}>
          You&apos;ll see new join requests here when attendees tap Interested.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>Join Requests</Text>
        </View>
      </View>
      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{item.requester.name}</Text>
              <Text style={styles.cardTime}>
                {new Date(item.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            {item.message ? (
              <Text style={styles.cardMessage}>{item.message}</Text>
            ) : null}
            <View style={styles.cardActions}>
              <Pressable
                onPress={() => handleAction(item.id, item.userId, "deny")}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={() => handleAction(item.id, item.userId, "approve")}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryLabel}>Accept</Text>
              </Pressable>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={
          requests.length === 0 ? styles.listEmptyContent : styles.listContent
        }
        ListEmptyComponent={listEmpty}
        onRefresh={handleRefresh}
        refreshing={isRefreshing}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.title,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.body,
    color: colors.subText,
    marginTop: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listEmptyContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: spacing.md,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardName: {
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    fontSize: typography.subtitle,
  },
  cardTime: {
    fontSize: typography.caption,
    color: colors.subText,
  },
  cardMessage: {
    fontSize: typography.body,
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  secondaryButtonPressed: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  secondaryLabel: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryLabel: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
  },
  emptyState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.title,
    color: colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: typography.body,
    color: colors.subText,
    textAlign: "center",
  },
});

export default JoinRequestsScreen;
