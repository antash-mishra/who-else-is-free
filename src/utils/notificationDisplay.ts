/**
 * Builds the single-line notification-inbox copy as styled segments.
 *
 * Known single-row notifications render the server-supplied inbox body
 * verbatim, splitting only structured actor/event values into bold segments.
 * Chat and collapsed groups retain their richer client-only presentation.
 */
import { AppNotification } from '@api/mappers/notifications';
import { ChatGroup, JoinGroup } from '@utils/notificationCollapse';

export type NotificationSegment = { text: string; bold?: boolean; muted?: boolean };

export type NotificationDisplay = {
  segments: NotificationSegment[];
};

/** Flattens the display copy to a plain string (used for the row's a11y label). */
export const notificationPlainText = (notification: AppNotification): string =>
  buildNotificationDisplay(notification)
    .segments.map((segment) => segment.text)
    .join('');

/**
 * Builds the copy for a collapsed chat group. Leads with the latest sender:
 *   1 sender  → "Sylvie"
 *   2 senders → "Sylvie, Joe"
 *   3+        → "Sylvie, Joe & N others" (N = count − 2, singular "& 1 other")
 * "message"/"messages" pluralizes on the combined count.
 */
const formatSenderNames = (names: string[]): string => {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  if (names.length === 2) {
    return `${names[0]}, ${names[1]}`;
  }
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} & ${others} other${others === 1 ? '' : 's'}`;
};

export const buildChatGroupDisplay = (group: ChatGroup): NotificationDisplay => {
  // Lead with the latest sender only (the same person shown in the preview line);
  // collapse everyone else into "& N other(s)" so the header never grows a list.
  const latest = group.senderNames[0] ?? '';
  const others = group.senderNames.length - 1;
  const senders = others > 0 ? `${latest} & ${others} other${others === 1 ? '' : 's'}` : latest;
  const messageWord = group.count > 1 ? 'messages' : 'message';
  // Preview reads "Sender: message" inline after the header, in a dark grey.
  const preview = group.latestSender
    ? `${group.latestSender}: ${group.latestPreview}`
    : group.latestPreview;
  return {
    segments: [
      { text: `New ${messageWord} from `, bold: false },
      { text: senders, bold: true },
      { text: ' in ', bold: false },
      { text: group.eventName, bold: true },
      { text: '. ', bold: false },
      { text: preview, bold: false, muted: true },
    ],
  };
};

export const chatGroupPlainText = (group: ChatGroup): string =>
  buildChatGroupDisplay(group)
    .segments.map((segment) => segment.text)
    .join('');

/**
 * Builds the copy for a collapsed join-request group (per event):
 *   "Sylvie wants to join your plan Dancing."
 *   "Sylvie, Joe & 2 others want to join your plan Dancing."
 * (verb agrees: "wants" for one requester, "want" for many).
 */
export const buildJoinGroupDisplay = (group: JoinGroup): NotificationDisplay => {
  const requesters = formatSenderNames(group.requesterNames);
  const verb = group.requesterNames.length > 1 ? 'want' : 'wants';
  return {
    segments: [
      { text: requesters, bold: true },
      { text: ` ${verb} to join your plan `, bold: false },
      { text: group.eventName, bold: true },
      { text: '.', bold: false },
    ],
  };
};

export const joinGroupPlainText = (group: JoinGroup): string =>
  buildJoinGroupDisplay(group)
    .segments.map((segment) => segment.text)
    .join('');

const parsePayload = (payload?: string): Record<string, string> => {
  if (!payload) {
    return {};
  }
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const splitBodyWithBoldValues = (body: string, values: string[]): NotificationSegment[] => {
  const remainingValues = [...new Set(values.filter(Boolean))];
  const segments: NotificationSegment[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    let nextIndex = -1;
    let nextValue = '';
    for (const value of remainingValues) {
      const index = body.indexOf(value, cursor);
      if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
        nextIndex = index;
        nextValue = value;
      }
    }
    if (nextIndex < 0) {
      segments.push({ text: body.slice(cursor), bold: false });
      break;
    }
    if (nextIndex > cursor) {
      segments.push({ text: body.slice(cursor, nextIndex), bold: false });
    }
    segments.push({ text: nextValue, bold: true });
    cursor = nextIndex + nextValue.length;
  }

  return segments.length > 0 ? segments : [{ text: body, bold: false }];
};

const requesterFromBody = (body: string): string => {
  for (const marker of [' wants to join your plan ', ' wants to join your event']) {
    const index = body.indexOf(marker);
    if (index > 0) {
      return body.slice(0, index).trim();
    }
  }
  return '';
};

export const buildNotificationDisplay = (notification: AppNotification): NotificationDisplay => {
  const eventName = notification.title;
  const payload = parsePayload(notification.payload);

  switch (notification.type) {
    case 'chat.message': {
      const senderName = payload.senderName || notification.body.split(':')[0].trim();
      const prefix = `${senderName}: `;
      const preview = notification.body.startsWith(prefix)
        ? notification.body.slice(prefix.length)
        : notification.body;
      return {
        segments: [
          { text: 'New message from ', bold: false },
          { text: senderName, bold: true },
          { text: ' in ', bold: false },
          { text: eventName, bold: true },
          { text: '. ', bold: false },
          // The message itself, inline, in a dark grey (colors.muted).
          { text: `${senderName}: ${preview}`, bold: false, muted: true },
        ],
      };
    }

    case 'join_request.created': {
      const actor = payload.senderName || requesterFromBody(notification.body);
      return { segments: splitBodyWithBoldValues(notification.body, [actor, eventName]) };
    }

    case 'join_request.approved':
      return { segments: splitBodyWithBoldValues(notification.body, [eventName]) };

    case 'join_request.denied':
      return { segments: splitBodyWithBoldValues(notification.body, [eventName]) };

    case 'event.member_removed':
      return { segments: splitBodyWithBoldValues(notification.body, [eventName]) };

    case 'event.deleted':
      return { segments: splitBodyWithBoldValues(notification.body, [eventName]) };

    default:
      // Unknown type: render the server body verbatim so the inbox never breaks.
      return { segments: [{ text: notification.body, bold: false }] };
  }
};
