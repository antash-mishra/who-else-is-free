import React from 'react';

import { Text } from 'react-native';

import { act, render, waitFor } from '@testing-library/react-native';

import { requestJson } from '@api/client';
import { NotificationsProvider, useNotifications } from '@context/NotificationsContext';

jest.mock('@api/client', () => ({
  requestJson: jest.fn(),
}));

const mockUser = { id: 1, email: 'tester@example.com', name: 'Tester' };

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: 'token',
  }),
}));

jest.mock('@services/logger', () => ({
  logger: { warn: jest.fn() },
}));

type ServerListener = (envelope: { type: string; notification?: unknown }) => void;
const serverListeners = new Set<ServerListener>();
const mockSubscribeToServerEvents = jest.fn((listener: ServerListener) => {
  serverListeners.add(listener);
  return () => {
    serverListeners.delete(listener);
  };
});
const emitServerEvent = (envelope: { type: string; notification?: unknown }) => {
  serverListeners.forEach((listener) => listener(envelope));
};

jest.mock('@context/ChatContext', () => ({
  useChat: () => ({
    subscribeToServerEvents: mockSubscribeToServerEvents,
  }),
}));

const ErrorConsumer = () => {
  const { error } = useNotifications();
  return <Text testID="notification-error">{error ?? 'none'}</Text>;
};

const InboxConsumer = ({ onIncoming }: { onIncoming?: (id: number) => void }) => {
  const { notifications, unreadCount, subscribeToIncomingNotifications } = useNotifications();
  React.useEffect(
    () => subscribeToIncomingNotifications((n) => onIncoming?.(n.id)),
    [onIncoming, subscribeToIncomingNotifications],
  );
  return (
    <>
      <Text testID="ids">{notifications.map((n) => n.id).join(',')}</Text>
      <Text testID="unread">{String(unreadCount)}</Text>
    </>
  );
};

const apiRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'join_request.created',
  event_id: 7,
  conversation_id: 10,
  join_request_id: 3,
  title: 'Sunset Hike',
  body: 'Noah wants to join your plan Sunset Hike.',
  payload: '{}',
  read: false,
  action_state: 'active',
  created_at: '2026-09-05T10:00:00.000Z',
  ...overrides,
});

const mockInboxRequests = (rows: unknown[], count: number) => {
  (requestJson as jest.Mock).mockImplementation((path: string) => {
    if (path.startsWith('/api/notifications/unread-count')) {
      return Promise.resolve({ count });
    }
    if (path.startsWith('/api/notifications?')) {
      return Promise.resolve({ notifications: rows });
    }
    return Promise.resolve(undefined);
  });
};

describe('NotificationsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serverListeners.clear();
  });

  it('never exposes raw network error text to the notification screen', async () => {
    (requestJson as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { getByTestId } = render(
      <NotificationsProvider>
        <ErrorConsumer />
      </NotificationsProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('notification-error').props.children).toBe('Failed to load notifications');
    });
  });

  describe('live inbox over the WebSocket', () => {
    it('prepends a notification:new row, bumps the unread count, and notifies observers', async () => {
      mockInboxRequests([apiRow(1)], 1);
      const onIncoming = jest.fn();
      const { getByTestId } = render(
        <NotificationsProvider>
          <InboxConsumer onIncoming={onIncoming} />
        </NotificationsProvider>,
      );
      await waitFor(() => {
        expect(getByTestId('ids').props.children).toBe('1');
      });
      expect(mockSubscribeToServerEvents).toHaveBeenCalled();

      act(() => {
        emitServerEvent({ type: 'notification:new', notification: apiRow(2) });
      });

      expect(getByTestId('ids').props.children).toBe('2,1');
      expect(getByTestId('unread').props.children).toBe('2');
      expect(onIncoming).toHaveBeenCalledWith(2);
    });

    it('ignores duplicates already present in the list', async () => {
      mockInboxRequests([apiRow(1)], 1);
      const onIncoming = jest.fn();
      const { getByTestId } = render(
        <NotificationsProvider>
          <InboxConsumer onIncoming={onIncoming} />
        </NotificationsProvider>,
      );
      await waitFor(() => {
        expect(getByTestId('ids').props.children).toBe('1');
      });

      act(() => {
        emitServerEvent({ type: 'notification:new', notification: apiRow(1) });
      });

      expect(getByTestId('ids').props.children).toBe('1');
      expect(getByTestId('unread').props.children).toBe('1');
      expect(onIncoming).not.toHaveBeenCalled();
    });

    it('does not count read or already-resolved rows as unread', async () => {
      mockInboxRequests([], 0);
      const { getByTestId } = render(
        <NotificationsProvider>
          <InboxConsumer />
        </NotificationsProvider>,
      );
      await waitFor(() => {
        expect(mockSubscribeToServerEvents).toHaveBeenCalled();
      });

      act(() => {
        emitServerEvent({ type: 'notification:new', notification: apiRow(5, { read: true }) });
        emitServerEvent({
          type: 'notification:new',
          notification: apiRow(6, { action_state: 'resolved' }),
        });
      });

      expect(getByTestId('ids').props.children).toBe('6,5');
      expect(getByTestId('unread').props.children).toBe('0');
    });

    it('re-syncs the unread count when the socket (re)opens', async () => {
      mockInboxRequests([], 0);
      render(
        <NotificationsProvider>
          <InboxConsumer />
        </NotificationsProvider>,
      );
      await waitFor(() => {
        expect(mockSubscribeToServerEvents).toHaveBeenCalled();
      });
      const countCallsBefore = (requestJson as jest.Mock).mock.calls.filter(([path]) =>
        String(path).startsWith('/api/notifications/unread-count'),
      ).length;

      act(() => {
        emitServerEvent({ type: 'socket:open' });
      });

      await waitFor(() => {
        const countCalls = (requestJson as jest.Mock).mock.calls.filter(([path]) =>
          String(path).startsWith('/api/notifications/unread-count'),
        ).length;
        expect(countCalls).toBe(countCallsBefore + 1);
      });
    });
  });
});
