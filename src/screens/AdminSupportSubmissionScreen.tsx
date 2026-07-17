import { useCallback, useEffect, useState } from 'react';

import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import {
  AdminHelpSubmission,
  getAdminHelpSubmission,
  HelpSubmissionStatus,
  updateAdminHelpSubmissionStatus,
} from '@api/adminHelp';
import EmptyState from '@components/EmptyState';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { AppButton, AppText, SectionHeaderText } from '@components/ui';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { colors, radii, spacing, typography } from '@theme/index';

import type { StackNavigationProp } from '@react-navigation/stack';

type Navigation = StackNavigationProp<RootStackParamList, 'AdminSupportSubmission'>;
type SubmissionRoute = RouteProp<RootStackParamList, 'AdminSupportSubmission'>;

const statusLabel: Record<HelpSubmissionStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  closed: 'Closed',
};

const formatSubmittedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const AdminSupportSubmissionScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<SubmissionRoute>();
  const { authFetch } = useAuth();
  const [submission, setSubmission] = useState<AdminHelpSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<HelpSubmissionStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubmission(await getAdminHelpSubmission(authFetch, route.params.submissionId));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to load this message',
      );
    } finally {
      setLoading(false);
    }
  }, [authFetch, route.params.submissionId]);

  useEffect(() => {
    let active = true;
    getAdminHelpSubmission(authFetch, route.params.submissionId)
      .then((result) => {
        if (active) setSubmission(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error ? requestError.message : 'Unable to load this message',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authFetch, route.params.submissionId]);

  const updateStatus = useCallback(
    async (status: HelpSubmissionStatus) => {
      if (!submission || updatingStatus) return;
      setUpdatingStatus(status);
      try {
        setSubmission(await updateAdminHelpSubmissionStatus(authFetch, submission.id, status));
      } catch (requestError) {
        Alert.alert(
          'Unable to update',
          requestError instanceof Error ? requestError.message : 'Please try again.',
        );
      } finally {
        setUpdatingStatus(null);
      }
    },
    [authFetch, submission, updatingStatus],
  );

  const reply = useCallback(async () => {
    if (!submission?.replyEmail) return;
    const subject = encodeURIComponent(`Who Else Is Free support reply #${submission.id}`);
    const url = `mailto:${submission.replyEmail}?subject=${subject}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open email', `Reply to ${submission.replyEmail}`);
    }
  }, [submission]);

  return (
    <ScreenContainer edges={['top']}>
      <ScreenHeader title="Support message" onBack={navigation.goBack} />

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error || !submission ? (
        <View style={styles.centerContent}>
          <EmptyState
            title="Couldn't load this message"
            description={error ?? 'This submission is unavailable.'}
            actionLabel="Try again"
            onActionPress={() => load().catch(() => undefined)}
            secondaryActionLabel="Go back"
            onSecondaryActionPress={navigation.goBack}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.badgeRow}>
            {submission.urgentSafetyIssue ? (
              <View style={[styles.badge, styles.urgentBadge]}>
                <AppText variant="caption" style={styles.urgentText}>
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

          <AppText variant="caption" style={styles.date}>
            {formatSubmittedAt(submission.createdAt)}
          </AppText>

          <View style={styles.section}>
            <SectionHeaderText>MESSAGE</SectionHeaderText>
            <View style={styles.messageCard}>
              <AppText variant="body" selectable>
                {submission.message}
              </AppText>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeaderText>CONTACT</SectionHeaderText>
            <View style={styles.detailCard}>
              <DetailRow label="From" value={submission.submitter?.name ?? 'Anonymous'} />
              {submission.submitter?.email ? (
                <DetailRow label="Account email" value={submission.submitter.email} />
              ) : null}
              <DetailRow label="Wants a reply" value={submission.wantsReply ? 'Yes' : 'No'} />
              {submission.replyEmail ? (
                <DetailRow label="Reply email" value={submission.replyEmail} />
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            {submission.replyEmail ? (
              <AppButton label="Reply by email" variant="secondary" onPress={reply} fullWidth />
            ) : null}
            {submission.status === 'new' ? (
              <AppButton
                label="Mark as reviewed"
                onPress={() => updateStatus('reviewed')}
                loading={updatingStatus === 'reviewed'}
                disabled={updatingStatus !== null}
                fullWidth
              />
            ) : null}
            {submission.status === 'reviewed' ? (
              <AppButton
                label="Close message"
                onPress={() => updateStatus('closed')}
                loading={updatingStatus === 'closed'}
                disabled={updatingStatus !== null}
                fullWidth
              />
            ) : null}
            {submission.status !== 'new' ? (
              <AppButton
                label="Reopen"
                variant="ghost"
                onPress={() => updateStatus('new')}
                loading={updatingStatus === 'new'}
                disabled={updatingStatus !== null}
                fullWidth
              />
            ) : null}
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <AppText variant="caption" style={styles.detailLabel}>
      {label}
    </AppText>
    <AppText variant="body" style={styles.detailValue} selectable>
      {value}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
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
  urgentText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilyMedium,
  },
  date: {
    color: colors.mutedText,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  messageCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  detailCard: {
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  detailRow: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  detailLabel: {
    color: colors.mutedText,
  },
  detailValue: {
    color: colors.text,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});

export default AdminSupportSubmissionScreen;
