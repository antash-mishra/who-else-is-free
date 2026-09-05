import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppNotification } from '@api/mappers/notifications';
import NotificationBanner from '@components/NotificationBanner';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';
import { useNotifications } from '@context/NotificationsContext';
import { useOpenNotifications } from '@hooks/useOpenNotifications';
import { navigationRef } from '@navigation/navigationRef';
import { resolveAvatarUri } from '@utils/avatar';
import { buildBannerContent } from '@utils/notificationBanner';
import { resolveNotificationCoverUri } from '@utils/notificationImage';

/** Routes where the inbox itself is on screen, so a banner would be redundant. */
const SUPPRESSED_ROUTES = new Set<string>(['Notifications']);

export type BannerSuppressionContext = {
  navigatorReady: boolean;
  currentRouteName: string | undefined;
  activeConversationId: number | null;
};

/**
 * Decide whether an incoming notification should surface as a banner. Pure so
 * the rules are unit-testable independent of the host component.
 */
export const shouldSuppressBanner = (
  notification: AppNotification,
  context: BannerSuppressionContext,
): boolean => {
  if (!context.navigatorReady) return true;
  if (notification.read || notification.actionState !== 'active') return true;
  if (context.currentRouteName && SUPPRESSED_ROUTES.has(context.currentRouteName)) return true;
  if (
    notification.type === 'chat.message' &&
    notification.conversationId != null &&
    context.activeConversationId === notification.conversationId
  ) {
    return true;
  }
  return false;
};

/**
 * NotificationBannerHost: the single foreground banner surface. Mounted once
 * in AppNavigator above the NavigationContainer; it listens for notifications
 * that NotificationsContext merged live from the WebSocket and shows the
 * latest one, replacing any banner already on screen.
 */
const NotificationBannerHost = () => {
  const { subscribeToIncomingNotifications } = useNotifications();
  const { activeConversationId, conversations } = useChat();
  const { events } = useEvents();
  const { openNotificationIDs } = useOpenNotifications();
  const [current, setCurrent] = useState<AppNotification | null>(null);
  const activeConversationRef = useRef(activeConversationId);

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(
    () =>
      subscribeToIncomingNotifications((notification) => {
        const navigatorReady = navigationRef.isReady();
        const suppressed = shouldSuppressBanner(notification, {
          navigatorReady,
          currentRouteName: navigatorReady ? navigationRef.getCurrentRoute()?.name : undefined,
          activeConversationId: activeConversationRef.current,
        });
        if (suppressed) return;
        setCurrent(notification);
      }),
    [subscribeToIncomingNotifications],
  );

  const handlePress = useCallback(
    (notification: AppNotification) => {
      openNotificationIDs([notification.id]).catch(() => undefined);
    },
    [openNotificationIDs],
  );

  const handleDismissed = useCallback(() => setCurrent(null), []);

  // Image fallbacks when the payload carries none: the plan cover from the
  // loaded events, or the sender's avatar from the conversation roster.
  const fallbackImageUri = useMemo(() => {
    if (!current) return undefined;
    const content = buildBannerContent(current);
    if (content.avatar.imageUri) return undefined;
    if (content.avatar.kind === 'event') {
      return resolveNotificationCoverUri(current, events);
    }
    const participant = conversations
      .find((conversation) => conversation.id === current.conversationId)
      ?.participants.find((member) => member.id === content.personId);
    return resolveAvatarUri(participant?.avatar) ?? undefined;
  }, [conversations, current, events]);

  return (
    <NotificationBanner
      notification={current}
      imageUri={fallbackImageUri}
      onPress={handlePress}
      onDismissed={handleDismissed}
    />
  );
};

export default NotificationBannerHost;
