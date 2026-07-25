/**
 * Collapses the raw notification list into inbox rows (visual collapse, no
 * backend):
 *
 *  - Unread `chat.message` notifications collapse per CONVERSATION into one row.
 *  - Unread `join_request.created` notifications collapse per EVENT into one row
 *    (works for both 1:1 and group events — requests are per-event).
 *  - Read notifications of those two types are dropped (once handled, they're
 *    done — the chat / Join Requests screen is the source of truth).
 *  - Every other notification passes through individually.
 *
 * Input is assumed newest-first; a group is positioned at its latest member, so
 * the overall order stays newest-first.
 */
import { AppNotification } from '@api/mappers/notifications';

export type ChatGroup = {
  conversationId: number;
  /** Event/conversation name (from the latest notification's title). */
  eventName: string;
  /** Unique sender first-names, latest first. */
  senderNames: string[];
  /** Number of unread messages combined. */
  count: number;
  /** First-name of the latest message's sender, for the "Sender: message" preview. */
  latestSender: string;
  /** Latest message body (already stripped of the "Sender: " prefix). */
  latestPreview: string;
  createdAt: string;
  /** All underlying notification ids (marked read together on tap). */
  ids: number[];
};

export type JoinGroup = {
  eventId: number;
  /** Conversation for routing to the Join Requests screen (from the latest). */
  conversationId?: number;
  eventName: string;
  /** Unique requester first-names, latest first. */
  requesterNames: string[];
  count: number;
  createdAt: string;
  ids: number[];
};

export type InboxItem =
  | { kind: 'single'; key: string; createdAt: string; notification: AppNotification }
  | { kind: 'chatGroup'; key: string; createdAt: string; group: ChatGroup }
  | { kind: 'joinGroup'; key: string; createdAt: string; group: JoinGroup };

const firstName = (name: string): string => name.split(' ')[0] || name;

const parseSender = (n: AppNotification): string => {
  if (n.payload) {
    try {
      const p = JSON.parse(n.payload);
      if (p && typeof p.senderName === 'string' && p.senderName) {
        return p.senderName;
      }
    } catch {
      // fall through to body parsing
    }
  }
  const idx = n.body.indexOf(':'); // body is "Sender: message"
  return idx > 0 ? n.body.slice(0, idx).trim() : '';
};

const parsePreview = (n: AppNotification, sender: string): string => {
  const prefix = `${sender}: `;
  return n.body.startsWith(prefix) ? n.body.slice(prefix.length) : n.body;
};

const JOIN_SUFFIX = ' wants to join your event';

const parseRequester = (n: AppNotification): string =>
  n.body.endsWith(JOIN_SUFFIX) ? n.body.slice(0, -JOIN_SUFFIX.length).trim() : n.body.trim();

const conversationIdFromPayload = (n: AppNotification): number | undefined => {
  if (n.conversationId != null) {
    return n.conversationId;
  }
  if (n.payload) {
    try {
      const p = JSON.parse(n.payload);
      const cid = Number(p?.conversationId);
      return Number.isFinite(cid) ? cid : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const addUnique = (names: string[], name: string) => {
  if (name && !names.includes(name)) {
    names.push(name);
  }
};

export const collapseNotifications = (notifications: AppNotification[]): InboxItem[] => {
  const items: InboxItem[] = [];
  const chatIndexByConvo = new Map<number, number>();
  const joinIndexByEvent = new Map<number, number>();

  for (const n of notifications) {
    // ── Chat messages: collapse per conversation (unread only) ──
    if (n.type === 'chat.message') {
      if (n.read) {
        continue;
      }
      const convoId = n.conversationId;
      if (convoId == null) {
        items.push({ kind: 'single', key: `n-${n.id}`, createdAt: n.createdAt, notification: n });
        continue;
      }
      const sender = firstName(parseSender(n));
      const existing = chatIndexByConvo.get(convoId);
      if (existing == null) {
        const group: ChatGroup = {
          conversationId: convoId,
          eventName: n.title,
          senderNames: sender ? [sender] : [],
          count: 1,
          latestSender: sender,
          latestPreview: parsePreview(n, parseSender(n)),
          createdAt: n.createdAt,
          ids: [n.id],
        };
        chatIndexByConvo.set(convoId, items.length);
        items.push({ kind: 'chatGroup', key: `c-${convoId}`, createdAt: n.createdAt, group });
      } else {
        const item = items[existing];
        if (item.kind === 'chatGroup') {
          item.group.count += 1;
          item.group.ids.push(n.id);
          addUnique(item.group.senderNames, sender);
        }
      }
      continue;
    }

    // ── Join requests: collapse per event (unread only) ──
    if (n.type === 'join_request.created') {
      if (n.read) {
        continue;
      }
      const eventId = n.eventId;
      if (eventId == null) {
        items.push({ kind: 'single', key: `n-${n.id}`, createdAt: n.createdAt, notification: n });
        continue;
      }
      const requester = firstName(parseRequester(n));
      const existing = joinIndexByEvent.get(eventId);
      if (existing == null) {
        const group: JoinGroup = {
          eventId,
          conversationId: conversationIdFromPayload(n),
          eventName: n.title,
          requesterNames: requester ? [requester] : [],
          count: 1,
          createdAt: n.createdAt,
          ids: [n.id],
        };
        joinIndexByEvent.set(eventId, items.length);
        items.push({ kind: 'joinGroup', key: `j-${eventId}`, createdAt: n.createdAt, group });
      } else {
        const item = items[existing];
        if (item.kind === 'joinGroup') {
          item.group.count += 1;
          item.group.ids.push(n.id);
          addUnique(item.group.requesterNames, requester);
        }
      }
      continue;
    }

    // ── Everything else: individual row ──
    items.push({ kind: 'single', key: `n-${n.id}`, createdAt: n.createdAt, notification: n });
  }

  return items;
};
