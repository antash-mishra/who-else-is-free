import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { requestJson } from '@api/client';
import { ApiNotification, AppNotification, mapNotifications } from '@api/mappers/notifications';
import { NotificationActionResolution } from '@api/notifications';
import { useAuth } from '@context/AuthContext';
import { logger } from '@services/logger';

const PAGE_SIZE = 20;

type NotificationsContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Reload page 1 + unread count. Used on inbox open and pull-to-refresh. */
  refresh: () => Promise<void>;
  /** Append the next page (no-op when the list is exhausted). */
  loadMore: () => Promise<void>;
  /** Cheap unread-count-only fetch used by foreground push refresh + mark-read re-sync. */
  refreshUnreadCount: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  applyActionResolution: (ids: number[], resolution: NotificationActionResolution) => void;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFetch = !!token;
  const offsetRef = useRef(0);
  const exhaustedRef = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!canFetch) {
      setUnreadCount(0);
      return;
    }
    try {
      const payload = await requestJson<{ count: number }>('/api/notifications/unread-count', {
        token,
        errorMessage: () => 'Failed to load unread count',
      });
      setUnreadCount(payload?.count ?? 0);
    } catch (err) {
      logger.warn('notifications: unread count failed', err);
    }
  }, [canFetch, token]);

  // Full page-1 reload + unread count.
  const refresh = useCallback(async () => {
    if (!canFetch) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const payload = await requestJson<{ notifications?: ApiNotification[] }>(
        `/api/notifications?limit=${PAGE_SIZE}&offset=0`,
        {
          token,
          errorMessage: () => 'Failed to load notifications',
        },
      );
      const rows = mapNotifications(payload?.notifications ?? []);
      setNotifications(rows);
      offsetRef.current = rows.length;
      exhaustedRef.current = rows.length < PAGE_SIZE;
      await fetchUnreadCount();
    } catch (err) {
      logger.warn('notifications: refresh failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setRefreshing(false);
    }
  }, [canFetch, token, fetchUnreadCount]);

  const loadMore = useCallback(async () => {
    if (!canFetch || refreshing || loading || exhaustedRef.current) {
      return;
    }
    setLoading(true);
    try {
      const offset = offsetRef.current;
      const payload = await requestJson<{ notifications?: ApiNotification[] }>(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${offset}`,
        {
          token,
          errorMessage: () => 'Failed to load notifications',
        },
      );
      const rows = mapNotifications(payload?.notifications ?? []);
      if (rows.length === 0) {
        exhaustedRef.current = true;
        return;
      }
      setNotifications((prev) => {
        // De-duplicate by id in case the server shifted an offset boundary.
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...rows.filter((n) => !seen.has(n.id))];
      });
      offsetRef.current = offset + rows.length;
      if (rows.length < PAGE_SIZE) {
        exhaustedRef.current = true;
      }
    } catch (err) {
      logger.warn('notifications: loadMore failed', err);
    } finally {
      setLoading(false);
    }
  }, [canFetch, refreshing, loading, token]);

  const refreshUnreadCount = fetchUnreadCount;

  const markRead = useCallback(
    async (id: number) => {
      // Optimistic flip + count decrement (Confirmed Decision #10).
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (!canFetch) {
        return;
      }
      try {
        await requestJson(`/api/notifications/${id}/read`, {
          method: 'POST',
          token,
          errorMessage: () => 'Failed to mark notification read',
        });
        // Re-sync count only (not the visible list) to avoid scroll flicker.
        await fetchUnreadCount();
      } catch (err) {
        logger.warn('notifications: markRead failed', err);
        // Revert optimistic state on real failure by re-syncing both.
        await refresh();
      }
    },
    [canFetch, token, fetchUnreadCount, refresh],
  );

  const applyActionResolution = useCallback(
    (ids: number[], resolution: NotificationActionResolution) => {
      const idSet = new Set(ids);
      const activeUnreadCount = notifications.filter(
        (notification) =>
          idSet.has(notification.id) && !notification.read && notification.actionState === 'active',
      ).length;
      const resolvedAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((notification) => {
          if (!idSet.has(notification.id)) return notification;
          return {
            ...notification,
            read: true,
            ...(resolution.status === 'active'
              ? {}
              : {
                  actionState: resolution.status,
                  actionReason: resolution.reason,
                  actionResolvedAt: resolvedAt,
                }),
          };
        }),
      );
      setUnreadCount((prev) => Math.max(0, prev - activeUnreadCount));
      fetchUnreadCount().catch(() => undefined);
    },
    [fetchUnreadCount, notifications],
  );

  const markAllRead = useCallback(async () => {
    // Optimistically flip all visible rows + reset count (Confirmed Decision #12).
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    if (!canFetch) {
      return;
    }
    try {
      await requestJson('/api/notifications/read-all', {
        method: 'POST',
        token,
        errorMessage: () => 'Failed to mark notifications read',
      });
      // Reconcile by refetching page 1 (now all read).
      await refresh();
    } catch (err) {
      logger.warn('notifications: markAllRead failed', err);
      await refresh();
    }
  }, [canFetch, token, refresh]);

  const clearAll = useCallback(async () => {
    // Optimistically clear the list + count.
    setNotifications([]);
    setUnreadCount(0);
    offsetRef.current = 0;
    exhaustedRef.current = true;
    if (!canFetch) {
      return;
    }
    try {
      await requestJson('/api/notifications', {
        method: 'DELETE',
        token,
        errorMessage: () => 'Failed to clear notifications',
      });
      await refresh();
    } catch (err) {
      logger.warn('notifications: clearAll failed', err);
      await refresh();
    }
  }, [canFetch, token, refresh]);

  // On sign-in, load the inbox; on sign-out, clear state.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sign-out requires synchronous state reset.
      setNotifications([]);

      setUnreadCount(0);
      offsetRef.current = 0;
      exhaustedRef.current = false;
      return;
    }
    refresh().catch(() => undefined);
  }, [user, refresh]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      refreshing,
      error,
      refresh,
      loadMore,
      refreshUnreadCount,
      markRead,
      applyActionResolution,
      markAllRead,
      clearAll,
    }),
    [
      notifications,
      unreadCount,
      loading,
      refreshing,
      error,
      refresh,
      loadMore,
      refreshUnreadCount,
      markRead,
      applyActionResolution,
      markAllRead,
      clearAll,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};
