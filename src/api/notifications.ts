import { requestJson } from '@api/client';
import {
  NotificationActionReason,
  NotificationActionState,
  NotificationType,
} from '@api/mappers/notifications';

export type NotificationDestination =
  | 'notifications'
  | 'events'
  | 'event_details'
  | 'join_requests'
  | 'chat';

export type NotificationActionResolveRequest = {
  notification_ids?: number[];
  mark_handled?: boolean;
  type?: NotificationType;
  event_id?: number;
  conversation_id?: number;
  join_request_id?: number;
};

export type NotificationActionResolution = {
  status: NotificationActionState;
  reason?: NotificationActionReason;
  destination: NotificationDestination;
  event_id?: number;
  conversation_id?: number;
  title?: string;
};

export const resolveNotificationAction = (
  token: string,
  request: NotificationActionResolveRequest,
): Promise<NotificationActionResolution> =>
  requestJson<NotificationActionResolution>('/api/notifications/actions/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    token,
    errorMessage: () => 'Unable to open this notification. Please try again.',
  });
