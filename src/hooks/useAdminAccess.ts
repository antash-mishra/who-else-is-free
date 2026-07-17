import { useCallback, useEffect, useState } from 'react';

import { getAdminAccess } from '@api/adminHelp';
import { useAuth } from '@context/AuthContext';
import { logger } from '@services/logger';

interface AdminAccessState {
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useAdminAccess = (): AdminAccessState => {
  const { user, token, authFetch } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkedUserID, setCheckedUserID] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !token) {
      return;
    }
    try {
      setIsAdmin(await getAdminAccess(authFetch));
    } catch (error) {
      logger.warn('admin access check failed', error);
      setIsAdmin(false);
    } finally {
      setCheckedUserID(user.id);
    }
  }, [authFetch, token, user]);

  useEffect(() => {
    if (!user || !token) return undefined;
    let active = true;
    getAdminAccess(authFetch)
      .then((result) => {
        if (active) {
          setIsAdmin(result);
          setCheckedUserID(user.id);
        }
      })
      .catch((error: unknown) => {
        logger.warn('admin access check failed', error);
        if (active) {
          setIsAdmin(false);
          setCheckedUserID(user.id);
        }
      });
    return () => {
      active = false;
    };
  }, [authFetch, token, user]);

  const hasCurrentResult = !!user && !!token && checkedUserID === user.id;
  return {
    isAdmin: hasCurrentResult && isAdmin,
    loading: !!user && !!token && !hasCurrentResult,
    refresh,
  };
};
