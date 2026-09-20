import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useNotifications } from '@context/NotificationsContext';
import { openNotification, runAfterNavigationTransition } from '@context/pushRouting';
import { navigationRef } from '@navigation/navigationRef';
import { logger } from '@services/logger';

/**
 * Server-authoritative opening for inbox rows: resolve the notification action through
 * `POST /api/notifications/actions/resolve`, navigate to the resolved
 * destination, then mirror the resolution into the inbox state.
 */
export const useOpenNotifications = () => {
  const { token } = useAuth();
  const { setActiveConversation } = useChat();
  const { applyActionResolution } = useNotifications();
  const [resolvingIDs, setResolvingIDs] = useState<Set<number>>(() => new Set());
  const [openError, setOpenError] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const openNotificationIDs = useCallback(
    async (ids: number[]) => {
      if (!token || ids.length === 0 || ids.some((id) => resolvingIDs.has(id))) return;
      setOpenError(false);
      setResolvingIDs((current) => new Set([...current, ...ids]));
      let reconciliationScheduled = false;
      try {
        const resolution = await openNotification({
          request: { notification_ids: ids, mark_handled: true },
          token,
          setActiveConversation,
          navigator: navigationRef,
        });
        // The server has already persisted the resolution. Keep the outgoing
        // inbox tree stable while its navigation transition is running, then
        // reconcile the local row and unread count once interactions settle.
        reconciliationScheduled = true;
        runAfterNavigationTransition(() => {
          applyActionResolution(ids, resolution);
          if (isMountedRef.current) {
            setResolvingIDs((current) => {
              const next = new Set(current);
              ids.forEach((id) => next.delete(id));
              return next;
            });
          }
        });
      } catch (err) {
        logger.warn('notifications: action resolution failed', err);
        setOpenError(true);
      } finally {
        if (!reconciliationScheduled) {
          setResolvingIDs((current) => {
            const next = new Set(current);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        }
      }
    },
    [applyActionResolution, resolvingIDs, setActiveConversation, token],
  );

  const clearOpenError = useCallback(() => setOpenError(false), []);

  return { openNotificationIDs, resolvingIDs, openError, clearOpenError };
};
