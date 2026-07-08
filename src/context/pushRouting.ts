import type { RootStackParamList } from '@navigation/types';

import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

export type PushData = {
  type?: string;
  conversationId?: string;
  eventId?: string;
  title?: string;
  body?: string;
  senderName?: string;
  senderId?: string;
};

type PushNavigator = Pick<
  NavigationContainerRefWithCurrent<RootStackParamList>,
  'isReady' | 'navigate'
>;

export const handleNotificationTap = (
  data: PushData,
  setActiveConversation: (id: number | null) => void,
  navigator: PushNavigator,
) => {
  if (!navigator.isReady()) {
    return;
  }

  const normalizedType = (data.type ?? '').trim().toLowerCase();

  switch (normalizedType) {
    case 'chat.message': {
      const conversationId = data.conversationId ? Number(data.conversationId) : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        navigator.navigate('ChatThread');
      }
      break;
    }
    case 'join_request.created': {
      const conversationId = data.conversationId ? Number(data.conversationId) : undefined;
      const eventId = data.eventId ? Number(data.eventId) : undefined;
      const title = data.title ?? '';
      if (conversationId && eventId) {
        navigator.navigate('JoinRequests', {
          conversationId,
          eventId,
          title,
        });
      } else if (eventId) {
        navigator.navigate('EventDetails', {
          eventId: String(eventId),
          origin: 'MyEvents',
        });
      }
      break;
    }
    case 'join_request.approved': {
      const conversationId = data.conversationId ? Number(data.conversationId) : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        navigator.navigate('ChatThread');
      }
      break;
    }
    case 'join_request.denied': {
      navigator.navigate('Main', {
        screen: 'Messages',
      });
      break;
    }
    case 'event.deleted':
    case 'event_deleted':
    case 'event.member_removed':
    case 'event.member.removed': {
      navigator.navigate('Main', {
        screen: 'Events',
      });
      break;
    }
  }
};

/**
 * Inbox-only navigation helper used by NotificationsScreen rows. Mirrors
 * `handleNotificationTap` for the verbatim cases but lands the three override
 * types (and `join_request.denied`) on `Main → Events` (event discovery).
 *
 * Per notification-inbox-plan.md Confirmed Decisions #5 + #8: this is a
 * SEPARATE code path from the OS push tap. `handleNotificationTap` above
 * stays exactly as today (incl. `join_request.denied → Messages`) so existing
 * push recipients see byte-for-byte identical tap behavior.
 */
export const routeFromNotification = (
  data: PushData,
  setActiveConversation: (id: number | null) => void,
  navigator: PushNavigator,
) => {
  if (!navigator.isReady()) {
    return;
  }

  const normalizedType = (data.type ?? '').trim().toLowerCase();

  switch (normalizedType) {
    case 'chat.message': {
      const conversationId = data.conversationId ? Number(data.conversationId) : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        navigator.navigate('ChatThread');
      }
      break;
    }
    case 'join_request.created': {
      const conversationId = data.conversationId ? Number(data.conversationId) : undefined;
      const eventId = data.eventId ? Number(data.eventId) : undefined;
      const title = data.title ?? '';
      if (conversationId && eventId) {
        navigator.navigate('JoinRequests', {
          conversationId,
          eventId,
          title,
        });
      } else if (eventId) {
        navigator.navigate('EventDetails', {
          eventId: String(eventId),
          origin: 'MyEvents',
        });
      }
      break;
    }
    case 'join_request.approved': {
      const conversationId = data.conversationId ? Number(data.conversationId) : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        navigator.navigate('ChatThread');
      }
      break;
    }
    // Override rows land on event discovery (Confirmed Decision #5). Mirrors
    // push-tap routing for member_removed/event.deleted; `join_request.denied`
    // is the one deliberate divergence from `handleNotificationTap`.
    case 'join_request.denied':
    case 'event.deleted':
    case 'event_deleted':
    case 'event.member_removed':
    case 'event.member.removed': {
      navigator.navigate('Main', {
        screen: 'Events',
      });
      break;
    }
  }
};
