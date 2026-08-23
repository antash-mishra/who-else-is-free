import { memo } from 'react';

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Image } from 'expo-image';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppNotification } from '@api/mappers/notifications';
import ScalePressable from '@components/ScalePressable';
import { UnreadDot } from '@components/ui';
import UserAvatar from '@components/UserAvatar';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing, typography } from '@theme/index';
import { ChatGroup, InboxItem, JoinGroup } from '@utils/notificationCollapse';
import {
  buildChatGroupDisplay,
  buildJoinGroupDisplay,
  buildNotificationDisplay,
  chatGroupPlainText,
  joinGroupPlainText,
  notificationPlainText,
} from '@utils/notificationDisplay';
import { formatCompactRelativeTime } from '@utils/relativeTime';

export interface NotificationRowProps {
  item: InboxItem;
  onPressSingle: (notification: AppNotification) => void;
  onPressChatGroup: (group: ChatGroup) => void;
  onPressJoinGroup: (group: JoinGroup) => void;
  nowMs: number;
  /** Event cover for rows with an associated event (singles + join groups). */
  eventImageUri?: string;
  isResolving?: boolean;
}

const NotificationStatusIcon = ({ unavailable }: { unavailable: boolean }) => (
  <Svg width={14} height={14} viewBox="0 0 14 14" accessibilityElementsHidden>
    <Circle cx={7} cy={7} r={5.75} stroke={colors.cardMeta} strokeWidth={1.5} fill="none" />
    {unavailable ? (
      <Path d="M4.25 9.75l5.5-5.5" stroke={colors.cardMeta} strokeWidth={1.5} />
    ) : (
      <Path
        d="M4 7.1l1.8 1.8L10 4.8"
        stroke={colors.cardMeta}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </Svg>
);

/**
 * NotificationRow: 40px circular avatar/cover, blue unread dot at the left edge,
 * and the composed notification sentence (SemiBold spans for the event/person).
 * Renders either a single notification or a collapsed chat group.
 */
const NotificationRow = ({
  item,
  onPressSingle,
  onPressChatGroup,
  onPressJoinGroup,
  nowMs,
  eventImageUri,
  isResolving = false,
}: NotificationRowProps) => {
  const actionState =
    item.kind === 'single' ? item.notification.actionState : item.group.actionState;
  const isInactive = actionState !== 'active';
  const isUnavailable = actionState === 'unavailable';
  const hasUnread =
    actionState === 'active' && (item.kind === 'single' ? !item.notification.read : true);
  const timestampLabel = formatCompactRelativeTime(item.createdAt, nowMs);

  let segments;
  let a11yLabel: string;
  let avatarName: string;
  let avatarSeed: number;
  if (item.kind === 'chatGroup') {
    segments = buildChatGroupDisplay(item.group).segments;
    a11yLabel = chatGroupPlainText(item.group);
    avatarName = item.group.eventName;
    avatarSeed = item.group.conversationId;
  } else if (item.kind === 'joinGroup') {
    segments = buildJoinGroupDisplay(item.group).segments;
    a11yLabel = joinGroupPlainText(item.group);
    avatarName = item.group.eventName;
    avatarSeed = item.group.eventId;
  } else {
    segments = buildNotificationDisplay(item.notification).segments;
    a11yLabel = notificationPlainText(item.notification);
    avatarName = item.notification.title;
    avatarSeed = item.notification.id;
  }

  if (isUnavailable) {
    a11yLabel = `Unavailable notification. Opens Discover and explains why. ${a11yLabel}`;
  } else if (isInactive) {
    a11yLabel = `Handled notification. ${a11yLabel}`;
  }

  const handlePress = () => {
    triggerHaptic('light');
    if (item.kind === 'chatGroup') {
      onPressChatGroup(item.group);
    } else if (item.kind === 'joinGroup') {
      onPressJoinGroup(item.group);
    } else {
      onPressSingle(item.notification);
    }
  };

  return (
    <ScalePressable
      onPress={handlePress}
      delay={80}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: isResolving, busy: isResolving }}
      disabled={isResolving}
      style={styles.row}
    >
      {hasUnread && <UnreadDot style={styles.unreadDot} />}
      <View style={styles.rowContent}>
        <View style={[styles.avatar, isInactive && styles.avatarInactive]}>
          {eventImageUri ? (
            <Image
              source={{ uri: eventImageUri }}
              style={styles.avatarImage}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <UserAvatar name={avatarName} seed={avatarSeed} size={40} />
          )}
        </View>
        <View style={styles.copyInner}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.message, (!hasUnread || isInactive) && styles.messageRead]}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              {segments.map((segment, index) => (
                <Text
                  key={index}
                  style={[
                    segment.bold ? styles.messageBold : undefined,
                    segment.muted && hasUnread ? styles.messagePreview : undefined,
                  ]}
                >
                  {segment.text}
                </Text>
              ))}
            </Text>
            {isResolving ? (
              <ActivityIndicator size="small" color={colors.cardMeta} style={styles.timestamp} />
            ) : timestampLabel ? (
              <Text style={styles.timestamp} numberOfLines={1}>
                {timestampLabel}
              </Text>
            ) : null}
          </View>
          {isInactive ? (
            <View style={styles.statusRow}>
              <NotificationStatusIcon unavailable={isUnavailable} />
              <Text style={styles.statusLabel}>{isUnavailable ? 'Unavailable' : 'Handled'}</Text>
            </View>
          ) : null}
        </View>
      </View>
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
    // 10 = the header ⋯ icon's inset inside its 44px button ((44-24)/2), so the
    // timestamp's right edge lines up with the ⋯ icon above it.
    paddingRight: 10,
  },
  unreadDot: {
    position: 'absolute',
    left: 5,
    top: '50%',
    marginTop: -4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  avatarInactive: {
    opacity: 0.62,
  },
  copyInner: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    // 12 (not md/16) → ~24px between rows, a tighter inbox rhythm than the
    // MessagesScreen row this was cloned from (notifications carry more text).
    paddingVertical: spacing.sm + spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  // Composed sentence: 15px Regular, with SemiBold spans for the event/person.
  message: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.4,
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
  },
  messageBold: {
    fontFamily: typography.fontFamilySemiBold,
  },
  // Read rows read "quieter": the whole sentence (incl. its SemiBold spans, which
  // inherit this color) softens from near-black to a medium grey. The blue dot
  // stays the primary unread flag; the avatar/cover keep full strength.
  messageRead: {
    color: colors.cardMeta,
  },
  // Inline chat preview ("Sender: “message”") — dark grey, one step off black so
  // the message reads as a quieted preview without competing with the header.
  messagePreview: {
    color: colors.muted,
  },
  timestamp: {
    marginLeft: spacing.sm,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.2,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    textAlign: 'right',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusLabel: {
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyMedium,
    fontSize: typography.small,
    lineHeight: typography.body,
  },
});

export default memo(NotificationRow);
