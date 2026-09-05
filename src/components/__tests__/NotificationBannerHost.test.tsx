import React from 'react';

import { act, fireEvent, render } from '@testing-library/react-native';

import { AppNotification } from '@api/mappers/notifications';
import NotificationBannerHost, { shouldSuppressBanner } from '@components/NotificationBannerHost';

type IncomingListener = (notification: AppNotification) => void;
const incomingListeners = new Set<IncomingListener>();
const mockSubscribeToIncomingNotifications = jest.fn((listener: IncomingListener) => {
  incomingListeners.add(listener);
  return () => {
    incomingListeners.delete(listener);
  };
});
const emitIncoming = (notification: AppNotification) => {
  incomingListeners.forEach((listener) => listener(notification));
};

let mockActiveConversationId: number | null = null;
const mockOpenNotificationIDs = jest.fn().mockResolvedValue(undefined);
const mockIsReady = jest.fn(() => true);
const mockGetCurrentRoute = jest.fn(() => ({ name: 'Discover' }));

jest.mock('@context/NotificationsContext', () => ({
  useNotifications: () => ({
    subscribeToIncomingNotifications: mockSubscribeToIncomingNotifications,
  }),
}));

jest.mock('@context/ChatContext', () => ({
  useChat: () => ({ activeConversationId: mockActiveConversationId, conversations: [] }),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({ events: [{ id: '7', imageUri: 'https://cdn.example/cover.png' }] }),
}));

jest.mock('@hooks/useOpenNotifications', () => ({
  useOpenNotifications: () => ({ openNotificationIDs: mockOpenNotificationIDs }),
}));

jest.mock('@navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => mockIsReady(),
    getCurrentRoute: () => mockGetCurrentRoute(),
  },
}));

const baseNotification: AppNotification = {
  id: 1,
  type: 'join_request.created',
  eventId: 7,
  conversationId: 10,
  title: 'Sunset Hike',
  body: 'Noah Smith wants to join your plan Sunset Hike.',
  payload: JSON.stringify({ senderName: 'Noah Smith' }),
  read: false,
  actionState: 'active',
  createdAt: new Date().toISOString(),
};

describe('shouldSuppressBanner', () => {
  const ready = { navigatorReady: true, currentRouteName: 'Discover', activeConversationId: null };

  it('shows active unread notifications on ordinary screens', () => {
    expect(shouldSuppressBanner(baseNotification, ready)).toBe(false);
  });

  it('suppresses while the navigator is not ready', () => {
    expect(shouldSuppressBanner(baseNotification, { ...ready, navigatorReady: false })).toBe(true);
  });

  it('suppresses rows that are already read or no longer actionable', () => {
    expect(shouldSuppressBanner({ ...baseNotification, read: true }, ready)).toBe(true);
    expect(shouldSuppressBanner({ ...baseNotification, actionState: 'resolved' }, ready)).toBe(
      true,
    );
  });

  it('suppresses on the Notifications inbox route', () => {
    expect(
      shouldSuppressBanner(baseNotification, { ...ready, currentRouteName: 'Notifications' }),
    ).toBe(true);
  });

  it('suppresses chat messages for the conversation currently on screen only', () => {
    const chat: AppNotification = { ...baseNotification, type: 'chat.message', conversationId: 10 };
    expect(shouldSuppressBanner(chat, { ...ready, activeConversationId: 10 })).toBe(true);
    expect(shouldSuppressBanner(chat, { ...ready, activeConversationId: 11 })).toBe(false);
    // Non-chat notifications ignore the active conversation.
    expect(shouldSuppressBanner(baseNotification, { ...ready, activeConversationId: 10 })).toBe(
      false,
    );
  });
});

describe('NotificationBannerHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    incomingListeners.clear();
    mockActiveConversationId = null;
    mockIsReady.mockReturnValue(true);
    mockGetCurrentRoute.mockReturnValue({ name: 'Discover' });
  });

  it('shows a banner for an incoming notification and opens it on tap', async () => {
    const { getByTestId, queryByTestId } = render(<NotificationBannerHost />);
    expect(queryByTestId('notification-banner')).toBeNull();

    act(() => {
      emitIncoming(baseNotification);
    });
    expect(getByTestId('notification-banner')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('notification-banner'));
    });
    expect(mockOpenNotificationIDs).toHaveBeenCalledWith([1]);
    expect(queryByTestId('notification-banner')).toBeNull();
  });

  it('does not show a banner while the inbox route is on screen', () => {
    mockGetCurrentRoute.mockReturnValue({ name: 'Notifications' });
    const { queryByTestId } = render(<NotificationBannerHost />);
    act(() => {
      emitIncoming(baseNotification);
    });
    expect(queryByTestId('notification-banner')).toBeNull();
  });

  it('does not show a banner for the active chat conversation', () => {
    mockActiveConversationId = 10;
    const { queryByTestId } = render(<NotificationBannerHost />);
    act(() => {
      emitIncoming({ ...baseNotification, type: 'chat.message', body: 'Noah: hi' });
    });
    expect(queryByTestId('notification-banner')).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<NotificationBannerHost />);
    expect(incomingListeners.size).toBe(1);
    unmount();
    expect(incomingListeners.size).toBe(0);
  });
});
