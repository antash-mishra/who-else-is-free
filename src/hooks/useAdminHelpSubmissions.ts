import { useCallback, useRef, useState } from 'react';

import { AdminHelpFilters, AdminHelpSubmission, listAdminHelpSubmissions } from '@api/adminHelp';
import { useAuth } from '@context/AuthContext';
import { logger } from '@services/logger';

interface AdminHelpSubmissionState {
  submissions: AdminHelpSubmission[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export const useAdminHelpSubmissions = (filters: AdminHelpFilters): AdminHelpSubmissionState => {
  const { authFetch } = useAuth();
  const [submissions, setSubmissions] = useState<AdminHelpSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const requestVersionRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const page = await listAdminHelpSubmissions(authFetch, filters);
      if (requestVersion !== requestVersionRef.current) return;
      setSubmissions(page.submissions);
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } catch (requestError) {
      if (requestVersion !== requestVersionRef.current) return;
      logger.warn('admin help refresh failed', requestError);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load messages');
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [authFetch, filters]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMore || refreshing) return;
    setLoadingMore(true);
    try {
      const page = await listAdminHelpSubmissions(authFetch, filters, cursor);
      setSubmissions((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.submissions.filter((item) => !seen.has(item.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } catch (requestError) {
      logger.warn('admin help pagination failed', requestError);
    } finally {
      setLoadingMore(false);
    }
  }, [authFetch, filters, loadingMore, refreshing]);

  return {
    submissions,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
  };
};
