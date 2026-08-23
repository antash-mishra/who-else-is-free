import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChevronLeftIcon from '@assets/ui/chevron-left.svg';
import MoreHorizontalIcon from '@assets/ui/more-horizontal.svg';
import EmptyState from '@components/EmptyState';
import EventActionBadge from '@components/EventActionBadge';
import FullPageEmptyState from '@components/FullPageEmptyState';
import NotificationRow from '@components/NotificationRow';
import ScreenContainer from '@components/ScreenContainer';
import { BottomSheet, SheetActionList } from '@components/sheets';
import { AppText, IconButton } from '@components/ui';
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';
import { useNotifications } from '@context/NotificationsContext';
import { openNotification } from '@context/pushRouting';
import { navigationRef } from '@navigation/navigationRef';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { colors, layout, spacing, typography } from '@theme/index';
import {
  ChatGroup,
  InboxItem,
  JoinGroup,
  collapseNotifications,
} from '@utils/notificationCollapse';
import { groupNotificationsByDate } from '@utils/notificationSections';
import { getNextCompactRelativeTimeUpdateMs } from '@utils/relativeTime';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NotificationsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
    applyActionResolution,
    markAllRead,
    clearAll,
  } = useNotifications();
  const { token } = useAuth();
  const { setActiveConversation } = useChat();
  const { events } = useEvents();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [menuVisible, setMenuVisible] = useState(false);
  const [resolvingIDs, setResolvingIDs] = useState<Set<number>>(() => new Set());
  const [showOpenError, setShowOpenError] = useState(false);
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
  const sections = useMemo(() => groupNotificationsByDate(inboxItems, nowMs), [inboxItems, nowMs]);

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

  const openNotificationIDs = useCallback(
    async (ids: number[]) => {
      if (!token || ids.length === 0 || ids.some((id) => resolvingIDs.has(id))) return;
      setShowOpenError(false);
      setResolvingIDs((current) => new Set([...current, ...ids]));
      try {
        const resolution = await openNotification({
          request: { notification_ids: ids, mark_handled: true },
          token,
          setActiveConversation,
          navigator: navigationRef,
        });
        applyActionResolution(ids, resolution);
      } catch (err) {
        logger.warn('notifications: action resolution failed', err);
        setShowOpenError(true);
      } finally {
        setResolvingIDs((current) => {
          const next = new Set(current);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [applyActionResolution, resolvingIDs, setActiveConversation, token],
  );

  const handleRowPress = useCallback(
    (notification: { id: number }) => {
      openNotificationIDs([notification.id]).catch(() => undefined);
    },
    [openNotificationIDs],
  );

  const handleChatGroupPress = useCallback(
    (group: ChatGroup) => {
      openNotificationIDs(group.ids).catch(() => undefined);
    },
    [openNotificationIDs],
  );

  const handleJoinGroupPress = useCallback(
    (group: JoinGroup) => {
      openNotificationIDs(group.ids).catch(() => undefined);
    },
    [openNotificationIDs],
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
      label: 'Clear all',
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
                isResolving={
                  item.kind === 'single'
                    ? resolvingIDs.has(item.notification.id)
                    : item.group.ids.some((id) => resolvingIDs.has(id))
                }
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
          description="Your notifications will appear here."
          imageSource={require('@assets/empty-state/notifications.png')}
          imageWidth={245}
          imageHeight={245}
        />
      </FullPageEmptyState>
      <EventActionBadge
        visible={showOpenError}
        label="Unable to open this notification. Please try again."
        onHidden={() => setShowOpenError(false)}
      />
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
