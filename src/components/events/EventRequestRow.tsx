import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextLayoutEventData,
  View,
} from 'react-native';

import AcceptIcon from '@assets/event-details/accept.svg';
import RejectIcon from '@assets/event-details/reject.svg';
import ScalePressable from '@components/ScalePressable';
import UserAvatar from '@components/UserAvatar';
import { colors, spacing, typography } from '@theme/index';

const MESSAGE_CLAMP_LINES = 3;

type MessageTruncation = {
  leadingLines: string[];
  rest: string;
};

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
  const [messageTruncation, setMessageTruncation] = useState<MessageTruncation | null>(null);

  const handleMessageTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      const { lines } = event.nativeEvent;
      if (lines.length <= MESSAGE_CLAMP_LINES) {
        setMessageTruncation(null);
        return;
      }

      setMessageTruncation({
        leadingLines: lines.slice(0, MESSAGE_CLAMP_LINES - 1).map((line) => line.text),
        rest: lines
          .slice(MESSAGE_CLAMP_LINES - 1)
          .map((line) => line.text)
          .join(''),
      });
    },
    [],
  );

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
        <View style={styles.messageContent}>
          <Text
            style={[styles.requestMessage, styles.measureMessage]}
            onTextLayout={handleMessageTextLayout}
            testID={testID ? `${testID}-message-measure` : 'request-message-measure'}
          >
            {message}
          </Text>

          {expanded ? (
            <Text style={styles.requestMessage}>
              {message}
              {'  '}
              <Text style={styles.seeMoreText} onPress={onToggleExpanded}>
                See less
              </Text>
            </Text>
          ) : messageTruncation ? (
            <>
              {messageTruncation.leadingLines.map((line, index) => (
                <Text key={`${index}-${line}`} style={styles.requestMessage} numberOfLines={1}>
                  {line}
                </Text>
              ))}
              <View style={styles.messageLastLine}>
                <Text
                  style={[styles.requestMessage, styles.messageLastLineText]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {messageTruncation.rest}
                </Text>
                <Text style={styles.seeMoreText} onPress={onToggleExpanded}>
                  See more
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.requestMessage}>{message}</Text>
          )}
        </View>
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
            <RejectIcon width={30} height={30} color={colors.iconColor} />
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
  messageContent: {
    position: 'relative',
  },
  measureMessage: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  messageLastLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  messageLastLineText: {
    flex: 1,
  },
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.iconColor,
    lineHeight: 20,
    letterSpacing: -0.3,
    marginLeft: spacing.xs,
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
    backgroundColor: colors.divider,
    marginLeft: 48, // avatar (40) + gap (8)
    marginTop: spacing.sm + 6,
    marginBottom: spacing.sm + 6,
  },
});

export default EventRequestRow;
