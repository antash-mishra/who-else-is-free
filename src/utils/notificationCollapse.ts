/**
 * Collapses the raw notification list into inbox rows (visual collapse, no
 * backend):
 *
 *  - Active unread tasks collapse per conversation/event.
 *  - Read active tasks stay in the list: they collapse into their own
 *    per-conversation/event group, rendered in the lighter read style, so
 *    opening a row or "Mark all as read" never removes it.
 *  - Resolved/unavailable tasks collapse separately into one muted historical
 *    summary per conversation/event, regardless of read state.
 *  - Every other notification passes through individually.
 *
 * Input is assumed newest-first; a group is positioned at its latest member, so
 * the overall order stays newest-first.
 */
import {
  AppNotification,
  NotificationActionReason,
  NotificationActionState,
} from '@api/mappers/notifications';

export type ChatGroup = {
  conversationId: number;
  /** Event/conversation name (from the latest notification's title). */
  eventName: string;
  /** Unique sender first-names, latest first. */
  senderNames: string[];
  /** Number of messages combined. */
  count: number;
  /** First-name of the latest message's sender, for the "Sender: message" preview. */
  latestSender: string;
  /** Latest message body (already stripped of the "Sender: " prefix). */
  latestPreview: string;
  createdAt: string;
  /** All underlying notification ids (marked read together on tap). */
  ids: number[];
  /** Every member has been read; the row renders in the lighter style. */
  read: boolean;
  actionState: NotificationActionState;
  actionReason?: NotificationActionReason;
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
  /** Every member has been read; the row renders in the lighter style. */
  read: boolean;
  actionState: NotificationActionState;
  actionReason?: NotificationActionReason;
};

/** Active rows split by read state so a read group stays visible but lighter. */
const collapseBucket = (n: AppNotification) =>
  n.actionState !== 'active' ? 'inactive' : n.read ? 'read' : 'unread';

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

const parseRequester = (n: AppNotification): string => {
  if (n.payload) {
    try {
      const payload = JSON.parse(n.payload);
      if (payload && typeof payload.senderName === 'string' && payload.senderName) {
        return payload.senderName;
      }
    } catch {
      // Fall through to legacy body parsing.
    }
  }
  for (const marker of [' wants to join your plan ', ' wants to join your event']) {
    const index = n.body.indexOf(marker);
    if (index > 0) {
      return n.body.slice(0, index).trim();
    }
  }
  return n.body.trim();
};

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
  const chatIndexByConvo = new Map<string, number>();
  const joinIndexByEvent = new Map<string, number>();

  for (const n of notifications) {
    // ── Chat messages: collapse per conversation (unread only) ──
    if (n.type === 'chat.message') {
      const convoId = n.conversationId;
      if (convoId == null) {
        items.push({ kind: 'single', key: `n-${n.id}`, createdAt: n.createdAt, notification: n });
        continue;
      }
      const sender = firstName(parseSender(n));
      const collapseKey = `${convoId}:${collapseBucket(n)}`;
      const existing = chatIndexByConvo.get(collapseKey);
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
          read: n.read,
          actionState: n.actionState,
          actionReason: n.actionReason,
        };
        chatIndexByConvo.set(collapseKey, items.length);
        items.push({
          kind: 'chatGroup',
          key: `c-${collapseKey}`,
          createdAt: n.createdAt,
          group,
        });
      } else {
        const item = items[existing];
        if (item.kind === 'chatGroup') {
          item.group.count += 1;
          item.group.ids.push(n.id);
          item.group.read = item.group.read && n.read;
          addUnique(item.group.senderNames, sender);
          if (n.actionState === 'unavailable') {
            item.group.actionState = 'unavailable';
            item.group.actionReason = n.actionReason;
          }
        }
      }
      continue;
    }

    // ── Join requests: collapse per event (unread only) ──
    if (n.type === 'join_request.created') {
      const eventId = n.eventId;
      if (eventId == null) {
        items.push({ kind: 'single', key: `n-${n.id}`, createdAt: n.createdAt, notification: n });
        continue;
      }
      const requester = firstName(parseRequester(n));
      const collapseKey = `${eventId}:${collapseBucket(n)}`;
      const existing = joinIndexByEvent.get(collapseKey);
      if (existing == null) {
        const group: JoinGroup = {
          eventId,
          conversationId: conversationIdFromPayload(n),
          eventName: n.title,
          requesterNames: requester ? [requester] : [],
          count: 1,
          createdAt: n.createdAt,
          ids: [n.id],
          read: n.read,
          actionState: n.actionState,
          actionReason: n.actionReason,
        };
        joinIndexByEvent.set(collapseKey, items.length);
        items.push({
          kind: 'joinGroup',
          key: `j-${collapseKey}`,
          createdAt: n.createdAt,
          group,
        });
      } else {
        const item = items[existing];
        if (item.kind === 'joinGroup') {
          item.group.count += 1;
          item.group.ids.push(n.id);
          item.group.read = item.group.read && n.read;
          addUnique(item.group.requesterNames, requester);
          if (n.actionState === 'unavailable') {
            item.group.actionState = 'unavailable';
            item.group.actionReason = n.actionReason;
          }
        }
      }
      continue;
    }

    // ── Everything else: individual row ──
    items.push({ kind: 'single', key: `n-${n.id}`, createdAt: n.createdAt, notification: n });
  }

  return items;
};
