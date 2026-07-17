import { useCallback, useMemo, useState } from 'react';

import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminHelpFilters, AdminHelpSubmission } from '@api/adminHelp';
import HelpIcon from '@assets/account-icons/help.svg';
import SupportSubmissionRow from '@components/admin/SupportSubmissionRow';
import EmptyState from '@components/EmptyState';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import SegmentedControl from '@components/SegmentedControl';
import { SectionHeaderText } from '@components/ui';
import { useAdminHelpSubmissions } from '@hooks/useAdminHelpSubmissions';
import { RootStackParamList } from '@navigation/types';
import { colors, spacing } from '@theme/index';

import type { StackNavigationProp } from '@react-navigation/stack';

type Navigation = StackNavigationProp<RootStackParamList, 'AdminSupportInbox'>;

const TYPE_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Contact', value: 'contact' },
  { label: 'Feedback', value: 'feedback' },
];

const STATUS_OPTIONS = [
  { label: 'Any', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Closed', value: 'closed' },
];

const AdminSupportInboxScreen = () => {
  const navigation = useNavigation<Navigation>();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const [type, setType] = useState<AdminHelpFilters['type']>('all');
  const [status, setStatus] = useState<AdminHelpFilters['status']>('all');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const filters = useMemo<AdminHelpFilters>(() => ({ type, status }), [status, type]);
  const { submissions, loading, refreshing, loadingMore, error, hasMore, refresh, loadMore } =
    useAdminHelpSubmissions(filters);

  useFocusEffect(
    useCallback(() => {
      setNowMs(Date.now());
      refresh().catch(() => undefined);
    }, [refresh]),
  );

  const openSubmission = useCallback(
    (submission: AdminHelpSubmission) => {
      navigation.navigate('AdminSupportSubmission', { submissionId: submission.id });
    },
    [navigation],
  );

  const showInitialLoading = loading && submissions.length === 0;
  const showError = !!error && submissions.length === 0 && !loading;
  const showEmpty = !loading && !error && submissions.length === 0;

  return (
    <ScreenContainer edges={['top']}>
      <ScreenHeader title="Support inbox" onBack={navigation.goBack} />

      <View style={styles.filters}>
        <View style={styles.filterGroup}>
          <SectionHeaderText>MESSAGE TYPE</SectionHeaderText>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={type}
            onChange={(value) => setType(value as AdminHelpFilters['type'])}
          />
        </View>
        <View style={styles.filterGroup}>
          <SectionHeaderText>STATUS</SectionHeaderText>
          <SegmentedControl
            options={STATUS_OPTIONS}
            value={status}
            onChange={(value) => setStatus(value as AdminHelpFilters['status'])}
          />
        </View>
      </View>

      {showInitialLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : showError ? (
        <View style={styles.centerContent}>
          <EmptyState
            title="Couldn't load messages"
            description={error}
            actionLabel="Try again"
            onActionPress={() => refresh().catch(() => undefined)}
          />
        </View>
      ) : (
        <FlatList
          data={submissions}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SupportSubmissionRow submission={item} onPress={openSubmission} nowMs={nowMs} />
          )}
          contentContainerStyle={[
            styles.listContent,
            showEmpty && styles.emptyList,
            { paddingBottom: spacing.xl + safeBottom },
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh().catch(() => undefined)}
            />
          }
          onEndReached={() => {
            if (hasMore) loadMore().catch(() => undefined);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            showEmpty ? (
              <EmptyState
                title="No support messages"
                description="New Contact Us and Feedback submissions will appear here."
                icon={<HelpIcon width={40} height={40} color={colors.mutedText} />}
              />
            ) : null
          }
          showsVerticalScrollIndicator={false}
          accessibilityLabel="Support messages"
        />
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  filters: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  filterGroup: {
    gap: spacing.xs,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingTop: spacing.sm,
  },
  emptyList: {
    justifyContent: 'center',
  },
  separator: {
    height: spacing.md,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
});

export default AdminSupportInboxScreen;
