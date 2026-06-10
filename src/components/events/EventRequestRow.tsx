import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import AcceptIcon from '@assets/event-details/accept.svg';
import RejectIcon from '@assets/event-details/reject.svg';
import ScalePressable from '@components/ScalePressable';
import UserAvatar from '@components/UserAvatar';
import { colors, spacing, typography } from '@theme/index';

const EXPANDABLE_MESSAGE_LENGTH = 100;

export interface EventRequestRowProps {
  requester: { id: number; name: string; avatar?: string | null };
  message: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onAccept: () => void;
  onDecline: () => void;
  isAccepting: boolean;
  isDeclining: boolean;
  testID?: string;
}

/**
 * Shared join-request row (avatar, name, expandable intro message, and
 * accept/decline actions). Owns row layout, action haptics, loading and
 * disabled states so host request lists behave identically everywhere.
 */
const EventRequestRow: React.FC<EventRequestRowProps> = ({
  requester,
  message,
  expanded,
  onToggleExpanded,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
  testID,
}) => {
  const isLoading = isAccepting || isDeclining;

  return (
    <View style={styles.requestItem} testID={testID}>
      <UserAvatar
        avatar={requester.avatar ?? undefined}
        name={requester.name}
        seed={requester.id}
        size={40}
      />

      <View style={styles.requestContent}>
        <Text style={styles.requestName}>{requester.name}</Text>
        <Text style={styles.requestMessage} numberOfLines={expanded ? undefined : 3}>
          {message}
        </Text>
        {!expanded && message.length > EXPANDABLE_MESSAGE_LENGTH && (
          <ScalePressable haptic="light" onPress={onToggleExpanded}>
            <Text style={styles.seeMoreText}>See more</Text>
          </ScalePressable>
        )}
      </View>

      <View style={styles.requestActions}>
        <ScalePressable
          style={[styles.actionButton, styles.declineButton]}
          haptic="destructive"
          onPress={onDecline}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Decline request"
          accessibilityState={{ disabled: isLoading }}
        >
          {isDeclining ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <RejectIcon width={30} height={30} />
          )}
        </ScalePressable>

        <ScalePressable
          style={[styles.actionButton, styles.acceptButton]}
          haptic="submit"
          onPress={onAccept}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Accept request"
          accessibilityState={{ disabled: isLoading }}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color={colors.buttonText} />
          ) : (
            <AcceptIcon width={30} height={30} />
          )}
        </ScalePressable>
      </View>
    </View>
  );
};

export const EventRequestRowSeparator: React.FC = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  requestItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  requestContent: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  requestMessage: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: 22,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.iconColor,
    lineHeight: 20,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: colors.secondaryButtonBackground,
  },
  acceptButton: {
    backgroundColor: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 48, // avatar (40) + gap (8)
    marginTop: spacing.sm + 6,
    marginBottom: spacing.sm + 6,
  },
});

export default EventRequestRow;
