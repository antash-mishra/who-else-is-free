import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { AppNotification } from '@api/mappers/notifications';
import ScalePressable from '@components/ScalePressable';
import UserAvatar from '@components/UserAvatar';
import { UnreadDot } from '@components/ui';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing, typography } from '@theme/index';
import { formatCompactRelativeTime } from '@utils/relativeTime';

export interface NotificationRowProps {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
  nowMs: number;
  eventImageUri?: string;
}

/**
 * NotificationRow mirrors the MessagesScreen ConversationRow layout and
 * styles exactly so the inbox list looks identical to the chat list:
 * 52×52 circular avatar/cover, blue unread dot at the left edge,
 * semibold for unread, thin divider after every row.
 *
 * Shows the event cover image when the notification has an associated event
 * (same as ConversationRow); falls back to a UserAvatar otherwise.
 */
const NotificationRow = ({ notification, onPress, nowMs, eventImageUri }: NotificationRowProps) => {
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
          {eventImageUri ? (
            <Image
              source={{ uri: eventImageUri }}
              style={styles.avatarImage}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <UserAvatar name={notification.title} seed={notification.id} size={52} />
          )}
        </View>
        <View style={styles.copyInner}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, hasUnread && styles.titleUnread]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            {timestampLabel ? (
              <Text
                style={[styles.timestamp, hasUnread && styles.timestampUnread]}
                numberOfLines={1}
              >
                {timestampLabel}
              </Text>
            ) : null}
          </View>
          <Text
            style={[styles.body, hasUnread && styles.bodyUnread]}
            numberOfLines={2}
          >
            {notification.body}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
    </ScalePressable>
  );
};

// These styles are copied verbatim from MessagesScreen's ConversationRow
// styles so both lists render identically.
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
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
  titleUnread: {
    fontFamily: typography.fontFamilySemiBold,
  },
  timestamp: {
    marginLeft: spacing.sm,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.2,
    color: '#8B8B8B',
    fontFamily: typography.fontFamilyRegular,
    textAlign: 'right',
  },
  timestampUnread: {
    color: '#5E5E5E',
    fontFamily: typography.fontFamilyMedium,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: '#707070',
    fontFamily: typography.fontFamilyRegular,
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
