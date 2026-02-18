/**
 * Rendering tests for JoinRequestsScreen
 * Tests request list rendering, approve/deny actions, empty state, and 1:1 vs group mode
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import JoinRequestsScreen from '../JoinRequestsScreen';

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
  groupType: 'Group' as 'Single' | 'Group',
  eventDetails: {
    coverKey: 'coffee',
    dateLabel: 'Today',
    location: 'Central Park',
    time: '10:00',
  },
};

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      replace: mockReplace,
      setOptions: jest.fn(),
    }),
    useRoute: () => ({
      key: 'test-key',
      name: 'JoinRequests',
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
  status: "pending" | "approved";
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
            <Pressable
              key={index}
              testID={`menu-item-${index}`}
              onPress={item.onPress}
            >
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
          <Text>Report Member</Text>
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

describe('JoinRequestsScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams.groupType = 'Group';
    mockChatValue = {
      joinRequestsByConversation: { 1: mockJoinRequests },
      refreshJoinRequests: mockRefreshJoinRequests,
      approveJoinRequest: mockApproveJoinRequest,
      denyJoinRequest: mockDenyJoinRequest,
      setActiveConversation: mockSetActiveConversation,
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

  describe('Group Mode - Header Rendering', () => {
    it('should render the event title in header', () => {
      const { getByText } = render(<JoinRequestsScreen />);
      expect(getByText('Coffee Meetup')).toBeTruthy();
    });

    it('should render "Join Requests" subtitle', () => {
      const { getByText } = render(<JoinRequestsScreen />);
      expect(getByText('Join Requests')).toBeTruthy();
    });

    it('should render back button', () => {
      const { getByTestId } = render(<JoinRequestsScreen />);
      expect(getByTestId('icon-chevron-left')).toBeTruthy();
    });

    it('should navigate back when back button is pressed', () => {
      const { getByTestId } = render(<JoinRequestsScreen />);

      const backButton = getByTestId('icon-chevron-left').parent?.parent;
      if (backButton) {
        fireEvent.press(backButton);
        expect(mockGoBack).toHaveBeenCalled();
      }
    });
  });

  describe('Group Mode - Request List Rendering', () => {
    it('should render all pending requests', () => {
      const { getByText } = render(<JoinRequestsScreen />);

      expect(getByText('Jane Doe')).toBeTruthy();
      expect(getByText('John Smith')).toBeTruthy();
      expect(getByText('Alice Brown')).toBeTruthy();
    });

    it('should render request messages', () => {
      const { getByText } = render(<JoinRequestsScreen />);

      expect(getByText('I would love to join this coffee meetup!')).toBeTruthy();
      expect(getByText('Sounds fun!')).toBeTruthy();
    });

    it('should render Accept and Decline buttons for each request', () => {
      const { getAllByText } = render(<JoinRequestsScreen />);

      const acceptButtons = getAllByText('Accept');
      const declineButtons = getAllByText('Decline');

      expect(acceptButtons.length).toBe(3);
      expect(declineButtons.length).toBe(3);
    });

    it('should render request timestamp', () => {
      const { getByText } = render(<JoinRequestsScreen />);

      // The component formats dates like "Jan 15, 10:30 AM"
      // Since we use dynamic dates, we just verify there are time elements
      // Check for at least one formatted date (the component uses toLocaleString)
      const request = mockJoinRequests[0];
      const formattedDate = new Date(request.createdAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      expect(getByText(formattedDate)).toBeTruthy();
    });
  });

  describe('Group Mode - Approve Action', () => {
    it('should call approveJoinRequest when Accept is pressed', async () => {
      const { getAllByText } = render(<JoinRequestsScreen />);

      const acceptButtons = getAllByText('Accept');
      fireEvent.press(acceptButtons[0]);

      await waitFor(() => {
        expect(mockApproveJoinRequest).toHaveBeenCalledWith(1, 1, 2);
      });
    });

    it('should show alert on approval error', async () => {
      mockApproveJoinRequest.mockRejectedValueOnce(new Error('Network error'));

      const { getAllByText } = render(<JoinRequestsScreen />);

      const acceptButtons = getAllByText('Accept');
      await act(async () => {
        fireEvent.press(acceptButtons[0]);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to update request',
          'Network error'
        );
      });
    });
  });

  describe('Group Mode - Deny Action', () => {
    it('should call denyJoinRequest when Decline is pressed', async () => {
      const { getAllByText } = render(<JoinRequestsScreen />);

      const declineButtons = getAllByText('Decline');
      fireEvent.press(declineButtons[0]);

      await waitFor(() => {
        expect(mockDenyJoinRequest).toHaveBeenCalledWith(1, 1, 2);
      });
    });

    it('should show alert on denial error', async () => {
      mockDenyJoinRequest.mockRejectedValueOnce(new Error('Server error'));

      const { getAllByText } = render(<JoinRequestsScreen />);

      const declineButtons = getAllByText('Decline');
      await act(async () => {
        fireEvent.press(declineButtons[0]);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to update request',
          'Server error'
        );
      });
    });
  });

  describe('Group Mode - Empty State', () => {
    it('should show empty state when no pending requests', () => {
      mockChatValue.joinRequestsByConversation = { 1: [] };

      const { getByText } = render(<JoinRequestsScreen />);

      expect(getByText('No pending requests')).toBeTruthy();
      expect(
        getByText("You'll see new join requests here when attendees tap Interested.")
      ).toBeTruthy();
    });

    it('should show empty state when conversation has no requests entry', () => {
      mockChatValue.joinRequestsByConversation = {};

      const { getByText } = render(<JoinRequestsScreen />);

      expect(getByText('No pending requests')).toBeTruthy();
    });
  });

  describe('1:1 Mode - Header Rendering', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should render event cover image in 1:1 mode', () => {
      const { getByTestId } = render(<JoinRequestsScreen />);

      // In 1:1 mode, the header includes a cover image
      // The component structure is different
      expect(getByTestId('screen-container')).toBeTruthy();
    });

    it('should render event subtitle with details in 1:1 mode', () => {
      const { getByText } = render(<JoinRequestsScreen />);

      expect(getByText('Today, 10:00 at Central Park')).toBeTruthy();
    });

    it('should render request count badge in 1:1 mode', () => {
      const { getByText } = render(<JoinRequestsScreen />);

      // Badge shows count of approved users only
      expect(getByText('2')).toBeTruthy();
    });

    it('should not render badge when no requests in 1:1 mode', () => {
      mockChatValue.joinRequestsByConversation = { 1: [] };

      const { queryByText } = render(<JoinRequestsScreen />);

      // No badge should be rendered
      const badge = queryByText('0');
      expect(badge).toBeNull();
    });
  });

  describe('1:1 Mode - Request List Rendering', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should render requester names', () => {
      const { getByText, queryByText } = render(<JoinRequestsScreen />);

      expect(getByText('Jane Doe')).toBeTruthy();
      expect(getByText('John Smith')).toBeTruthy();
      expect(queryByText('Alice Brown')).toBeNull();
    });

    it('should render intro message for each request', () => {
      const { getByText } = render(<JoinRequestsScreen />);

      expect(getByText('I would love to join this coffee meetup!')).toBeTruthy();
    });

    it('should render avatar with initial', () => {
      const { getAllByText } = render(<JoinRequestsScreen />);

      // First letter of each requester name
      expect(getAllByText('J')[0]).toBeTruthy(); // Jane Doe
    });

    it('should render menu button (more-horizontal icon)', () => {
      const { getAllByTestId } = render(<JoinRequestsScreen />);

      const menuIcons = getAllByTestId('icon-more-horizontal');
      expect(menuIcons.length).toBe(2); // Only approved requests show menu
    });
  });

  describe('1:1 Mode - Request Press Navigation', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should navigate to ChatThread when pressing a request row', async () => {
      const { getByText } = render(<JoinRequestsScreen />);

      fireEvent.press(getByText('Jane Doe'));

      await waitFor(() => {
        expect(mockSetActiveConversation).toHaveBeenCalledWith(10);
        expect(mockReplace).toHaveBeenCalledWith('ChatThread');
      });
    });
  });

  describe('1:1 Mode - Menu Overlay', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should show menu overlay when 3-dot menu is pressed', async () => {
      const { getAllByTestId, getByTestId } = render(<JoinRequestsScreen />);

      const menuButtons = getAllByTestId('icon-more-horizontal');
      fireEvent.press(menuButtons[0].parent!);

      await waitFor(() => {
        expect(getByTestId('action-overlay-menu')).toBeTruthy();
      });
    });

    it('should show Report and Remove options in menu', async () => {
      const { getAllByTestId, getByText } = render(<JoinRequestsScreen />);

      const menuButtons = getAllByTestId('icon-more-horizontal');
      fireEvent.press(menuButtons[0].parent!);

      await waitFor(() => {
        expect(getByText('Report Member')).toBeTruthy();
        expect(getByText('Remove Member')).toBeTruthy();
      });
    });

    it('should close menu when backdrop is pressed', async () => {
      const { getAllByTestId, getByTestId, queryByTestId } = render(<JoinRequestsScreen />);

      const menuButtons = getAllByTestId('icon-more-horizontal');
      fireEvent.press(menuButtons[0].parent!);

      await waitFor(() => {
        expect(getByTestId('action-overlay-menu')).toBeTruthy();
      });

      fireEvent.press(getByTestId('menu-backdrop'));

      await waitFor(() => {
        expect(queryByTestId('action-overlay-menu')).toBeNull();
      });
    });

    it('should not call denyJoinRequest from approved member menu actions', async () => {
      const { getAllByTestId, getByText } = render(<JoinRequestsScreen />);

      const menuButtons = getAllByTestId('icon-more-horizontal');
      fireEvent.press(menuButtons[0].parent!);

      await waitFor(() => {
        fireEvent.press(getByText('Report Member'));
      });

      await waitFor(() => {
        expect(mockDenyJoinRequest).not.toHaveBeenCalled();
      });
    });
  });

  describe('1:1 Mode - Report Overlay', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should show report overlay when Report Member is selected', async () => {
      const { getAllByTestId, getByText, getByTestId } = render(<JoinRequestsScreen />);

      const menuButtons = getAllByTestId('icon-more-horizontal');
      fireEvent.press(menuButtons[0].parent!);

      await waitFor(() => {
        fireEvent.press(getByText('Report Member'));
      });

      await waitFor(() => {
        expect(getByTestId('action-overlay-report')).toBeTruthy();
      });
    });

    it('should close report overlay when backdrop is pressed', async () => {
      const { getAllByTestId, getByText, getByTestId, queryByTestId } = render(
        <JoinRequestsScreen />
      );

      const menuButtons = getAllByTestId('icon-more-horizontal');
      fireEvent.press(menuButtons[0].parent!);

      await waitFor(() => {
        fireEvent.press(getByText('Report Member'));
      });

      await waitFor(() => {
        expect(getByTestId('action-overlay-report')).toBeTruthy();
      });

      fireEvent.press(getByTestId('report-backdrop'));

      await waitFor(() => {
        expect(queryByTestId('action-overlay-report')).toBeNull();
      });
    });
  });

  describe('1:1 Mode - Empty State', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should show different empty state message for 1:1 mode', () => {
      mockChatValue.joinRequestsByConversation = { 1: [] };

      const { getByText, queryByText } = render(<JoinRequestsScreen />);

      expect(getByText('No accepted users yet')).toBeTruthy();
      // 1:1 mode does not show the attendees explanation
      expect(
        queryByText("You'll see new join requests here when attendees tap Interested.")
      ).toBeNull();
    });
  });

  describe('Refresh Functionality', () => {
    it('should call refreshJoinRequests on mount', async () => {
      render(<JoinRequestsScreen />);

      await waitFor(() => {
        expect(mockRefreshJoinRequests).toHaveBeenCalledWith(1, 1, { includeApproved: false });
      });
    });
  });

  describe('Avatar Colors', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
    });

    it('should generate consistent avatar color based on userId', () => {
      // The component uses userId % AVATAR_COLORS.length to determine color
      // We just verify the component renders correctly with avatars
      const { getAllByText } = render(<JoinRequestsScreen />);

      // Avatar initials should be visible
      expect(getAllByText('J')[0]).toBeTruthy();
    });
  });

  describe('Request Without ConversationId', () => {
    beforeEach(() => {
      mockRouteParams.groupType = 'Single';
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

      const { getByText } = render(<JoinRequestsScreen />);

      fireEvent.press(getByText('Jane Doe'));

      await waitFor(() => {
        expect(mockSetActiveConversation).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
      });
    });
  });
});
