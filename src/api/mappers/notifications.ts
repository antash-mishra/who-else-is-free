/**
 * Notification API mapper.
 *
 * Inbox display body is finalized server-side in `server/notification_payloads.go`
 * (with friendlier text for the three "harsh" override types). The client is a
 * pure renderer — it never constructs inbox text, it just maps the wire shape
 * into the domain type.
 */

export type NotificationType =
  | 'chat.message'
  | 'join_request.created'
  | 'join_request.approved'
  | 'join_request.denied'
  | 'event.member_removed'
  | 'event.deleted'
  // Unknown types should still render gracefully rather than crash the inbox.
  | string;

export type NotificationActionState = 'active' | 'resolved' | 'unavailable';

export type NotificationActionReason =
  | 'event_deleted'
  | 'request_approved'
  | 'request_denied'
  | 'request_cancelled'
  | 'requester_deleted'
  | 'access_removed'
  | 'member_left'
  | 'conversation_deleted'
  | 'conversation_replaced'
  | 'event_ended';

/** Wire shape returned by `GET /api/notifications`. */
export type ApiNotification = {
  id: number;
  type: NotificationType;
  event_id?: number;
  conversation_id?: number;
  join_request_id?: number;
  title: string;
  body: string;
  payload?: string;
  read: boolean;
  action_state: NotificationActionState;
  action_reason?: NotificationActionReason;
  action_resolved_at?: string;
  created_at: string; // ISO 8601 timestamp
};

/** Domain type consumed by the inbox UI. */
export type AppNotification = {
  id: number;
  type: NotificationType;
  eventId?: number;
  conversationId?: number;
  joinRequestId?: number;
  title: string;
  body: string;
  payload?: string;
  read: boolean;
  actionState: NotificationActionState;
  actionReason?: NotificationActionReason;
  actionResolvedAt?: string;
  createdAt: string;
};

export const mapNotification = (raw: ApiNotification): AppNotification => ({
  id: raw.id,
  type: raw.type,
  eventId: raw.event_id,
  conversationId: raw.conversation_id,
  joinRequestId: raw.join_request_id,
  title: raw.title,
  body: raw.body,
  payload: raw.payload,
  read: raw.read,
  actionState: raw.action_state,
  actionReason: raw.action_reason,
  actionResolvedAt: raw.action_resolved_at,
  createdAt: raw.created_at,
});

export const mapNotifications = (list: ApiNotification[]): AppNotification[] =>
  list.map(mapNotification);
