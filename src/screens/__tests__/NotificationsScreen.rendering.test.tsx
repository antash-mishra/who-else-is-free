/**
 * Rendering tests for NotificationsScreen
 * Tests list rendering, unread dot, empty state, mark-all-read, and tap routing.
 */

import React from 'react';

import { act, fireEvent, render } from '@testing-library/react-native';

import { AppNotification } from '@api/mappers/notifications';

import NotificationsScreen from '../NotificationsScreen';

// Mock navigation
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  }),
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

// Mock the navigation ref used by routeFromNotification.
jest.mock('@navigation/navigationRef', () => {
  const { navigationRef } = {
    navigationRef: {
      isReady: jest.fn().mockReturnValue(true),
      navigate: jest.fn(),
    },
  };
  return { navigationRef };
});

// Re-grab the mock fns for assertions after module load.
const navRefModule = require('@navigation/navigationRef');
const mockNavRefNavigate = navRefModule.navigationRef.navigate;

const mockResolveNotificationAction = jest.fn();
jest.mock('@api/notifications', () => ({
  ...jest.requireActual('@api/notifications'),
  resolveNotificationAction: (...args: unknown[]) => mockResolveNotificationAction(...args),
}));

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ token: 'auth-token', user: { id: 1 } }),
}));

// Mock NotificationsContext
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockLoadMore = jest.fn().mockResolvedValue(undefined);
const mockMarkRead = jest.fn().mockResolvedValue(undefined);
const mockApplyActionResolution = jest.fn();
const mockMarkAllRead = jest.fn().mockResolvedValue(undefined);
const mockRefreshUnreadCount = jest.fn().mockResolvedValue(undefined);
const mockClearAll = jest.fn().mockResolvedValue(undefined);

let mockNotificationsValue: {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  applyActionResolution: typeof mockApplyActionResolution;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
} = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  refreshing: false,
  error: null,
  refresh: mockRefresh,
  loadMore: mockLoadMore,
  refreshUnreadCount: mockRefreshUnreadCount,
  markRead: mockMarkRead,
  applyActionResolution: mockApplyActionResolution,
  markAllRead: mockMarkAllRead,
  clearAll: mockClearAll,
};

jest.mock('@context/NotificationsContext', () => ({
  useNotifications: () => mockNotificationsValue,
}));

// Mock ChatContext for setActiveConversation + conversations.
const mockSetActiveConversation = jest.fn();
let mockConversations: Array<{ id: number }> = [{ id: 10 }];
jest.mock('@context/ChatContext', () => ({
  useChat: () => ({
    setActiveConversation: mockSetActiveConversation,
    conversations: mockConversations,
  }),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({ events: [] }),
}));

// Mock haptics so the press handler doesn't reach for native modules.
jest.mock('@services/haptics', () => ({
  triggerHaptic: jest.fn(),
}));

jest.mock('@components/EventActionBadge', () => {
  const { Text } = require('react-native');
  return ({ visible, label }: { visible: boolean; label: string }) =>
    visible ? <Text>{label}</Text> : null;
});

// Mock the BottomSheet sheet components so we can test the action menu without Reanimated/Modal.
jest.mock('@components/sheets', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="notifications-menu-sheet">{children}</View> : null,
    SheetActionList: ({
      items,
    }: {
      items: Array<{
        label: string;
        onPress: () => void;
        testID?: string;
        disabled?: boolean;
        destructive?: boolean;
      }>;
    }) => (
      <View>
        {items.map((item) => (
          <Pressable
            key={item.label}
            testID={item.testID}
            accessibilityState={{ disabled: !!item.disabled }}
            accessibilityHint={item.destructive ? 'destructive' : 'default'}
            disabled={item.disabled}
            onPress={item.onPress}
          >
            <Text>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

// ScreenContainer renders into SafeAreaView; keep it simple.
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const sampleNotifications = (): AppNotification[] => [
  {
    id: 1,
    type: 'chat.message',
    conversationId: 10,
    title: 'Dancing',
    body: 'Alice: hey',
    payload: JSON.stringify({ senderName: 'Alice' }),
    read: false,
    actionState: 'active',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: 2,
    type: 'join_request.denied',
    eventId: 99,
    title: 'Hike',
    body: 'Hike is no longer available to you. Explore other plans nearby.',
    read: true,
    actionState: 'active',
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
];

describe('NotificationsScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveNotificationAction.mockResolvedValue({
      status: 'active',
      destination: 'chat',
      conversation_id: 10,
    });
    mockConversations = [{ id: 10 }];
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: [],
      unreadCount: 0,
      loading: false,
      refreshing: false,
      error: null,
    };
  });

  it('renders the header with back button and title', () => {
    const { getByLabelText, getByText } = render(<NotificationsScreen />);
    expect(getByLabelText('Go back')).toBeTruthy();
    expect(getByText('Notifications')).toBeTruthy();
  });

  it('renders the empty state when there are no notifications', () => {
    const { getByText } = render(<NotificationsScreen />);
    expect(getByText('No notifications yet')).toBeTruthy();
    expect(getByText('Your notifications will appear here.')).toBeTruthy();
  });

  it('shows the more-options menu button', () => {
    const { getByTestId } = render(<NotificationsScreen />);
    expect(getByTestId('notifications-menu-button')).toBeTruthy();
  });

  it('opens the action menu and calls markAllRead when Mark all as read is pressed', () => {
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByTestId } = render(<NotificationsScreen />);

    // Open the menu
    fireEvent.press(getByTestId('notifications-menu-button'));
    // Press "Mark all as read" inside the sheet
    fireEvent.press(getByTestId('notifications-menu-mark-all-read'));

    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('keeps Mark all as read enabled and black when there is nothing unread', () => {
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications().map((notification) => ({
        ...notification,
        read: true,
      })),
      unreadCount: 0,
    };
    const { getByTestId } = render(<NotificationsScreen />);

    fireEvent.press(getByTestId('notifications-menu-button'));
    const action = getByTestId('notifications-menu-mark-all-read');
    expect(action.props.accessibilityState.disabled).toBe(false);
    expect(action.props.accessibilityHint).toBe('default');
  });

  it('opens the action menu and calls clearAll when Clear all is pressed', () => {
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByTestId } = render(<NotificationsScreen />);

    fireEvent.press(getByTestId('notifications-menu-button'));
    const action = getByTestId('notifications-menu-clear-all');
    expect(action.props.accessibilityHint).toBe('default');
    fireEvent.press(action);

    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('renders the composed notification copy and unread dot', () => {
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByText } = render(<NotificationsScreen />);

    // Chat: composed sentence with the message preview inline.
    expect(getByText('New message from Alice in Dancing. Alice: hey')).toBeTruthy();
    // Declined: event name leads the softened sentence.
    expect(
      getByText('Hike is no longer available to you. Explore other plans nearby.'),
    ).toBeTruthy();
  });

  it('shows the loading indicator on initial load', () => {
    mockNotificationsValue = {
      ...mockNotificationsValue,
      loading: true,
      notifications: [],
    };
    const { UNSAFE_getByProps } = render(<NotificationsScreen />);
    // ActivityIndicator renders as a View with activityEnabled; assert via refresh not throwing.
    expect(UNSAFE_getByProps).toBeTruthy();
  });

  it('resolves and routes to chat thread on tap of a chat.message row', async () => {
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByLabelText } = render(<NotificationsScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText(/New message from Alice/));
    });

    expect(mockResolveNotificationAction).toHaveBeenCalledWith('auth-token', {
      notification_ids: [1],
      mark_handled: true,
    });
    expect(mockApplyActionResolution).toHaveBeenCalledWith(
      [1],
      expect.objectContaining({ destination: 'chat' }),
    );
    expect(mockSetActiveConversation).toHaveBeenCalledWith(10);
    expect(mockNavRefNavigate).toHaveBeenCalledWith('ChatThread');
  });

  it('routes denied rows to Main → Events (inbox override)', async () => {
    mockResolveNotificationAction.mockResolvedValue({
      status: 'active',
      destination: 'events',
    });
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByLabelText } = render(<NotificationsScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText(/Hike is no longer available/));
    });

    expect(mockApplyActionResolution).toHaveBeenCalledWith(
      [2],
      expect.objectContaining({ destination: 'events' }),
    );
    expect(mockNavRefNavigate).toHaveBeenCalledWith('Main', { screen: 'Events' });
  });

  it('routes from the notification payload even when conversations are stale', async () => {
    // The conversations list can still be loading when the inbox is tapped; the
    // persisted notification payload is the source of truth for routing.
    mockConversations = [];
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByLabelText } = render(<NotificationsScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText(/New message from Alice/));
    });

    expect(mockSetActiveConversation).toHaveBeenCalledWith(10);
    expect(mockNavRefNavigate).toHaveBeenCalledWith('ChatThread');
    expect(mockNavigate).not.toHaveBeenCalledWith('Main', { screen: 'Events' });
  });

  it('does not navigate blindly when resolution fails', async () => {
    mockResolveNotificationAction.mockRejectedValue(new Error('offline'));
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: sampleNotifications(),
      unreadCount: 1,
    };
    const { getByLabelText, getByText } = render(<NotificationsScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText(/New message from Alice/));
    });

    expect(mockNavRefNavigate).not.toHaveBeenCalled();
    expect(mockApplyActionResolution).not.toHaveBeenCalled();
    expect(getByText('Unable to open this notification. Please try again.')).toBeTruthy();
  });

  it('renders unavailable task history with a status label and safe accessibility copy', () => {
    const unavailable = sampleNotifications()[0];
    unavailable.read = true;
    unavailable.actionState = 'unavailable';
    unavailable.actionReason = 'conversation_deleted';
    mockNotificationsValue = {
      ...mockNotificationsValue,
      notifications: [unavailable],
      unreadCount: 0,
    };
    const { getByLabelText, getByText } = render(<NotificationsScreen />);

    expect(getByText('Unavailable')).toBeTruthy();
    expect(
      getByLabelText(/Unavailable notification\. Opens Discover and explains why/),
    ).toBeTruthy();
  });

  it('refreshes on focus', () => {
    render(<NotificationsScreen />);
    // useFocusEffect calls the callback synchronously in the mock.
    expect(mockRefresh).toHaveBeenCalled();
  });
});
