import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

import { Platform } from "react-native";
import messaging, {
  FirebaseMessagingTypes,
} from "@react-native-firebase/messaging";
import * as SecureStore from "expo-secure-store";

import { API_BASE_URL } from "@api/config";
import { useAuth } from "@context/AuthContext";
import { useChat } from "@context/ChatContext";
import { navigationRef } from "@navigation/navigationRef";

const DEVICE_ID_KEY = "whoelseisfree.pushDeviceId";

type PushContextValue = {
  /** Exposed so ChatContext can check if a push would be suppressed. */
  activeConversationId: number | null;
};

const PushContext = createContext<PushContextValue | undefined>(undefined);

const getOrCreateDeviceId = async (): Promise<string> => {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId =
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const registerTokenOnServer = async (
  fcmToken: string,
  deviceId: string,
  authToken: string,
) => {
  try {
    await fetch(`${API_BASE_URL}/api/push-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token: fcmToken,
        device_id: deviceId,
        platform: Platform.OS as "android" | "ios",
      }),
    });
  } catch (err) {
    console.warn("Failed to register push token", err);
  }
};

const deleteTokenFromServer = async (
  fcmToken: string,
  authToken: string,
) => {
  try {
    await fetch(`${API_BASE_URL}/api/push-tokens`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: fcmToken }),
    });
  } catch (err) {
    console.warn("Failed to delete push token", err);
  }
};

/** Returns a messaging instance, or null when Firebase is not initialised. */
const getMessaging = (): ReturnType<typeof messaging> | null => {
  try {
    return messaging();
  } catch {
    return null;
  }
};

type PushData = {
  type?: string;
  conversationId?: string;
  eventId?: string;
  title?: string;
  body?: string;
  senderName?: string;
  senderId?: string;
};

const handleNotificationTap = (
  data: PushData,
  setActiveConversation: (id: number | null) => void,
) => {
  if (!navigationRef.isReady()) {
    return;
  }

  switch (data.type) {
    case "chat.message": {
      const conversationId = data.conversationId
        ? Number(data.conversationId)
        : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        (navigationRef as any).navigate("ChatThread");
      }
      break;
    }
    case "join_request.created": {
      const conversationId = data.conversationId
        ? Number(data.conversationId)
        : undefined;
      const eventId = data.eventId ? Number(data.eventId) : undefined;
      const title = data.title ?? "";
      if (conversationId && eventId) {
        (navigationRef as any).navigate("JoinRequests", {
          conversationId,
          eventId,
          title,
        });
      }
      break;
    }
    case "join_request.approved": {
      const conversationId = data.conversationId
        ? Number(data.conversationId)
        : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        (navigationRef as any).navigate("ChatThread");
      }
      break;
    }
    case "join_request.denied": {
      (navigationRef as any).navigate("Main", {
        screen: "Messages",
      });
      break;
    }
  }
};

export const PushProvider = ({ children }: { children: ReactNode }) => {
  const { user, token } = useAuth();
  const { setActiveConversation, activeConversationId } = useChat();
  const fcmTokenRef = useRef<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    authTokenRef.current = token ?? null;
  }, [token]);

  // Request permission and get FCM token when authenticated
  useEffect(() => {
    if (!user || !token) {
      return;
    }

    let unsubscribeRefresh: (() => void) | null = null;

    const setup = async () => {
      try {
        const msg = getMessaging();
        if (!msg) {
          console.warn("Firebase messaging not available, push notifications disabled");
          return;
        }

        if (Platform.OS === "ios" && !msg.isDeviceRegisteredForRemoteMessages) {
          await msg.registerDeviceForRemoteMessages();
        }

        let authStatus = await msg.hasPermission();
        if (authStatus === messaging.AuthorizationStatus.NOT_DETERMINED) {
          authStatus = await msg.requestPermission();
        }
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL ||
          authStatus === messaging.AuthorizationStatus.EPHEMERAL;

        if (!enabled) {
          console.warn("Push notification permission denied or restricted", {
            authStatus,
          });
          return;
        }

        const fcmToken = await msg.getToken();
        fcmTokenRef.current = fcmToken;

        const deviceId = await getOrCreateDeviceId();
        await registerTokenOnServer(fcmToken, deviceId, token);

        // Listen for token refresh
        unsubscribeRefresh = msg.onTokenRefresh(async (newToken) => {
          fcmTokenRef.current = newToken;
          const did = await getOrCreateDeviceId();
          const currentAuthToken = authTokenRef.current;
          if (currentAuthToken) {
            await registerTokenOnServer(newToken, did, currentAuthToken);
          }
        });
      } catch (err) {
        console.warn("Push notification setup failed", err);
      }
    };

    setup();

    return () => {
      if (unsubscribeRefresh) {
        unsubscribeRefresh();
      }
    };
  }, [user, token]);

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
    const msg = getMessaging();
    if (!msg) return;

    // App opened from quit state via notification
    msg
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage?.data) {
          // Small delay to ensure navigation is ready
          setTimeout(() => {
            handleNotificationTap(
              remoteMessage.data as PushData,
              setActiveConversation,
            );
          }, 1000);
        }
      });

    // App opened from background via notification tap
    const unsubscribeOpened = msg.onNotificationOpenedApp(
      (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        if (remoteMessage.data) {
          handleNotificationTap(
            remoteMessage.data as PushData,
            setActiveConversation,
          );
        }
      },
    );

    return unsubscribeOpened;
  }, [setActiveConversation]);

  // Foreground message handling (silent for MVP - just update unread counts)
  useEffect(() => {
    const msg = getMessaging();
    if (!msg) return;

    const unsubscribe = msg.onMessage(
      async (_remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        // MVP: silently update unread counts via existing WS connection.
        // The ChatContext already handles WS message:new events which update
        // unread counts. No additional action needed here.
        // Future: display in-app banner for messages in other conversations.
      },
    );

    return unsubscribe;
  }, []);

  // Reset badge count when app comes to foreground.
  // Badge is set to 1 by the backend APNs payload; we clear it when the user opens the app.
  useEffect(() => {
    if (Platform.OS === "ios") {
      const msg = getMessaging();
      if (msg && typeof (msg as any).setBadgeCount === "function") {
        (msg as any).setBadgeCount(0).catch(() => {});
      }
    }
  }, []);

  const value = { activeConversationId };

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
};

export const usePush = () => {
  const context = useContext(PushContext);
  if (!context) {
    throw new Error("usePush must be used within a PushProvider");
  }
  return context;
};
