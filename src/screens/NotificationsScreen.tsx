import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  InteractionManager,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppNotification } from '@api/mappers/notifications';
import ChevronLeftIcon from '@assets/ui/chevron-left.svg';
import MoreHorizontalIcon from '@assets/ui/more-horizontal.svg';
import EmptyState from '@components/EmptyState';
import FullPageEmptyState from '@components/FullPageEmptyState';
import NotificationRow from '@components/NotificationRow';
import ScreenContainer from '@components/ScreenContainer';
import { BottomSheet, SheetActionList } from '@components/sheets';
import { AppText, IconButton } from '@components/ui';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';
import { useNotifications } from '@context/NotificationsContext';
import { routeFromNotification, PushData } from '@context/pushRouting';
import { navigationRef } from '@navigation/navigationRef';
import { RootStackParamList } from '@navigation/types';
import { ChatGroup, InboxItem, JoinGroup, collapseNotifications } from '@utils/notificationCollapse';
import { groupNotificationsByDate } from '@utils/notificationSections';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { colors, layout, spacing, typography } from '@theme/index';
import { getNextCompactRelativeTimeUpdateMs } from '@utils/relativeTime';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NotificationsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const pushDataFromNotification = (n: AppNotification): PushData => ({
  type: n.type,
  conversationId: n.conversationId != null ? String(n.conversationId) : undefined,
  eventId: n.eventId != null ? String(n.eventId) : undefined,
  title: n.title,
  body: n.body,
});

const NotificationsScreen = () => {
  const navigation = useNavigation<NotificationsScreenNavigationProp>();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    clearAll,
  } = useNotifications();
  const { setActiveConversation } = useChat();
  const { events } = useEvents();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [menuVisible, setMenuVisible] = useState(false);
  // Collapse chat messages per conversation, then bucket into time sections.
  const inboxItems = useMemo(() => collapseNotifications(notifications), [notifications]);
  // Event cover for singles + join groups (chat groups fall back to a monogram).
  const resolveEventImageUri = useCallback(
    (item: InboxItem): string | undefined => {
      let eventId: number | undefined;
      if (item.kind === 'single') {
        eventId = item.notification.eventId ?? undefined;
      } else if (item.kind === 'joinGroup') {
        eventId = item.group.eventId;
      }
      if (eventId == null) {
        return undefined;
      }
      return events.find((event) => Number(event.id) === eventId)?.imageUri;
    },
    [events],
  );
  const sections = useMemo(
    () => groupNotificationsByDate(inboxItems, nowMs),
    [inboxItems, nowMs],
  );

  // Reload page 1 + count whenever the inbox is focused so it's fresh on open.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );

  // Tick relative timestamps (e.g. "5m" → "6m") — same pattern as MessagesScreen.
  useEffect(() => {
    const nextRefreshMs = notifications.reduce<number | null>((soonest, n) => {
      const delay = getNextCompactRelativeTimeUpdateMs(n.createdAt, nowMs);
      if (delay == null) return soonest;
      return soonest == null ? delay : Math.min(soonest, delay);
    }, null);
    if (nextRefreshMs == null) return undefined;
    const timeoutId = setTimeout(() => setNowMs(Date.now()), Math.max(1_000, nextRefreshMs));
    return () => clearTimeout(timeoutId);
  }, [notifications, nowMs]);

  const handleRowPress = useCallback(
    (notification: AppNotification) => {
      const tapTime = Date.now();
      logger.log(`notifications: tap at ${tapTime}`);
      const data = pushDataFromNotification(notification);

      // Navigate first so the transition starts immediately, then mark read
      // after the navigation animation finishes — avoids blocking the JS thread
      // with an optimistic state update + network call before navigation. Do
      // not pre-check ChatContext.conversations here; that list can be stale or
      // still loading, while the persisted notification payload has the route.
      routeFromNotification(data, setActiveConversation, navigationRef);
      if (!notification.read) {
        InteractionManager.runAfterInteractions(() => {
          logger.log(
            `notifications: markRead deferred callback fired at ${Date.now()} (+${Date.now() - tapTime}ms)`,
          );
          markRead(notification.id).catch(() => undefined);
        });
      }
    },
    [markRead, setActiveConversation],
  );

  // Tapping a collapsed group: route, then mark all of the group's underlying
  // notifications read (so the row clears).
  const markGroupRead = useCallback(
    (ids: number[]) => {
      InteractionManager.runAfterInteractions(() => {
        ids.forEach((id) => markRead(id).catch(() => undefined));
      });
    },
    [markRead],
  );

  const handleChatGroupPress = useCallback(
    (group: ChatGroup) => {
      routeFromNotification(
        { type: 'chat.message', conversationId: String(group.conversationId) },
        setActiveConversation,
        navigationRef,
      );
      markGroupRead(group.ids);
    },
    [markGroupRead, setActiveConversation],
  );

  const handleJoinGroupPress = useCallback(
    (group: JoinGroup) => {
      routeFromNotification(
        {
          type: 'join_request.created',
          eventId: String(group.eventId),
          conversationId: group.conversationId != null ? String(group.conversationId) : undefined,
          title: group.eventName,
        },
        setActiveConversation,
        navigationRef,
      );
      markGroupRead(group.ids);
    },
    [markGroupRead, setActiveConversation],
  );

  const handleMarkAllRead = useCallback(() => {
    setMenuVisible(false);
    if (unreadCount === 0) return;
    triggerHaptic('light');
    markAllRead().catch(() => undefined);
  }, [unreadCount, markAllRead]);

  const handleClearAll = useCallback(() => {
    setMenuVisible(false);
    triggerHaptic('warning');
    clearAll().catch(() => undefined);
  }, [clearAll]);

  const showInitialLoading = loading && notifications.length === 0 && !refreshing;
  const showError = !!error && !loading && notifications.length === 0;
  // Empty when nothing is left to show after collapse (e.g. all chat rows read).
  const showEmpty = !loading && inboxItems.length === 0 && !error;

  const menuActions = [
    {
      label: 'Mark all as read',
      onPress: handleMarkAllRead,
      disabled: unreadCount === 0,
      testID: 'notifications-menu-mark-all-read',
    },
    {
      label: 'Clear all notifications',
      onPress: handleClearAll,
      destructive: true,
      disabled: notifications.length === 0,
      testID: 'notifications-menu-clear-all',
    },
  ];

  return (
    <View style={styles.screenRoot}>
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <IconButton
          accessibilityLabel="Go back"
          icon={<ChevronLeftIcon width={24} height={24} color={colors.text} />}
          onPress={navigation.goBack}
          style={styles.backButton}
        />
        <View style={styles.titleContainer} pointerEvents="none">
          <AppText variant="subtitle" style={styles.title} numberOfLines={1}>
            Notifications
          </AppText>
        </View>
        <IconButton
          accessibilityLabel="More options"
          testID="notifications-menu-button"
          icon={<MoreHorizontalIcon width={24} height={24} color={colors.text} />}
          onPress={() => setMenuVisible(true)}
        />
      </View>

      {showInitialLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : showError ? (
        <View style={styles.centerContent}>
          <AppText variant="body" style={styles.errorText}>
            {error}
          </AppText>
          <Pressable hitSlop={layout.hitSlop.md} onPress={() => refresh().catch(() => undefined)}>
            <AppText variant="button" style={styles.retryText}>
              Try again
            </AppText>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              onPressSingle={handleRowPress}
              onPressChatGroup={handleChatGroupPress}
              onPressJoinGroup={handleJoinGroupPress}
              nowMs={nowMs}
              eventImageUri={resolveEventImageUri(item)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            showEmpty ? styles.emptyList : styles.listContent,
            { paddingBottom: spacing.xl + safeBottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh().catch(() => undefined)}
            />
          }
          onEndReached={() => {
            loadMore().catch(() => undefined);
          }}
          onEndReachedThreshold={0.5}
        />
      )}

      <BottomSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title="Notifications"
        testID="notifications-menu-sheet"
      >
        <SheetActionList items={menuActions} />
      </BottomSheet>
    </ScreenContainer>
      <FullPageEmptyState visible={showEmpty} imageHeight={245}>
        <EmptyState
          title="No notifications yet"
          description="You don't have any notifications."
          imageSource={require('@assets/empty-state/notifications.png')}
          imageWidth={245}
          imageHeight={245}
        />
      </FullPageEmptyState>
    </View>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: layout.headerHeight,
  },
  backButton: {
    // Keep the back button on the left but not as wide as the menu
    // button on the right; we center the title manually.
    marginLeft: -18,
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  retryText: {
    color: colors.secondary,
  },
  list: {
    marginLeft: -spacing.md,
  },
  listContent: {
    flexGrow: 1,
    // Restore the first section's original distance from the title bar, since
    // sectionHeader.marginTop is now reduced for the between-section gaps.
    paddingTop: spacing.sm,
  },
  // Time-section header — matches the Discover event-list section headers.
  sectionHeader: {
    paddingLeft: spacing.md, // align with the row avatars
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 15,
    lineHeight: typography.body + spacing.xs,
    letterSpacing: typography.detailLetterSpacing,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyMedium,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NotificationsScreen;
