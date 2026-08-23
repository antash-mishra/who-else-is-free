import {
  NotificationActionResolution,
  NotificationActionResolveRequest,
  resolveNotificationAction,
} from '@api/notifications';
import type { RootStackParamList } from '@navigation/types';

import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

export type PushData = {
  type?: string;
  notificationId?: string;
  conversationId?: string;
  eventId?: string;
  joinRequestId?: string;
  requesterId?: string;
  title?: string;
  body?: string;
  senderName?: string;
  senderId?: string;
};

export type PushNavigator = Pick<
  NavigationContainerRefWithCurrent<RootStackParamList>,
  'isReady' | 'navigate'
>;

const positiveNumber = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const resolutionRequestFromPushData = (
  data: PushData,
): NotificationActionResolveRequest | null => {
  const notificationId = positiveNumber(data.notificationId);
  if (notificationId) {
    return { notification_ids: [notificationId], mark_handled: true };
  }

  const type = (data.type ?? '').trim().toLowerCase();
  if (!type) return null;
  return {
    type,
    event_id: positiveNumber(data.eventId),
    conversation_id: positiveNumber(data.conversationId),
    join_request_id: positiveNumber(data.joinRequestId),
    mark_handled: true,
  };
};

export const routeResolvedNotification = (
  resolution: NotificationActionResolution,
  setActiveConversation: (id: number | null) => void,
  navigator: PushNavigator,
) => {
  if (!navigator.isReady()) return;

  switch (resolution.destination) {
    case 'chat':
      if (resolution.conversation_id) {
        setActiveConversation(resolution.conversation_id);
        navigator.navigate('ChatThread');
      }
      break;
    case 'join_requests':
      if (resolution.conversation_id && resolution.event_id) {
        navigator.navigate('JoinRequests', {
          conversationId: resolution.conversation_id,
          eventId: resolution.event_id,
          title: resolution.title ?? '',
        });
      }
      break;
    case 'event_details':
      if (resolution.event_id) {
        navigator.navigate('EventDetails', {
          eventId: String(resolution.event_id),
          origin: 'MyEvents',
        });
      }
      break;
    case 'events':
      if (resolution.status === 'unavailable') {
        navigator.navigate('Main', {
          screen: 'Events',
          params: {
            notificationNotice:
              resolution.reason === 'event_deleted' ? 'event_unavailable' : 'access_unavailable',
          },
        });
      } else {
        navigator.navigate('Main', { screen: 'Events' });
      }
      break;
    case 'notifications':
      break;
  }
};

export type OpenNotificationOptions = {
  request: NotificationActionResolveRequest;
  token: string;
  setActiveConversation: (id: number | null) => void;
  navigator: PushNavigator;
};

// One server-authoritative opening path shared by inbox rows and OS push taps.
export const openNotification = async ({
  request,
  token,
  setActiveConversation,
  navigator,
}: OpenNotificationOptions): Promise<NotificationActionResolution> => {
  const resolution = await resolveNotificationAction(token, request);
  routeResolvedNotification(resolution, setActiveConversation, navigator);
  return resolution;
};
