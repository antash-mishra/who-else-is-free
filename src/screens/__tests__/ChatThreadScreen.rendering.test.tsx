/**
 * Rendering tests for ChatThreadScreen
 * Tests message display, send functionality, retry mechanism, loading states, and WebSocket status
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';

import ChatThreadScreen from '../ChatThreadScreen';
import {
  render,
  createMockUseAuth,
  createMockUseChat,
  createMockUseEvents,
} from '../../__tests__/utils/testUtils';
import {
  mockUsers,
  mockConversations,
  mockMessages,
  mockPendingMessage,
  mockFailedMessage,
  mockEvents,
} from '../../__tests__/mocks/mockData';
import { mockNavigation } from '../../__tests__/mocks/mockModules';

// Mock the context hooks
jest.mock('@context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@context/ChatContext', () => ({
  useChat: jest.fn(),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: jest.fn(),
}));

// Mock components
jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => <View testID="screen-container">{children}</View>;
});

// Import mocked modules
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseChat = useChat as jest.Mock;
const mockedUseEvents = useEvents as jest.Mock;

describe('ChatThreadScreen Rendering', () => {
  const mockSendMessage = jest.fn();
  const mockRetryMessage = jest.fn();
  const mockSetActiveConversation = jest.fn();
  const mockRefreshJoinRequests = jest.fn().mockResolvedValue(undefined);

  const setupMocks = (overrides: {
    authOverrides?: object;
    chatOverrides?: object;
    eventsOverrides?: object;
  } = {}) => {
    mockedUseAuth.mockReturnValue(
      createMockUseAuth({ user: mockUsers[0], ...overrides.authOverrides })()
    );
    mockedUseChat.mockReturnValue(
      createMockUseChat({
        activeConversationId: 1,
        conversations: mockConversations,
        messages: mockMessages,
        sendMessage: mockSendMessage,
        retryMessage: mockRetryMessage,
        setActiveConversation: mockSetActiveConversation,
        refreshJoinRequests: mockRefreshJoinRequests,
        isConnecting: false,
        error: null,
        joinRequestsByConversation: {},
        ...overrides.chatOverrides,
      })()
    );
    mockedUseEvents.mockReturnValue(
      createMockUseEvents({ events: mockEvents, ...overrides.eventsOverrides })()
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigation.canGoBack.mockReturnValue(true);
  });

  describe('Message List Rendering', () => {
    it('should render messages in a FlatList', () => {
      setupMocks();
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('Hello everyone!')).toBeTruthy();
      expect(getByText('Hi there! Looking forward to the meetup.')).toBeTruthy();
      expect(getByText('See you soon!')).toBeTruthy();
    });

    it('should display conversation title in header', () => {
      setupMocks();
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('Coffee Meetup Chat')).toBeTruthy();
    });

    it('should render own messages with appropriate styling', () => {
      setupMocks();
      const { getByText } = render(<ChatThreadScreen />);

      // Messages from current user (id: 1)
      const ownMessage = getByText('Hello everyone!');
      expect(ownMessage).toBeTruthy();
    });

    it('should render other user messages', () => {
      setupMocks();
      const { getByText } = render(<ChatThreadScreen />);

      // Message from user id: 2
      const otherMessage = getByText('Hi there! Looking forward to the meetup.');
      expect(otherMessage).toBeTruthy();
    });

    it('should render system messages for join notifications', () => {
      const systemMessage = {
        id: 'sys-1',
        conversationId: 1,
        senderId: 0,
        body: 'John joined the chat',
        createdAt: new Date().toISOString(),
      };
      setupMocks({
        chatOverrides: { messages: [systemMessage] },
      });
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('John joined the chat')).toBeTruthy();
    });
  });

  describe('Send Message Input', () => {
    it('should render message input field', () => {
      setupMocks();
      const { getByPlaceholderText } = render(<ChatThreadScreen />);

      expect(getByPlaceholderText('Message Coffee Meetup Chat')).toBeTruthy();
    });

    it('should render send button', () => {
      setupMocks();
      const { getByLabelText } = render(<ChatThreadScreen />);

      expect(getByLabelText('Send message')).toBeTruthy();
    });

    it('should update input value on text change', () => {
      setupMocks();
      const { getByPlaceholderText } = render(<ChatThreadScreen />);

      const input = getByPlaceholderText('Message Coffee Meetup Chat');
      fireEvent.changeText(input, 'Test message');

      expect(input.props.value).toBe('Test message');
    });

    it('should call sendMessage when send button is pressed with text', () => {
      setupMocks();
      const { getByPlaceholderText, getByLabelText } = render(<ChatThreadScreen />);

      const input = getByPlaceholderText('Message Coffee Meetup Chat');
      fireEvent.changeText(input, 'Hello!');

      const sendButton = getByLabelText('Send message');
      fireEvent.press(sendButton);

      expect(mockSendMessage).toHaveBeenCalledWith(1, 'Hello!');
    });

    it('should not send empty messages', () => {
      setupMocks();
      const { getByLabelText } = render(<ChatThreadScreen />);

      const sendButton = getByLabelText('Send message');
      fireEvent.press(sendButton);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should clear input after sending message', () => {
      setupMocks();
      const { getByPlaceholderText, getByLabelText } = render(<ChatThreadScreen />);

      const input = getByPlaceholderText('Message Coffee Meetup Chat');
      fireEvent.changeText(input, 'Hello!');

      const sendButton = getByLabelText('Send message');
      fireEvent.press(sendButton);

      expect(input.props.value).toBe('');
    });
  });

  describe('Message Retry on Failed Messages', () => {
    it('should display "Failed. Tap to retry." for failed messages', () => {
      setupMocks({
        chatOverrides: { messages: [mockFailedMessage] },
      });
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('Failed. Tap to retry.')).toBeTruthy();
    });

    it('should call retryMessage when tapping on failed message', () => {
      setupMocks({
        chatOverrides: { messages: [mockFailedMessage] },
      });
      const { getByText } = render(<ChatThreadScreen />);

      const failedMessageText = getByText('Failed to send');
      fireEvent.press(failedMessageText);

      expect(mockRetryMessage).toHaveBeenCalledWith(1, mockFailedMessage);
    });

    it('should display "Sending…" for pending messages', () => {
      setupMocks({
        chatOverrides: { messages: [mockPendingMessage] },
      });
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('Sending…')).toBeTruthy();
    });
  });

  describe('Loading and Connection States', () => {
    it('should display "Connecting…" when isConnecting is true', () => {
      setupMocks({
        chatOverrides: { isConnecting: true },
      });
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('Connecting…')).toBeTruthy();
    });

    it('should display error message when error exists', () => {
      setupMocks({
        chatOverrides: { error: 'Connection failed' },
      });
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('Connection failed')).toBeTruthy();
    });

    it('should not show connecting indicator when connected', () => {
      setupMocks({
        chatOverrides: { isConnecting: false },
      });
      const { queryByText } = render(<ChatThreadScreen />);

      expect(queryByText('Connecting…')).toBeNull();
    });
  });

  describe('Empty Conversation State', () => {
    it('should render with no messages', () => {
      setupMocks({
        chatOverrides: { messages: [] },
      });
      const { getByPlaceholderText } = render(<ChatThreadScreen />);

      // Should still show input field
      expect(getByPlaceholderText('Message Coffee Meetup Chat')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should navigate back when back button is pressed', () => {
      setupMocks();
      const { getByTestId } = render(<ChatThreadScreen />);
      fireEvent.press(getByTestId('chat-back-button'));

      expect(mockSetActiveConversation).toHaveBeenCalledWith(null);
    });

    it('should return null when no active conversation', () => {
      setupMocks({
        chatOverrides: { activeConversationId: null },
      });
      const { queryByTestId } = render(<ChatThreadScreen />);

      // Component should return null when no active conversation
      expect(queryByTestId('screen-container')).toBeNull();
    });
  });

  describe('Join Request Badge', () => {
    it('should display join request badge for host with pending requests', () => {
      setupMocks({
        chatOverrides: {
          activeConversationId: 1,
          joinRequestsByConversation: {
            1: [{ id: 1, eventId: 1, userId: 3, message: 'Hi', status: 'pending', createdAt: '', requester: { id: 3, name: 'User' } }],
          },
        },
      });
      const { getByText } = render(<ChatThreadScreen />);

      expect(getByText('1')).toBeTruthy();
    });

    it('should not display join request badge when user is not host', () => {
      setupMocks({
        authOverrides: { user: mockUsers[1] }, // User id: 2, not the host
        chatOverrides: {
          activeConversationId: 1,
          joinRequestsByConversation: {
            1: [{ id: 1, eventId: 1, userId: 3, message: 'Hi', status: 'pending', createdAt: '', requester: { id: 3, name: 'User' } }],
          },
        },
      });
      const { queryByLabelText } = render(<ChatThreadScreen />);

      expect(queryByLabelText('View join requests')).toBeNull();
    });
  });

  describe('Platform Keyboard Behavior', () => {
    const originalPlatform = Platform.OS;

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    });

    it('should register Android keyboard listeners for composer offset handling', () => {
      setupMocks();
      Object.defineProperty(Platform, 'OS', { value: 'android' });

      const addListenerSpy = jest.spyOn(Keyboard, 'addListener').mockReturnValue({
        remove: jest.fn(),
      } as never);
      render(<ChatThreadScreen />);

      expect(addListenerSpy).toHaveBeenCalledWith(
        'keyboardDidShow',
        expect.any(Function)
      );
      expect(addListenerSpy).toHaveBeenCalledWith(
        'keyboardDidHide',
        expect.any(Function)
      );

      addListenerSpy.mockRestore();
    });

    it('should still render composer on iOS', () => {
      setupMocks();
      Object.defineProperty(Platform, 'OS', { value: 'ios' });

      const { getByPlaceholderText, getByLabelText } = render(<ChatThreadScreen />);

      expect(getByPlaceholderText('Message Coffee Meetup Chat')).toBeTruthy();
      expect(getByLabelText('Send message')).toBeTruthy();
    });

    it('should render composer on Android', () => {
      setupMocks();
      Object.defineProperty(Platform, 'OS', { value: 'android' });

      const { getByPlaceholderText, getByLabelText } = render(<ChatThreadScreen />);

      expect(getByPlaceholderText('Message Coffee Meetup Chat')).toBeTruthy();
      expect(getByLabelText('Send message')).toBeTruthy();
    });
  });
});
