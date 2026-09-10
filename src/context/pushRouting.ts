import { InteractionManager } from 'react-native';

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

export type RouteResolvedNotificationOptions = {
  /**
   * Defers the requests sheet until the underlying screen's push transition
   * settles, so the sheet rises over a resting chat screen instead of racing
   * the slide-in. Defaults to `InteractionManager.runAfterInteractions`.
   */
  runAfterTransition?: (task: () => void) => void;
};

const runAfterInteractions = (task: () => void) => {
  InteractionManager.runAfterInteractions(task);
};

export const routeResolvedNotification = (
  resolution: NotificationActionResolution,
  setActiveConversation: (id: number | null) => void,
  navigator: PushNavigator,
  { runAfterTransition = runAfterInteractions }: RouteResolvedNotificationOptions = {},
) => {
  if (!navigator.isReady()) return;

  switch (resolution.destination) {
    case 'chat':
      if (resolution.conversation_id) {
        setActiveConversation(resolution.conversation_id);
        navigator.navigate('ChatThread');
      }
      break;
    case 'join_requests': {
      const eventId = resolution.event_id;
      if (!eventId) break;
      // Land on the same chat screen the in-app requests badge lives on, then
      // raise the Requests sheet over it: group requests belong to the group
      // thread, 1:1 requests to the host's OneToOne hub (keyed by the event
      // when no conversation exists yet). Servers without `group_type` only
      // attach a conversation id to group requests, so treat that as Group.
      const isGroupRequest =
        resolution.group_type === 'Group' ||
        (resolution.group_type == null && resolution.conversation_id != null);
      if (isGroupRequest && resolution.conversation_id) {
        const conversationId = resolution.conversation_id;
        setActiveConversation(conversationId);
        navigator.navigate('ChatThread');
        runAfterTransition(() => {
          navigator.navigate('JoinRequest', { conversationId, eventId });
        });
        break;
      }
      const conversationId = resolution.conversation_id ?? -eventId;
      navigator.navigate('OneToOneHub', {
        conversationId,
        eventId,
        title: resolution.title ?? '',
      });
      runAfterTransition(() => {
        navigator.navigate('JoinRequest', { conversationId, eventId, includeApproved: true });
      });
      break;
    }
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
              resolution.reason === 'event_deleted' || resolution.reason === 'event_ended'
                ? 'event_unavailable'
                : 'access_unavailable',
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
