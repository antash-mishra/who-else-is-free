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

import { PermissionsAndroid, Platform } from 'react-native';

import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging as getFirebaseMessaging,
  getToken,
  hasPermission,
  isDeviceRegisteredForRemoteMessages,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
} from '@react-native-firebase/messaging';
import * as SecureStore from 'expo-secure-store';

import { requestJson } from '@api/client';
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useNotifications } from '@context/NotificationsContext';
import { openNotification, PushData, resolutionRequestFromPushData } from '@context/pushRouting';
import { navigationRef } from '@navigation/navigationRef';
import { logger } from '@services/logger';

import type { FirebaseMessagingTypes, Messaging } from '@react-native-firebase/messaging';

const DEVICE_ID_KEY = 'whoelseisfree.pushDeviceId';

type PushContextValue = {
  /** Exposed so ChatContext can check if a push would be suppressed. */
  activeConversationId: number | null;
  requestPushPermission: () => Promise<boolean>;
};

const PushContext = createContext<PushContextValue | undefined>(undefined);
const PUSH_PERMISSION_REQUESTED_KEY = 'whoelseisfree.pushPermissionRequested';

const isEnabledAuthorizationStatus = (status: FirebaseMessagingTypes.AuthorizationStatus) =>
  status === AuthorizationStatus.AUTHORIZED ||
  status === AuthorizationStatus.PROVISIONAL ||
  status === AuthorizationStatus.EPHEMERAL;

const hasPushPermission = async (msg: Messaging): Promise<boolean> => {
  if (Platform.OS === 'android') {
    if (Platform.Version < 33) {
      return true;
    }
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  return isEnabledAuthorizationStatus(await hasPermission(msg));
};

const getOrCreateDeviceId = async (): Promise<string> => {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const registerTokenOnServer = async (fcmToken: string, deviceId: string, authToken: string) => {
  try {
    await requestJson('/api/push-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        device_id: deviceId,
        platform: Platform.OS as 'android' | 'ios',
      }),
      token: authToken,
      timeoutMs: null,
    });
  } catch (err) {
    logger.warn('Failed to register push token', err);
  }
};

const deleteTokenFromServer = async (fcmToken: string, authToken: string) => {
  try {
    await requestJson('/api/push-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: fcmToken }),
      token: authToken,
      timeoutMs: null,
    });
  } catch (err) {
    logger.warn('Failed to delete push token', err);
  }
};

/** Returns a messaging instance, or null when Firebase is not initialised. */
const getMessagingInstance = (): Messaging | null => {
  try {
    return getFirebaseMessaging();
  } catch {
    return null;
  }
};

export const PushProvider = ({ children }: { children: ReactNode }) => {
  const { user, token } = useAuth();
  const { setActiveConversation, activeConversationId } = useChat();
  const { refreshUnreadCount } = useNotifications();
  const fcmTokenRef = useRef<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<number | null>(null);
  const permissionRequestRef = useRef<Promise<boolean> | null>(null);
  const [permissionRevision, setPermissionRevision] = useState(0);

  const requestPushPermission = useCallback(() => {
    if (permissionRequestRef.current) {
      return permissionRequestRef.current;
    }

    permissionRequestRef.current = (async () => {
      try {
        const msg = getMessagingInstance();
        if (!msg) {
          return false;
        }

        if (await hasPushPermission(msg)) {
          return true;
        }

        if (Platform.OS === 'android') {
          if (Platform.Version < 33) {
            return true;
          }
          const wasRequested = await SecureStore.getItemAsync(PUSH_PERMISSION_REQUESTED_KEY);
          if (wasRequested === '1') {
            return false;
          }
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          await SecureStore.setItemAsync(PUSH_PERMISSION_REQUESTED_KEY, '1');
          return result === PermissionsAndroid.RESULTS.GRANTED;
        }

        if (Platform.OS === 'ios') {
          if (!isDeviceRegisteredForRemoteMessages(msg)) {
            await registerDeviceForRemoteMessages(msg);
          }
          const currentStatus = await hasPermission(msg);
          if (currentStatus !== AuthorizationStatus.NOT_DETERMINED) {
            return isEnabledAuthorizationStatus(currentStatus);
          }
          return isEnabledAuthorizationStatus(await requestPermission(msg));
        }

        return false;
      } catch (err) {
        logger.warn('Push notification permission request failed', err);
        return false;
      } finally {
        setPermissionRevision((revision) => revision + 1);
        permissionRequestRef.current = null;
      }
    })();

    return permissionRequestRef.current;
  }, []);

  useEffect(() => {
    authTokenRef.current = token ?? null;
  }, [token]);

  // Register an FCM token when authenticated and permission is already granted.
  // The Discover screen owns the first-time system permission prompt.
  useEffect(() => {
    if (!user || !token) {
      return;
    }

    let unsubscribeRefresh: (() => void) | null = null;

    const setup = async () => {
      try {
        const msg = getMessagingInstance();
        if (!msg) {
          logger.warn('Firebase messaging not available, push notifications disabled');
          return;
        }

        if (!(await hasPushPermission(msg))) {
          return;
        }

        if (Platform.OS === 'ios' && !isDeviceRegisteredForRemoteMessages(msg)) {
          await registerDeviceForRemoteMessages(msg);
        }

        const fcmToken = await getToken(msg);
        fcmTokenRef.current = fcmToken;

        const deviceId = await getOrCreateDeviceId();
        await registerTokenOnServer(fcmToken, deviceId, token);

        // Listen for token refresh
        unsubscribeRefresh = onTokenRefresh(msg, async (newToken) => {
          fcmTokenRef.current = newToken;
          const did = await getOrCreateDeviceId();
          const currentAuthToken = authTokenRef.current;
          if (currentAuthToken) {
            await registerTokenOnServer(newToken, did, currentAuthToken);
          }
        });
      } catch (err) {
        logger.warn('Push notification setup failed', err);
      }
    };

    setup();

    return () => {
      if (unsubscribeRefresh) {
        unsubscribeRefresh();
      }
    };
  }, [permissionRevision, user, token]);

  // Sign-out cleanup: delete push token from backend
  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = user?.id ?? null;

    // User just signed out (was signed in, now null)
    if (prevUserId !== null && user === null) {
      const cachedToken = fcmTokenRef.current;
      const cachedAuthToken = authTokenRef.current;
      if (cachedToken && cachedAuthToken) {
        deleteTokenFromServer(cachedToken, cachedAuthToken);
      }
      fcmTokenRef.current = null;
    }
  }, [user]);

  // Handle notification taps when app is opened from background/quit
  useEffect(() => {
    const msg = getMessagingInstance();
    if (!msg || !token) return;
    let isCancelled = false;

    const routeFromPushTap = (data: PushData, attempt = 0) => {
      if (isCancelled) {
        return;
      }
      if (navigationRef.isReady()) {
        const request = resolutionRequestFromPushData(data);
        if (!request) return;
        openNotification({
          request,
          token,
          setActiveConversation,
          navigator: navigationRef,
        })
          .then(() => refreshUnreadCount())
          .catch((err) => {
            logger.warn('push: notification action resolution failed', err);
          });
        return;
      }
      if (attempt >= 20) {
        return;
      }
      setTimeout(() => {
        if (isCancelled) {
          return;
        }
        routeFromPushTap(data, attempt + 1);
      }, 150);
    };

    // App opened from quit state via notification
    getInitialNotification(msg).then((remoteMessage) => {
      if (remoteMessage?.data) {
        routeFromPushTap(remoteMessage.data as PushData);
      }
    });

    // App opened from background via notification tap
    const unsubscribeOpened = onNotificationOpenedApp(
      msg,
      (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        if (remoteMessage.data) {
          routeFromPushTap(remoteMessage.data as PushData);
        }
      },
    );

    return () => {
      isCancelled = true;
      unsubscribeOpened();
    };
  }, [refreshUnreadCount, setActiveConversation, token]);

  // Foreground message handling: refresh the unread count so the bell badge
  // updates live. The full inbox list is NOT reloaded here (avoids list churn
  // on every in-app chat message); it loads on inbox open / pull-to-refresh.
  // (notification-inbox-plan.md Confirmed Decisions #9 + #10.)
  const refreshUnreadCountRef = useRef(refreshUnreadCount);
  useEffect(() => {
    refreshUnreadCountRef.current = refreshUnreadCount;
  }, [refreshUnreadCount]);

  useEffect(() => {
    const msg = getMessagingInstance();
    if (!msg) return;

    const unsubscribe = onMessage(
      msg,
      async (_remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        // Cheap count-only refresh; the ChatContext still handles WS message:new
        // events for conversation unread counts separately.
        refreshUnreadCountRef.current().catch((err) => {
          logger.warn('notifications: foreground refresh unread count failed', err);
        });
      },
    );

    return unsubscribe;
  }, []);

  // Reset badge count when app comes to foreground.
  // Badge is set to 1 by the backend APNs payload; we clear it when the user opens the app.
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const msg = getMessagingInstance();
      const badgeMessaging = msg as typeof msg & {
        setBadgeCount?: (count: number) => Promise<void>;
      };
      if (typeof badgeMessaging?.setBadgeCount === 'function') {
        badgeMessaging.setBadgeCount(0).catch(() => {});
      }
    }
  }, []);

  const value = useMemo(
    () => ({ activeConversationId, requestPushPermission }),
    [activeConversationId, requestPushPermission],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
};

export const usePush = () => {
  const context = useContext(PushContext);
  if (!context) {
    throw new Error('usePush must be used within a PushProvider');
  }
  return context;
};
