import { useCallback, useState } from 'react';

import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useNotifications } from '@context/NotificationsContext';
import { openNotification } from '@context/pushRouting';
import { navigationRef } from '@navigation/navigationRef';
import { logger } from '@services/logger';

/**
 * One server-authoritative opening path shared by inbox rows and the
 * foreground banner: resolve the notification action through
 * `POST /api/notifications/actions/resolve`, navigate to the resolved
 * destination, then mirror the resolution into the inbox state.
 */
export const useOpenNotifications = () => {
  const { token } = useAuth();
  const { setActiveConversation } = useChat();
  const { applyActionResolution } = useNotifications();
  const [resolvingIDs, setResolvingIDs] = useState<Set<number>>(() => new Set());
  const [openError, setOpenError] = useState(false);

  const openNotificationIDs = useCallback(
    async (ids: number[]) => {
      if (!token || ids.length === 0 || ids.some((id) => resolvingIDs.has(id))) return;
      setOpenError(false);
      setResolvingIDs((current) => new Set([...current, ...ids]));
      try {
        const resolution = await openNotification({
          request: { notification_ids: ids, mark_handled: true },
          token,
          setActiveConversation,
          navigator: navigationRef,
        });
        applyActionResolution(ids, resolution);
      } catch (err) {
        logger.warn('notifications: action resolution failed', err);
        setOpenError(true);
      } finally {
        setResolvingIDs((current) => {
          const next = new Set(current);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [applyActionResolution, resolvingIDs, setActiveConversation, token],
  );

  const clearOpenError = useCallback(() => setOpenError(false), []);

  return { openNotificationIDs, resolvingIDs, openError, clearOpenError };
};
