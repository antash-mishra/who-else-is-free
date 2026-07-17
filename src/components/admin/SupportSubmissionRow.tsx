import { memo } from 'react';

import { StyleSheet, View } from 'react-native';

import { AdminHelpSubmission } from '@api/adminHelp';
import ScalePressable from '@components/ScalePressable';
import { AppText } from '@components/ui';
import { colors, radii, spacing, typography } from '@theme/index';
import { formatCompactRelativeTime } from '@utils/relativeTime';

interface SupportSubmissionRowProps {
  submission: AdminHelpSubmission;
  onPress: (submission: AdminHelpSubmission) => void;
  nowMs: number;
}

const statusLabel: Record<AdminHelpSubmission['status'], string> = {
  new: 'New',
  reviewed: 'Reviewed',
  closed: 'Closed',
};

const SupportSubmissionRow = ({ submission, onPress, nowMs }: SupportSubmissionRowProps) => {
  const sender = submission.submitter?.name || submission.replyEmail || 'Anonymous';
  const timestamp = formatCompactRelativeTime(submission.createdAt, nowMs);

  return (
    <ScalePressable
      onPress={() => onPress(submission)}
      delay={80}
      haptic="light"
      accessibilityLabel={`${submission.type === 'contact' ? 'Contact' : 'Feedback'} from ${sender}`}
      testID={`support-submission-${submission.id}`}
      style={styles.card}
    >
      <View style={styles.badgeRow}>
        {submission.urgentSafetyIssue ? (
          <View style={[styles.badge, styles.urgentBadge]}>
            <AppText variant="caption" style={styles.urgentBadgeText}>
              Urgent safety
            </AppText>
          </View>
        ) : null}
        <View style={styles.badge}>
          <AppText variant="caption" style={styles.badgeText}>
            {submission.type === 'contact' ? 'Contact' : 'Feedback'}
          </AppText>
        </View>
        <View style={styles.badge}>
          <AppText variant="caption" style={styles.badgeText}>
            {statusLabel[submission.status]}
          </AppText>
        </View>
      </View>

      <AppText variant="body" style={styles.message} numberOfLines={3}>
        {submission.message}
      </AppText>

      <View style={styles.footer}>
        <AppText variant="caption" style={styles.sender} numberOfLines={1}>
          {sender}
        </AppText>
        {timestamp ? (
          <AppText variant="caption" style={styles.timestamp}>
            {timestamp}
          </AppText>
        ) : null}
      </View>
    </ScalePressable>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.actionSurface,
  },
  urgentBadge: {
    backgroundColor: colors.error,
  },
  badgeText: {
    color: colors.muted,
    fontFamily: typography.fontFamilyMedium,
  },
  urgentBadgeText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilyMedium,
  },
  message: {
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sender: {
    flex: 1,
    color: colors.muted,
  },
  timestamp: {
    color: colors.mutedText,
  },
});

export default memo(SupportSubmissionRow);
