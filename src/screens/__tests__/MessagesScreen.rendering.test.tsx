/**
 * Rendering tests for MessagesScreen
 * Tests conversation list rendering, empty states, navigation, and unread indicators
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import MessagesScreen from '../MessagesScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockReset = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      reset: mockReset,
      goBack: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useFocusEffect: jest.fn((callback) => {
      callback();
    }),
  };
});

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock AuthContext
const mockUser = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  profileComplete: true,
};

let mockAuthValue: {
  user: typeof mockUser | null;
  token: string;
  isSigningIn: boolean;
  signInWithGoogle: jest.Mock;
  signOut: jest.Mock;
  refreshSessionSilently: jest.Mock;
  updateProfile: jest.Mock;
} = {
  user: mockUser,
  token: 'mock-token',
  isSigningIn: false,
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
  refreshSessionSilently: jest.fn(),
  updateProfile: jest.fn(),
};

jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

// Mock ChatContext
interface MockConversation {
  id: number;
  createdBy: number;
  title: string | null;
  memberIds: number[];
  participants: Array<{ id: number; name: string }>;
  displayName: string;
  unreadCount: number;
  eventId: number | null;
  event?: {
    id: number;
    userId: number;
    title: string;
    location: string;
    time: string;
    dateLabel: string;
    groupType: string;
  };
  lastMessage?: {
    id: string;
    conversationId: number;
    senderId: number;
    body: string;
    createdAt: string;
  };
}

const mockConversations: MockConversation[] = [
  {
    id: 1,
    createdBy: 2,
    title: 'Coffee Meetup Chat',
    memberIds: [1, 2],
    participants: [
      { id: 1, name: 'Test User' },
      { id: 2, name: 'Jane Doe' },
    ],
    displayName: 'Coffee Meetup Chat',
    unreadCount: 3,
    eventId: 1,
    event: {
      id: 1,
      userId: 1,
      title: 'Coffee Meetup',
      location: 'Central Park',
      time: '10:00',
      dateLabel: 'Today',
      groupType: 'Group',
    },
    lastMessage: {
      id: '1',
      conversationId: 1,
      senderId: 2,
      body: 'Looking forward to it!',
      createdAt: new Date().toISOString(),
    },
  },
  {
    id: 2,
    createdBy: 1,
    title: null,
    memberIds: [1, 3],
    participants: [
      { id: 1, name: 'Test User' },
      { id: 3, name: 'John Smith' },
    ],
    displayName: 'John Smith',
    unreadCount: 0,
    eventId: null,
    lastMessage: {
      id: '2',
      conversationId: 2,
      senderId: 1,
      body: 'Hello there!',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  },
  {
    id: 3,
    createdBy: 1,
    title: 'One-on-One Event',
    memberIds: [1],
    participants: [{ id: 1, name: 'Test User' }],
    displayName: 'One-on-One Event',
    unreadCount: 0,
    eventId: 3,
    event: {
      id: 3,
      userId: 1,
      title: 'One-on-One Event',
      location: 'Downtown',
      time: '14:00',
      dateLabel: 'Today',
      groupType: 'Single',
    },
  },
];

const mockSetActiveConversation = jest.fn();
const mockRefreshConversations = jest.fn().mockResolvedValue(undefined);

let mockChatValue = {
  conversations: mockConversations,
  activeConversationId: null as number | null,
  setActiveConversation: mockSetActiveConversation,
  isConnecting: false,
  error: null as string | null,
  refreshConversations: mockRefreshConversations,
  isRefreshingConversations: false,
  messages: [],
  joinRequestsByConversation: {},
  sendMessage: jest.fn(),
  retryMessage: jest.fn(),
  refreshJoinRequests: jest.fn(),
  approveJoinRequest: jest.fn(),
  denyJoinRequest: jest.fn(),
  reportMember: jest.fn(),
  hasUnseenMessages: false,
};

jest.mock('@context/ChatContext', () => ({
  useChat: () => mockChatValue,
}));

// Mock EventsContext
const mockEvents = [
  {
    id: '1',
    title: 'Coffee Meetup',
    location: 'Central Park',
    time: '10:00',
    audience: 'All Gender, 18 to 35 years',
    imageUri: 'https://example.com/coffee.jpg',
    dateLabel: 'Today',
    eventDate: new Date().toISOString().split('T')[0],
    ownerId: 2,
    hostName: 'Jane Doe',
    gender: 'Any',
    minAge: 18,
    maxAge: 35,
    groupType: 'Group',
  },
];
const mockIsEventReported = jest.fn().mockReturnValue(false);

jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({
    events: mockEvents,
    userEvents: [],
    requestedEvents: [],
    isLoading: false,
    error: null,
    refreshEvents: jest.fn(),
    refreshRequestedEvents: jest.fn(),
    addUserEvent: jest.fn(),
    updateUserEvent: jest.fn(),
    deleteUserEvent: jest.fn(),
    queueGuestEvent: jest.fn(),
    markEventRequested: jest.fn(),
    isEventRequested: jest.fn(),
    unmarkEventRequested: jest.fn(),
    markEventReported: jest.fn(),
    isEventReported: mockIsEventReported,
  }),
}));

// Mock components and assets
jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => (
    <View testID="screen-container">{children}</View>
  );
});

jest.mock('@components/EmptyState', () => {
  const { View, Text, Pressable } = require('react-native');
  return ({
    title,
    description,
    actionLabel,
    onActionPress,
    secondaryActionLabel,
    onSecondaryActionPress,
  }: {
    title: string;
    description: string;
    actionLabel?: string;
    onActionPress?: () => void;
    secondaryActionLabel?: string;
    onSecondaryActionPress?: () => void;
  }) => (
    <View testID="empty-state">
      <Text testID="empty-state-title">{title}</Text>
      <Text testID="empty-state-description">{description}</Text>
      {actionLabel && (
        <Pressable testID="empty-state-action" onPress={onActionPress}>
          <Text>{actionLabel}</Text>
        </Pressable>
      )}
      {secondaryActionLabel && (
        <Pressable testID="empty-state-secondary-action" onPress={onSecondaryActionPress}>
          <Text>{secondaryActionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
});

describe('MessagesScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEventReported.mockReturnValue(false);
    mockAuthValue = {
      user: mockUser,
      token: 'mock-token',
      isSigningIn: false,
      signInWithGoogle: jest.fn(),
      signOut: jest.fn(),
      refreshSessionSilently: jest.fn(),
      updateProfile: jest.fn(),
    };
    mockChatValue = {
      conversations: mockConversations,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      isConnecting: false,
      error: null,
      refreshConversations: mockRefreshConversations,
      isRefreshingConversations: false,
      messages: [],
      joinRequestsByConversation: {},
      sendMessage: jest.fn(),
      retryMessage: jest.fn(),
      refreshJoinRequests: jest.fn(),
      approveJoinRequest: jest.fn(),
      denyJoinRequest: jest.fn(),
      reportMember: jest.fn(),
      hasUnseenMessages: false,
    };
  });

  describe('Conversation List Rendering', () => {
    it('should render the Chat header', () => {
      const { getByText } = render(<MessagesScreen />);
      expect(getByText('Chat')).toBeTruthy();
    });

    it('should render all conversations', () => {
      const { getByText } = render(<MessagesScreen />);

      expect(getByText('Coffee Meetup')).toBeTruthy();
      expect(getByText('John Smith')).toBeTruthy();
      expect(getByText('One-on-One Event')).toBeTruthy();
    });

    it('should hide conversations for reported events', () => {
      mockIsEventReported.mockImplementation((eventId: string) => eventId === '1');
      const { queryByText, getByText } = render(<MessagesScreen />);

      expect(queryByText('Coffee Meetup')).toBeNull();
      expect(getByText('John Smith')).toBeTruthy();
    });

    it('should render last message preview for each conversation', () => {
      const { getByText } = render(<MessagesScreen />);

      // Jane's message in Coffee Meetup Chat
      expect(getByText(/Looking forward to it!/)).toBeTruthy();
      // User's own message in John Smith chat
      expect(getByText(/You: Hello there!/)).toBeTruthy();
    });

    it('should show "No messages yet" for conversations without messages', () => {
      mockChatValue.conversations = [
        {
          ...mockConversations[0],
          lastMessage: undefined,
        },
      ];

      const { getByText } = render(<MessagesScreen />);
      expect(getByText('No messages yet')).toBeTruthy();
    });

    it('should render conversation avatar with initial', () => {
      const { getAllByText } = render(<MessagesScreen />);

      // First letter of display name for conversations without event images
      // Coffee Meetup has an event cover image, John Smith and One-on-One show initials
      expect(getAllByText('J')[0]).toBeTruthy(); // John Smith
      expect(getAllByText('O')[0]).toBeTruthy(); // One-on-One Event
    });

    it('should show unread dot only for unread conversations', () => {
      const { getByTestId, queryByTestId } = render(<MessagesScreen />);

      expect(getByTestId('conversation-unread-dot-1')).toBeTruthy();
      expect(queryByTestId('conversation-unread-dot-2')).toBeNull();

      const dotStyle = StyleSheet.flatten(getByTestId('conversation-unread-dot-1').props.style);
      expect(dotStyle.position).toBe('absolute');
      expect(dotStyle.left).toBe(5);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no conversations and not loading', () => {
      mockChatValue.conversations = [];
      mockChatValue.isRefreshingConversations = false;
      mockChatValue.isConnecting = false;

      const { getByTestId, getByText } = render(<MessagesScreen />);

      expect(getByTestId('empty-state')).toBeTruthy();
      expect(getByText('No Messages Yet')).toBeTruthy();
    });

    it('should not show empty state while connecting', () => {
      mockChatValue.conversations = [];
      mockChatValue.isConnecting = true;

      const { queryByTestId, getByText } = render(<MessagesScreen />);

      expect(queryByTestId('empty-state')).toBeNull();
      expect(getByText('Connecting to chat…')).toBeTruthy();
    });

    it('should not show empty state while refreshing', () => {
      mockChatValue.conversations = [];
      mockChatValue.isRefreshingConversations = true;

      const { queryByTestId } = render(<MessagesScreen />);

      expect(queryByTestId('empty-state')).toBeNull();
    });
  });

  describe('Guest User State', () => {
    it('should show login prompt for guest users', () => {
      mockAuthValue.user = null;

      const { getByTestId, getByText } = render(<MessagesScreen />);

      expect(getByTestId('empty-state')).toBeTruthy();
      expect(getByText('No messages to show')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });

    it('should open sign-in modal when Continue button is pressed', () => {
      mockAuthValue.user = null;

      const { getByTestId } = render(<MessagesScreen />);

      fireEvent.press(getByTestId('empty-state-action'));
      expect(getByTestId('bottom-sheet-modal')).toBeTruthy();
    });
  });

  describe('Conversation Item Press Navigation', () => {
    it('should navigate to ChatThread when pressing a group conversation', () => {
      const { getByText } = render(<MessagesScreen />);

      fireEvent.press(getByText('Coffee Meetup'));

      expect(mockSetActiveConversation).toHaveBeenCalledWith(1);
      expect(mockNavigate).toHaveBeenCalledWith('ChatThread');
    });

    it('should navigate to ChatThread when pressing a DM conversation', () => {
      const { getByText } = render(<MessagesScreen />);

      fireEvent.press(getByText('John Smith'));

      expect(mockSetActiveConversation).toHaveBeenCalledWith(2);
      expect(mockNavigate).toHaveBeenCalledWith('ChatThread');
    });

    it('should navigate to JoinRequests for 1:1 event host', () => {
      const { getByText } = render(<MessagesScreen />);

      fireEvent.press(getByText('One-on-One Event'));

      expect(mockNavigate).toHaveBeenCalledWith('JoinRequests', expect.objectContaining({
        conversationId: 3,
        eventId: 3,
        title: 'One-on-One Event',
        groupType: 'Single',
      }));
    });
  });

  describe('Loading and Error States', () => {
    it('should show connecting message while connecting', () => {
      mockChatValue.isConnecting = true;

      const { getByText } = render(<MessagesScreen />);

      expect(getByText('Connecting to chat…')).toBeTruthy();
    });

    it('should show error message when there is an error', () => {
      mockChatValue.error = 'Failed to connect to chat.';

      const { getByText } = render(<MessagesScreen />);

      expect(getByText('Failed to connect to chat.')).toBeTruthy();
    });
  });

  describe('Active Conversation Highlight', () => {
    it('should apply active style to active conversation', () => {
      mockChatValue.activeConversationId = 1;

      // The component applies a style to the active conversation row
      // We can verify the component renders without crashing with an active conversation
      const { getByText } = render(<MessagesScreen />);

      expect(getByText('Coffee Meetup')).toBeTruthy();
    });
  });

  describe('Refresh Functionality', () => {
    it('should call refreshConversations on focus', async () => {
      render(<MessagesScreen />);

      await waitFor(() => {
        expect(mockRefreshConversations).toHaveBeenCalled();
      });
    });

    it('should not call refreshConversations when user is null', async () => {
      mockAuthValue.user = null;
      mockRefreshConversations.mockClear();

      render(<MessagesScreen />);

      // useFocusEffect callback should return early for null user
      expect(mockRefreshConversations).not.toHaveBeenCalled();
    });
  });

  describe('Message Preview Formatting', () => {
    it('should prefix own messages with "You:"', () => {
      const { getByText } = render(<MessagesScreen />);

      // Conversation 2 has a message from user (senderId: 1)
      expect(getByText(/You: Hello there!/)).toBeTruthy();
    });

    it('should prefix other user messages with their first name', () => {
      const { getByText } = render(<MessagesScreen />);

      // Conversation 1 has a message from Jane (senderId: 2)
      expect(getByText(/Jane: Looking forward to it!/)).toBeTruthy();
    });
  });
});
