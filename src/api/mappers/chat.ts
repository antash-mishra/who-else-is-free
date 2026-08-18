import { getScheduleDisplay } from '@utils/dateTime';

export type ConversationParticipant = {
  id: number;
  name: string;
  avatar?: string;
};

export type ChatReplyTo = {
  id: string;
  senderId: number;
  body: string;
  senderName: string;
};

export type ChatMessage = {
  id: string;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
  kind: 'user' | 'system';
  pending?: boolean;
  tempId?: string;
  failed?: boolean;
  replyTo?: ChatReplyTo;
};

export type ChatJoinRequest = {
  id: number;
  eventId: number;
  userId: number;
  message: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  requester: ConversationParticipant;
  conversationId?: number; // for 1:1 events
};

export type ChatConversationEvent = {
  id: number;
  userId: number;
  title: string;
  location: string;
  time: string;
  dateLabel: string;
  eventDate?: string;
  groupType?: string;
  coverKey?: string;
  scheduledAt?: string;
};

export type ChatConversation = {
  id: number;
  createdBy: number;
  title?: string | null;
  memberIds: number[];
  participants: ConversationParticipant[];
  displayName: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
  eventId: number | null;
  event?: ChatConversationEvent;
};

/** Participant payload as sent by the server (snake_case or camelCase variants). */
export interface RawParticipant {
  id?: number;
  name?: string;
  full_name?: string;
  avatar?: string;
  avatarUrl?: string;
  avatar_url?: string;
}

/** Join request payload as sent over REST or the WebSocket envelope. */
export interface RawJoinRequest {
  id: number;
  eventId?: number;
  event_id?: number;
  userId?: number;
  user_id?: number;
  message?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  requester?: RawParticipant;
  conversationId?: number;
  conversation_id?: number;
}

export type RawConversationLastMessage = {
  id: number;
  sender_id: number;
  body: string;
  kind?: 'user' | 'system';
  created_at: string;
  reply_to?: {
    id: number;
    sender_id: number;
    body: string;
    sender_name: string;
  };
};

export type RawConversationEvent = {
  id: number;
  user_id: number;
  title: string;
  location: string;
  time: string;
  date_label: string;
  event_date?: string;
  group_type?: string;
  cover_key?: string;
  scheduled_at?: string;
};

export type RawConversation = {
  id: number;
  created_by: number;
  title?: string | null;
  member_ids: number[];
  participants?: RawParticipant[];
  last_message?: RawConversationLastMessage;
  unread_count?: number;
  event?: RawConversationEvent;
};

export const normalizeParticipant = (
  raw: RawParticipant | null | undefined,
  fallbackID = 0,
): ConversationParticipant => ({
  id: raw?.id ?? fallbackID,
  name: raw?.name ?? raw?.full_name ?? '',
  avatar: raw?.avatar ?? raw?.avatarUrl ?? raw?.avatar_url ?? undefined,
});

export const normalizeJoinRequest = (raw: RawJoinRequest): ChatJoinRequest => {
  const eventId = raw.eventId ?? raw.event_id ?? 0;
  const userId = raw.userId ?? raw.user_id ?? 0;
  const createdAt = raw.createdAt ?? raw.created_at ?? new Date().toISOString();
  const requester = raw.requester ?? {};
  const conversationId = raw.conversationId ?? raw.conversation_id;
  return {
    id: raw.id,
    eventId,
    userId,
    message: raw.message ?? '',
    status: (raw.status ?? 'pending') as ChatJoinRequest['status'],
    createdAt,
    requester: normalizeParticipant(requester, userId),
    conversationId,
  };
};

export const normalizeConversationEvent = (event: RawConversationEvent): ChatConversationEvent => {
  const schedule = getScheduleDisplay({
    scheduledAt: event.scheduled_at,
    eventDate: event.event_date,
    time: event.time,
    dateLabel: event.date_label,
  });

  return {
    id: event.id,
    userId: event.user_id,
    title: event.title,
    location: event.location,
    time: schedule.displayTime,
    dateLabel: schedule.displayLabel,
    eventDate: schedule.displayDate,
    groupType: event.group_type,
    coverKey: event.cover_key,
    scheduledAt: event.scheduled_at,
  };
};

export const normalizeConversation = (
  conversation: RawConversation,
  currentUserId: number,
): ChatConversation => {
  const participants = (conversation.participants ?? []).map((participant) =>
    normalizeParticipant(participant),
  );
  const counterpart = participants.find((participant) => participant.id !== currentUserId);
  const event = conversation.event ? normalizeConversationEvent(conversation.event) : undefined;
  const hasEvent = !!event;
  const fallbackName = conversation.title ?? participants[0]?.name ?? 'Conversation';
  const displayName = hasEvent
    ? (event?.title ?? fallbackName)
    : (counterpart?.name ?? fallbackName);
  const lastMessage = conversation.last_message
    ? {
        id: String(conversation.last_message.id),
        conversationId: conversation.id,
        senderId: conversation.last_message.sender_id,
        body: conversation.last_message.body,
        kind: (conversation.last_message.kind === 'system' ? 'system' : 'user') as ChatMessage['kind'],
        createdAt: conversation.last_message.created_at,
        replyTo: conversation.last_message.reply_to
          ? {
              id: String(conversation.last_message.reply_to.id),
              senderId: conversation.last_message.reply_to.sender_id,
              body: conversation.last_message.reply_to.body,
              senderName: conversation.last_message.reply_to.sender_name,
            }
          : undefined,
      }
    : undefined;

  return {
    id: conversation.id,
    createdBy: conversation.created_by,
    title: conversation.title ?? null,
    memberIds: conversation.member_ids,
    participants,
    displayName,
    lastMessage,
    unreadCount: conversation.unread_count ?? 0,
    eventId: event?.id ?? null,
    event,
  };
};
