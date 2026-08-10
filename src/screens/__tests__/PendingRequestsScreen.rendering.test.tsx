/**
 * Rendering tests for PendingRequestsScreen
 * Tests header, request list, accept/decline actions, and empty state
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PendingRequestsScreen from '../PendingRequestsScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockRouteParams = {
  conversationId: 1,
  eventId: 1,
  includeApproved: true,
};

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: jest.fn(),
    }),
    useRoute: () => ({
      key: 'test-key',
      name: 'PendingRequests',
      params: mockRouteParams,
    }),
  };
});

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock join requests data
const mockPendingRequests = [
  {
    id: 1,
    eventId: 1,
    userId: 2,
    message: 'I would love to join this coffee meetup!',
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    requester: { id: 2, name: 'Jane Doe' },
  },
  {
    id: 2,
    eventId: 1,
    userId: 3,
    message: 'Sounds fun!',
    status: 'pending' as const,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    requester: { id: 3, name: 'John Smith' },
  },
];

const mockMixedRequests = [
  ...mockPendingRequests,
  {
    id: 3,
    eventId: 1,
    userId: 4,
    message: 'Already approved',
    status: 'approved' as const,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    requester: { id: 4, name: 'Alice Brown' },
  },
];

// Mock ChatContext
const mockApproveJoinRequest = jest.fn().mockResolvedValue(undefined);
const mockDenyJoinRequest = jest.fn().mockResolvedValue(undefined);
const mockRefreshJoinRequests = jest.fn().mockResolvedValue(undefined);

let mockChatValue = {
  joinRequestsByConversation: { 1: mockPendingRequests } as Record<number, typeof mockMixedRequests>,
  refreshJoinRequests: mockRefreshJoinRequests,
  approveJoinRequest: mockApproveJoinRequest,
  denyJoinRequest: mockDenyJoinRequest,
  setActiveConversation: jest.fn(),
  conversations: [],
  activeConversationId: null,
  isConnecting: false,
  error: null,
  refreshConversations: jest.fn(),
  isRefreshingConversations: false,
  messages: [],
  sendMessage: jest.fn(),
  retryMessage: jest.fn(),
  reportMember: jest.fn(),
};

jest.mock('@context/ChatContext', () => ({
  useChat: () => mockChatValue,
  ChatJoinRequest: {},
}));

// Mock components
jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children, edges }: { children: React.ReactNode; edges?: string[] }) => (
    <View testID="screen-container">{children}</View>
  );
});

// Mock Feather icons
jest.mock('@expo/vector-icons', () => ({
  Feather: ({ name, ...props }: { name: string }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={`icon-${name}`} {...props}>
        <Text>{name}</Text>
      </View>
    );
  },
}));

describe('PendingRequestsScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatValue = {
      joinRequestsByConversation: { 1: mockPendingRequests },
      refreshJoinRequests: mockRefreshJoinRequests,
      approveJoinRequest: mockApproveJoinRequest,
      denyJoinRequest: mockDenyJoinRequest,
      setActiveConversation: jest.fn(),
      conversations: [],
      activeConversationId: null,
      isConnecting: false,
      error: null,
      refreshConversations: jest.fn(),
      isRefreshingConversations: false,
      messages: [],
      sendMessage: jest.fn(),
      retryMessage: jest.fn(),
      reportMember: jest.fn(),
    };
  });

  describe('Header', () => {
    it('should render header title', () => {
      const { getByText } = render(<PendingRequestsScreen />);
      expect(getByText('Requests')).toBeTruthy();
    });

    it('should render close button', () => {
      const { getByLabelText } = render(<PendingRequestsScreen />);
      expect(getByLabelText('Close pending requests')).toBeTruthy();
    });

    it('should navigate back when close button is pressed', () => {
      const { getByLabelText } = render(<PendingRequestsScreen />);
      fireEvent.press(getByLabelText('Close pending requests'));
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('Request List', () => {
    it('should render requester names', () => {
      const { getByText } = render(<PendingRequestsScreen />);
      expect(getByText('Jane Doe')).toBeTruthy();
      expect(getByText('John Smith')).toBeTruthy();
    });

    it('should render request messages', () => {
      const { getByText } = render(<PendingRequestsScreen />);
      expect(getByText('I would love to join this coffee meetup!')).toBeTruthy();
      expect(getByText('Sounds fun!')).toBeTruthy();
    });

    it('should render avatar with correct initial', () => {
      const { getAllByText } = render(<PendingRequestsScreen />);
      expect(getAllByText('J').length).toBe(2); // Jane & John
    });

    it('should only show pending requests, not approved', () => {
      mockChatValue.joinRequestsByConversation = { 1: mockMixedRequests };
      const { getByText, queryByText } = render(<PendingRequestsScreen />);

      expect(getByText('Jane Doe')).toBeTruthy();
      expect(getByText('John Smith')).toBeTruthy();
      expect(queryByText('Alice Brown')).toBeNull();
      expect(getByText('Requests')).toBeTruthy();
    });
  });

  describe('Accept Action', () => {
    it('should call approveJoinRequest when accept button is pressed', async () => {
      const { getAllByLabelText } = render(<PendingRequestsScreen />);

      const acceptButtons = getAllByLabelText('Accept request');
      fireEvent.press(acceptButtons[0]);

      await waitFor(() => {
        expect(mockApproveJoinRequest).toHaveBeenCalledWith(1, 1, 2);
      });
    });
  });

  describe('Decline Action', () => {
    it('should call denyJoinRequest when decline button is pressed', async () => {
      const { getAllByLabelText } = render(<PendingRequestsScreen />);

      const declineButtons = getAllByLabelText('Decline request');
      fireEvent.press(declineButtons[0]);

      await waitFor(() => {
        expect(mockDenyJoinRequest).toHaveBeenCalledWith(1, 1, 2);
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no pending requests', () => {
      mockChatValue.joinRequestsByConversation = { 1: [] };
      const { getByText } = render(<PendingRequestsScreen />);
      expect(getByText('No requests')).toBeTruthy();
    });

    it('should show empty state when all requests are approved', () => {
      mockChatValue.joinRequestsByConversation = {
        1: [{
          id: 1,
          eventId: 1,
          userId: 2,
          message: 'Hi',
          status: 'approved' as const,
          createdAt: new Date().toISOString(),
          requester: { id: 2, name: 'Jane Doe' },
        }],
      };
      const { getByText } = render(<PendingRequestsScreen />);
      expect(getByText('No requests')).toBeTruthy();
      expect(getByText('Requests')).toBeTruthy();
    });
  });

  describe('Refresh', () => {
    it('should call refreshJoinRequests on mount', async () => {
      render(<PendingRequestsScreen />);

      await waitFor(() => {
        expect(mockRefreshJoinRequests).toHaveBeenCalledWith(1, 1, {
          includeApproved: true,
        });
      });
    });
  });
});
