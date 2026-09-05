import { AppNotification } from '@api/mappers/notifications';
import { resolveCoverUri } from '@constants/covers';
import { parseNotificationPayload } from '@utils/notificationDisplay';

export type NotificationImageSource = { id: string | number; imageUri?: string };

/**
 * Resolve the event cover for a notification from the already-loaded events
 * list. Shared by the inbox rows and the foreground banner so both surfaces
 * pick the same artwork (or the same monogram fallback when undefined).
 */
export const resolveNotificationEventImageUri = (
  events: readonly NotificationImageSource[],
  eventId: number | null | undefined,
): string | undefined => {
  if (eventId == null) {
    return undefined;
  }
  return events.find((event) => Number(event.id) === eventId)?.imageUri;
};

/**
 * Cover for a single notification: the payload's `coverKey` wins (it survives
 * the plan leaving the user's lists, e.g. cancelled or declined plans), then the
 * loaded events list.
 */
export const resolveNotificationCoverUri = (
  notification: Pick<AppNotification, 'eventId' | 'payload'>,
  events: readonly NotificationImageSource[],
): string | undefined => {
  const { coverKey } = parseNotificationPayload(notification.payload);
  if (coverKey) {
    return resolveCoverUri(coverKey);
  }
  return resolveNotificationEventImageUri(events, notification.eventId);
};
