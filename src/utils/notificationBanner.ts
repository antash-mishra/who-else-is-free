import { AppNotification } from '@api/mappers/notifications';
import { resolveCoverUri } from '@constants/covers';
import { resolveAvatarUri } from '@utils/avatar';
import { parseNotificationPayload } from '@utils/notificationDisplay';

export type BannerAvatar = {
  /** People-driven notifications show the person; outcomes show the plan. */
  kind: 'person' | 'event';
  name: string;
  seed: number | string;
  /** Remote image when the payload carries one (sender avatar or event cover). */
  imageUri?: string;
};

export type BannerContent = {
  /** Sender/requester id when the notification is about a person. */
  personId?: number;
  /** Short uppercase label naming the notification kind ("Message", "Join request"). */
  kindLabel: string;
  /** Leading bold text: the person for people-driven types, otherwise the plan. */
  title: string;
  /** Muted trailer after the title, e.g. the plan a message belongs to. */
  context?: string;
  /** Second line, at most two rows. */
  body: string;
  avatar: BannerAvatar;
};

const KIND_LABELS: Record<string, string> = {
  'chat.message': 'Message',
  'join_request.created': 'Join request',
  'join_request.approved': 'Approved',
  'join_request.denied': 'Declined',
  'event.member_removed': 'Removed',
  'event.deleted': 'Cancelled',
};

const seedFrom = (value: string | undefined, fallback: number | string): number | string => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : value;
};

const numberOrUndefined = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const stripSenderPrefix = (body: string, senderName: string): string => {
  const prefix = `${senderName}: `;
  return senderName && body.startsWith(prefix) ? body.slice(prefix.length) : body;
};

/**
 * Shape a notification for the foreground banner. People-driven types (chat,
 * join requests) lead with the person like a messaging app; outcome types lead
 * with the plan. Falls back to the stored title/body verbatim when the payload
 * lacks structured fields (legacy rows).
 */
export const buildBannerContent = (notification: AppNotification): BannerContent => {
  const payload = parseNotificationPayload(notification.payload);
  const planName = notification.title;
  const kindLabel = KIND_LABELS[notification.type] ?? 'Update';
  const coverUri = payload.coverKey ? resolveCoverUri(payload.coverKey) : undefined;
  const eventAvatar: BannerAvatar = {
    kind: 'event',
    name: planName,
    seed: notification.eventId ?? notification.id,
    imageUri: coverUri,
  };
  const senderAvatarUri = resolveAvatarUri(payload.senderAvatar) ?? undefined;

  if (notification.type === 'chat.message' && payload.senderName) {
    return {
      personId: numberOrUndefined(payload.senderId),
      kindLabel,
      title: payload.senderName,
      context: planName && planName !== payload.senderName ? planName : undefined,
      body: stripSenderPrefix(notification.body, payload.senderName),
      avatar: {
        kind: 'person',
        name: payload.senderName,
        seed: seedFrom(payload.senderId, notification.id),
        imageUri: senderAvatarUri,
      },
    };
  }

  if (notification.type === 'join_request.created' && payload.senderName) {
    return {
      personId: numberOrUndefined(payload.requesterId),
      kindLabel,
      title: payload.senderName,
      context: planName || undefined,
      body: 'Wants to join your plan',
      avatar: {
        kind: 'person',
        name: payload.senderName,
        seed: seedFrom(payload.requesterId, notification.id),
        imageUri: senderAvatarUri,
      },
    };
  }

  return {
    kindLabel,
    title: planName || notification.body,
    body: planName ? notification.body : '',
    avatar: eventAvatar,
  };
};
