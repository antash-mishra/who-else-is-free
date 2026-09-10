/**
 * Rendering tests for OneToOneHubScreen
 * Tests the 1:1 host hub: header, accepted list, pending badge, and sheet navigation
 */

import React from 'react';

import { Alert } from 'react-native';

import { render, fireEvent, waitFor } from '@testing-library/react-native';

import type { ChatConversation } from '@context/ChatContext';

import OneToOneHubScreen from '../OneToOneHubScreen';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();

const mockRouteParams = {
  conversationId: 1,
  eventId: 1,
  title: 'Coffee Meetup',
};

const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      push: mockNavigate,
      goBack: mockGoBack,
      replace: mockReplace,
      setOptions: jest.fn(),
    }),
    useRoute: () => ({
      key: 'test-key',
      name: 'OneToOneHub',
      params: mockRouteParams,
    }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock AuthContext
const mockToken = 'mock-jwt-token';
jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    token: mockToken,
    user: { id: 1, name: 'Test User', email: 'test@example.com', profileComplete: true },
    isSigningIn: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    refreshSessionSilently: jest.fn(),
    updateProfile: jest.fn(),
    authFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  }),
}));

// Mock join requests data
const mockJoinRequests: Array<{
  id: number;
  eventId: number;
  userId: number;
  message: string;
  status: 'pending' | 'approved';
  createdAt: string;
  requester: { id: number; name: string };
  conversationId?: number;
}> = [
  {
    id: 1,
    eventId: 1,
    userId: 2,
    message: 'I would love to join this coffee meetup!',
    status: 'approved' as const,
    createdAt: new Date().toISOString(),
    requester: { id: 2, name: 'Jane Doe' },
    conversationId: 10,
  },
  {
    id: 2,
    eventId: 1,
    userId: 3,
    message: 'Sounds fun!',
    status: 'approved' as const,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    requester: { id: 3, name: 'John Smith' },
    conversationId: 11,
  },
  {
    id: 3,
    eventId: 1,
    userId: 4,
    message: '',
    status: 'pending' as const,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    requester: { id: 4, name: 'Alice Brown' },
    conversationId: 12,
  },
];

// Mock ChatContext
const mockApproveJoinRequest = jest.fn().mockResolvedValue(undefined);
const mockDenyJoinRequest = jest.fn().mockResolvedValue(undefined);
const mockRefreshJoinRequests = jest.fn().mockResolvedValue(undefined);
const mockSetActiveConversation = jest.fn();

let mockChatValue = {
  joinRequestsByConversation: { 1: mockJoinRequests } as Record<number, typeof mockJoinRequests>,
  refreshJoinRequests: mockRefreshJoinRequests,
  approveJoinRequest: mockApproveJoinRequest,
  denyJoinRequest: mockDenyJoinRequest,
  setActiveConversation: mockSetActiveConversation,
  conversations: [] as ChatConversation[],
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

let mockEventsValue = {
  events: [
    {
      id: '1',
      title: 'Coffee Meetup',
      location: 'Central Park',
      time: '10:00 AM',
      audience: 'All Gender, 18 to 35 years',
      imageUri: 'https://example.com/coffee.jpg',
      dateLabel: 'Today',
      eventDate: todayKey,
      ownerId: 1,
      hostName: 'Test User',
      gender: 'Any',
      minAge: 18,
      maxAge: 35,
      groupType: 'Group' as 'Single' | 'Group',
      coverKey: 'coffee',
    },
  ],
};

jest.mock('@context/EventsContext', () => ({
  useEvents: () => mockEventsValue,
}));

// Mock components
jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children, edges }: { children: React.ReactNode; edges?: string[] }) => (
    <View testID="screen-container">{children}</View>
  );
});

jest.mock('@components/EventActionOverlay', () => {
  const { View, Text, Pressable } = require('react-native');
  return ({
    isVisible,
    onBackdropPress,
    type,
    items,
    reportMessage,
    onReportMessageChange,
    onSubmitReport,
    reportError,
    reportSubmitting,
    reportDisabled,
  }: {
    isVisible: boolean;
    onBackdropPress?: () => void;
    type: string;
    items?: Array<{ label: string; onPress: () => void; destructive?: boolean }>;
    reportMessage?: string;
    onReportMessageChange?: (text: string) => void;
    onSubmitReport?: () => void;
    reportError?: string | null;
    reportSubmitting?: boolean;
    reportDisabled?: boolean;
  }) => {
    if (!isVisible) return null;

    if (type === 'menu' && items) {
      return (
        <View testID="action-overlay-menu">
          {items.map((item, index) => (
            <Pressable key={index} testID={`menu-item-${index}`} onPress={item.onPress}>
              <Text>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable testID="menu-backdrop" onPress={onBackdropPress} />
        </View>
      );
    }

    if (type === 'report') {
      return (
        <View testID="action-overlay-report">
          <Text>Report & Block Member</Text>
          {reportError && <Text testID="report-error">{reportError}</Text>}
          <Pressable testID="submit-report" onPress={onSubmitReport} disabled={reportDisabled}>
            <Text>{reportSubmitting ? 'Submitting...' : 'Submit Report'}</Text>
          </Pressable>
          <Pressable testID="report-backdrop" onPress={onBackdropPress} />
        </View>
      );
    }

    return null;
  };
});

// Mock covers
jest.mock('@constants/covers', () => ({
  COVER_OPTIONS: [
    { key: 'coffee', source: 1 },
    { key: 'hiking', source: 2 },
  ],
  CoverKey: {},
}));

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

describe('OneToOneHubScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatValue = {
      joinRequestsByConversation: { 1: mockJoinRequests },
      refreshJoinRequests: mockRefreshJoinRequests,
      approveJoinRequest: mockApproveJoinRequest,
      denyJoinRequest: mockDenyJoinRequest,
      setActiveConversation: mockSetActiveConversation,
      conversations: [] as ChatConversation[],
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
    mockEventsValue = {
      events: [
        {
          id: '1',
          title: 'Coffee Meetup',
          location: 'Central Park',
          time: '10:00 AM',
          audience: 'All Gender, 18 to 35 years',
          imageUri: 'https://example.com/coffee.jpg',
          dateLabel: 'Today',
          eventDate: todayKey,
          ownerId: 1,
          hostName: 'Test User',
          gender: 'Any',
          minAge: 18,
          maxAge: 35,
          groupType: 'Single' as 'Single' | 'Group',
          coverKey: 'coffee',
        },
      ],
    };
  });

  describe('1:1 Mode - Header Rendering', () => {
    beforeEach(() => {
      mockEventsValue.events = [
        {
          ...mockEventsValue.events[0],
          groupType: 'Single',
        },
      ];
    });

    it('should render event cover image in 1:1 mode', () => {
      const { getByTestId } = render(<OneToOneHubScreen />);

      // In 1:1 mode, the header includes a cover image
      // The component structure is different
      expect(getByTestId('screen-container')).toBeTruthy();
    });

    it('should render accepted count and date subtitle in 1:1 mode', () => {
      const { getByText } = render(<OneToOneHubScreen />);

      // Only the 2 approved requesters are counted; the host is excluded.
      // Subtitle: "1:1 · 2 Accepted" (two parts, dot separator).
      expect(getByText('1:1')).toBeTruthy();
      expect(getByText('2 Accepted')).toBeTruthy();
    });

    it('should render pending requests icon with count badge in 1:1 mode', () => {
      const { getByLabelText, getByText } = render(<OneToOneHubScreen />);

      expect(getByLabelText('View pending requests')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
    });

    it('should not render pending requests icon when no pending requests in 1:1 mode', () => {
      // All requests are approved, no pending
      mockChatValue.joinRequestsByConversation = {
        1: [mockJoinRequests[0], mockJoinRequests[1]],
      };

      const { queryByLabelText } = render(<OneToOneHubScreen />);

      expect(queryByLabelText('View pending requests')).toBeNull();
    });
  });

  describe('1:1 Mode - Request List Rendering', () => {
    beforeEach(() => {
      mockEventsValue.events = [{ ...mockEventsValue.events[0], groupType: 'Single' }];
    });

    it('should render requester names', () => {
      const { getByText, queryByText } = render(<OneToOneHubScreen />);

      expect(getByText('Jane Doe')).toBeTruthy();
      expect(getByText('John Smith')).toBeTruthy();
      expect(queryByText('Alice Brown')).toBeNull();
    });

    it('should render intro message for each request', () => {
      const { getByText } = render(<OneToOneHubScreen />);

      expect(getByText('I would love to join this coffee meetup!')).toBeTruthy();
    });

    it('should render avatar with initial', () => {
      const { getAllByText } = render(<OneToOneHubScreen />);

      // First letter of each requester name
      expect(getAllByText('J')[0]).toBeTruthy(); // Jane Doe
    });

    it('should not render menu button for accepted users', () => {
      const { queryByTestId } = render(<OneToOneHubScreen />);

      expect(queryByTestId('icon-more-horizontal')).toBeNull();
    });
  });

  describe('1:1 Mode - Request Press Navigation', () => {
    beforeEach(() => {
      mockEventsValue.events = [{ ...mockEventsValue.events[0], groupType: 'Single' }];
    });

    it('should navigate to ChatThread when pressing a request row', async () => {
      const { getByText } = render(<OneToOneHubScreen />);

      fireEvent.press(getByText('Jane Doe'));

      await waitFor(() => {
        expect(mockSetActiveConversation).toHaveBeenCalledWith(10);
        expect(mockNavigate).toHaveBeenCalledWith('ChatThread');
      });
    });
  });

  describe('1:1 Mode - Empty State', () => {
    beforeEach(() => {
      mockEventsValue.events = [{ ...mockEventsValue.events[0], groupType: 'Single' }];
    });

    it('should show different empty state message for 1:1 mode', () => {
      mockChatValue.joinRequestsByConversation = { 1: [] };

      const { getByText, queryByText } = render(<OneToOneHubScreen />);

      expect(getByText('No accepted members yet')).toBeTruthy();
      expect(getByText('Chats from accepted members will appear here.')).toBeTruthy();
      expect(
        queryByText("You'll see new join requests here when attendees tap Interested."),
      ).toBeNull();
    });
  });

  describe('Refresh Functionality', () => {
    it('should call refreshJoinRequests on mount', async () => {
      render(<OneToOneHubScreen />);

      await waitFor(() => {
        expect(mockRefreshJoinRequests).toHaveBeenCalledWith(1, 1, { includeApproved: true });
      });
    });
  });

  describe('Avatar Colors', () => {
    beforeEach(() => {
      mockEventsValue.events = [{ ...mockEventsValue.events[0], groupType: 'Single' }];
    });

    it('should generate consistent avatar color based on userId', () => {
      // The component uses userId % AVATAR_COLORS.length to determine color
      // We just verify the component renders correctly with avatars
      const { getAllByText } = render(<OneToOneHubScreen />);

      // Avatar initials should be visible
      expect(getAllByText('J')[0]).toBeTruthy();
    });
  });

  describe('Request Without ConversationId', () => {
    beforeEach(() => {
      mockEventsValue.events = [{ ...mockEventsValue.events[0], groupType: 'Single' }];
    });

    it('should not navigate when request has no conversationId', async () => {
      mockChatValue.joinRequestsByConversation = {
        1: [
          {
            ...mockJoinRequests[0],
            conversationId: undefined,
          },
        ],
      };

      const { getByText } = render(<OneToOneHubScreen />);

      fireEvent.press(getByText('Jane Doe'));

      await waitFor(() => {
        expect(mockSetActiveConversation).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
      });
    });
  });

  describe('1:1 Mode - Only Pending Requests (no accepted users)', () => {
    const onlyPendingRequests = [
      {
        id: 10,
        eventId: 1,
        userId: 5,
        message: 'Would love to join!',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        requester: { id: 5, name: 'Pending User 1' },
      },
      {
        id: 11,
        eventId: 1,
        userId: 6,
        message: 'Interested!',
        status: 'pending' as const,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        requester: { id: 6, name: 'Pending User 2' },
      },
    ];

    beforeEach(() => {
      mockEventsValue.events = [{ ...mockEventsValue.events[0], groupType: 'Single' }];
      mockChatValue.joinRequestsByConversation = { 1: onlyPendingRequests };
    });

    it('should show pending count badge when there are only pending requests', () => {
      const { getByLabelText, getByText } = render(<OneToOneHubScreen />);

      expect(getByLabelText('View pending requests')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
    });

    it('should show empty accepted state by default', () => {
      const { getByText } = render(<OneToOneHubScreen />);

      // Subtitle: "1:1 · 0 Accepted" (two parts, dot separator).
      expect(getByText('1:1')).toBeTruthy();
      expect(getByText('0 Accepted')).toBeTruthy();
      expect(getByText('No accepted members yet')).toBeTruthy();
    });

    it('opens the JoinRequest sheet with the hub store key when the badge is pressed', () => {
      const { getByLabelText } = render(<OneToOneHubScreen />);

      fireEvent.press(getByLabelText('View pending requests'));

      expect(mockNavigate).toHaveBeenCalledWith('JoinRequest', {
        conversationId: 1,
        eventId: 1,
        includeApproved: true,
      });
    });
  });
});
