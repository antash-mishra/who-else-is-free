import { memo } from 'react';

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Image } from 'expo-image';

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
    actionState === 'active' &&
    !(item.kind === 'single' ? item.notification.read : item.group.read);
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
      {hasUnread && <UnreadDot testID="notification-unread-dot" style={styles.unreadDot} />}
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
    // On the row, not on the text column. Padding the text alone made the row
    // height `max(avatar, text + padding)`, so a one-line row was shorter than a
    // two-line one -- and since the avatar is centred in that height, its slack
    // shrank with it and the gap between rows changed with the length of their
    // text. Padding the row makes the height `max(avatar, text) + padding`,
    // identical for one and two lines, so the rhythm is even.
    //
    // 10 a side, so two adjacent rows sit 20 apart. `NotificationsScreen`'s
    // section header adds 14 to this on each of its sides for a 24 break, which
    // is why the two files have to move together.
    paddingVertical: 10,
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
  copyInner: {
    flex: 1,
    minWidth: 0,
    gap: 4,
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
  //
  // The avatar used to dim to 0.62 for an inactive `actionState`, which is a
  // different axis from read/unread: a read-but-still-actionable row kept a full
  // avatar while a handled one faded. Side by side that read as inconsistent
  // rendering rather than a state, since 0.62 on a 40px circle carries no
  // meaning a viewer can act on. Read and handled now both show as text colour.
  //
  // iconColor, not cardMeta: read rows are most of this list, and cardMeta
  // (#808080) sits at 3.95:1 on white, under the 4.5:1 AA floor for body text.
  // #707070 clears it at 5.0:1 and is already the app's secondary-on-white grey.
  messageRead: {
    color: colors.iconColor,
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
});

export default memo(NotificationRow);
