import { memo } from 'react';

import { StyleSheet, View } from 'react-native';

import { AppNotification } from '@api/mappers/notifications';
import ScalePressable from '@components/ScalePressable';
import { AppText, UnreadDot } from '@components/ui';
import UserAvatar from '@components/UserAvatar';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing, typography } from '@theme/index';
import { formatCompactRelativeTime } from '@utils/relativeTime';

export interface NotificationRowProps {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
  nowMs: number;
}

/**
 * NotificationRow mirrors the MessagesScreen ConversationRow layout so the
 * inbox feels consistent with the chat list: circular avatar on the left,
 * blue unread dot at the left edge, semibold for unread, and a thin divider
 * ("dash") after every row. Reuses UserAvatar + ScalePressable from the
 * shared component catalog.
 */
const NotificationRow = ({ notification, onPress, nowMs }: NotificationRowProps) => {
  const hasUnread = !notification.read;
  const timestampLabel = formatCompactRelativeTime(notification.createdAt, nowMs);

  return (
    <ScalePressable
      onPress={() => {
        triggerHaptic('light');
        onPress(notification);
      }}
      delay={80}
      accessibilityRole="button"
      accessibilityLabel={notification.title}
      style={styles.row}
    >
      {hasUnread && <UnreadDot style={styles.unreadDot} />}
      <View style={styles.rowContent}>
        <View style={styles.avatar}>
          <UserAvatar name={notification.title} seed={notification.id} size={52} />
        </View>
        <View style={styles.copyInner}>
          <View style={styles.titleRow}>
            <AppText
              variant="subtitle"
              numberOfLines={1}
              style={[styles.title, hasUnread && styles.titleUnread]}
            >
              {notification.title}
            </AppText>
            {timestampLabel ? (
              <AppText
                variant="caption"
                numberOfLines={1}
                style={[styles.timestamp, hasUnread && styles.timestampUnread]}
              >
                {timestampLabel}
              </AppText>
            ) : null}
          </View>
          <AppText
            variant="body"
            numberOfLines={2}
            style={[styles.body, hasUnread && styles.bodyUnread]}
          >
            {notification.body}
          </AppText>
        </View>
      </View>
      <View style={styles.divider} />
    </ScalePressable>
  );
};

const styles = StyleSheet.create({
  row: {
    position: 'relative',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
  },
  unreadDot: {
    position: 'absolute',
    left: 5,
    top: '50%',
    marginTop: -4,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  copyInner: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    color: colors.text,
  },
  titleUnread: {
    fontFamily: typography.fontFamilySemiBold,
  },
  timestamp: {
    marginLeft: spacing.sm,
    color: colors.mutedText,
  },
  timestampUnread: {
    color: colors.muted,
    fontFamily: typography.fontFamilyMedium,
  },
  body: {
    color: colors.iconColor,
  },
  bodyUnread: {
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: spacing.md + 52 + 12,
  },
});

export default memo(NotificationRow);
