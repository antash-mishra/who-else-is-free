import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MoreHorizontalIcon from '@assets/ui/more-horizontal.svg';
import ScalePressable from '@components/ScalePressable';
import UserAvatar from '@components/UserAvatar';
import { colors, spacing, typography } from '@theme/index';

export interface EventMemberRowProps {
  member: { id: number; name: string; avatar?: string | null };
  /**
   * The viewer. Their own row is suffixed "(you)", which is the only thing
   * distinguishing it when two members share a display name.
   */
  currentUserId?: number;
  /** Makes the whole row pressable (e.g. open the member's chat). */
  onPress?: () => void;
  /** Renders the trailing "more" menu button. */
  onMenuPress?: () => void;
  /** Renders a trailing text label instead of the menu (e.g. "Host"). */
  trailingLabel?: string;
  testID?: string;
}

/**
 * Shared member row (avatar, name, optional trailing menu or label) used by
 * event member and accepted-request lists.
 */
const EventMemberRow: React.FC<EventMemberRowProps> = ({
  member,
  currentUserId,
  onPress,
  onMenuPress,
  trailingLabel,
  testID,
}) => {
  const isCurrentUser = currentUserId != null && member.id === currentUserId;
  const displayName = isCurrentUser ? `${member.name} (you)` : member.name;
  const content = (
    <>
      <UserAvatar
        avatar={member.avatar ?? undefined}
        name={member.name}
        seed={member.id}
        size={40}
      />
      <Text style={styles.memberName}>{displayName}</Text>
      {trailingLabel ? <Text style={styles.trailingLabel}>{trailingLabel}</Text> : null}
      {!trailingLabel && onMenuPress ? (
        <ScalePressable
          onPress={onMenuPress}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel={`Open actions for ${displayName}`}
        >
          <MoreHorizontalIcon width={24} height={24} color={colors.iconColor} />
        </ScalePressable>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <ScalePressable onPress={onPress} style={styles.memberItem} testID={testID}>
        {content}
      </ScalePressable>
    );
  }

  return (
    <View style={styles.memberItem} testID={testID}>
      {content}
    </View>
  );
};

/**
 * Divider between member rows. Tighter than the request-row separator since
 * member rows are compact; the row's own paddingBottom provides the top gap.
 */
export const EventMemberRowSeparator: React.FC = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 12,
  },
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 48, // avatar (40) + gap (8)
    marginBottom: 12,
  },
  memberName: {
    flex: 1,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: typography.lineHeight,
  },
  menuButton: {
    padding: 8,
  },
  trailingLabel: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 14,
    lineHeight: 14,
    letterSpacing: -0.5,
    color: colors.fieldLabel,
    marginRight: 8, // match the menu button's padding so "Host" aligns with the "…" icons
  },
});

export default EventMemberRow;
