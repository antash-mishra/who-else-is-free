/**
 * EventDetailsScreen Rendering Tests
 * Comprehensive tests using @testing-library/react-native
 * Tests event display, host/guest/member views, join/leave/report flows
 */

import React from 'react';
import { act, render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';

import {
  mockEvents,
  mockUsers,
  mockConversations,
  mockJoinRequests,
} from '../../__tests__/mocks/mockData';

// Mock user for different test scenarios
const mockUser = mockUsers[0]; // Ava Test, id: 1
const mockOtherUser = mockUsers[1]; // Liam Test, id: 2
const mockGuestUser = null;

// Mock event data
const mockGroupEvent = mockEvents[0]; // Coffee Meetup, ownerId: 1 (Ava), Group
const mockSingleEvent = mockEvents[1]; // Hiking Adventure, ownerId: 2 (Liam), Single
const mockOwnedEvent = { ...mockGroupEvent, ownerId: mockUser.id };
const mockNonOwnedEvent = { ...mockGroupEvent, ownerId: 999, hostName: 'Other Host' };

const formatEventDetailDateLabel = (eventDate: string) => {
  const [year, month, day] = eventDate.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  const dd = `${parsed.getDate()}`.padStart(2, '0');
  const monthLabel = parsed.toLocaleString('en-US', { month: 'short' });
  const weekday = parsed.toLocaleString('en-US', { weekday: 'short' });
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  const normalizedLocale = locale.replace(/_/g, '-');
  const localeParts = normalizedLocale.split('-').slice(1);
  const isUSLocale = localeParts.some((part) => part.toUpperCase() === 'US');
  if (isUSLocale) {
    return `${weekday} ${dd} ${monthLabel}`;
  }
  return `${dd} ${monthLabel} ${weekday}`;
};

// Mock conversation for the event
const mockEventConversation = {
  ...mockConversations[0],
  eventId: Number(mockGroupEvent.id),
  memberIds: [1, 2],
};

// Create pending request state
const mockPendingJoinRequest = {
  ...mockJoinRequests[0],
  eventId: Number(mockGroupEvent.id),
  status: 'pending' as const,
};

// Mock navigation
const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockGoBack = jest.fn();
const mockReset = jest.fn();
let mockNavigationListeners: Record<string, (() => void) | undefined> = {};
const mockNavigation = {
  navigate: mockNavigate,
  push: mockPush,
  goBack: mockGoBack,
  reset: mockReset,
  setOptions: jest.fn(),
  addListener: jest.fn((eventName: string, listener: () => void) => {
    mockNavigationListeners[eventName] = listener;
    return jest.fn(() => {
      if (mockNavigationListeners[eventName] === listener) {
        delete mockNavigationListeners[eventName];
      }
    });
  }),
  removeListener: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  getParent: jest.fn(() => null),
  getState: jest.fn(() => ({ routes: [], index: 0 })),
  dispatch: jest.fn(),
  setParams: jest.fn(),
};

// Mock route with event ID
const createMockRoute = (
  eventId: string,
  origin?: string,
  showEventUpdatedBadge?: boolean,
  routeName: 'EventDetails' | 'EventDetailsOverlay' = 'EventDetails',
  readOnly?: boolean,
) => ({
  key: `${routeName}-test`,
  name: routeName,
  params: { eventId, origin, showEventUpdatedBadge, readOnly },
});

// Default mock values for contexts
let mockAuthState: {
  user: typeof mockUser | null;
  token: string | null;
  signOut: jest.Mock;
  isSigningIn: boolean;
  signInWithGoogle: jest.Mock;
  refreshSessionSilently: jest.Mock;
  updateProfile: jest.Mock;
  authFetch: jest.Mock;
} = {
  user: mockUser,
  token: 'test-token',
  signOut: jest.fn(),
  isSigningIn: false,
  signInWithGoogle: jest.fn(),
  refreshSessionSilently: jest.fn(),
  updateProfile: jest.fn(),
  authFetch: jest.fn((...args: Parameters<typeof fetch>) => fetch(...args)),
};

let mockEventsState = {
  events: mockEvents,
  deleteUserEvent: jest.fn(),
  markEventRequested: jest.fn(),
  markEventReported: jest.fn(),
  isEventRequested: jest.fn(() => false),
  unmarkEventRequested: jest.fn(),
  refreshEvents: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  isLoading: false,
  error: null,
  guestDraft: null,
  saveGuestDraft: jest.fn(),
  clearGuestDraft: jest.fn(),
};

let mockChatState = {
  conversations: [mockEventConversation],
  activeConversationId: null,
  isConnecting: false,
  error: null,
  messages: [],
  joinRequestsByConversation: {},
  setActiveConversation: jest.fn(),
  refreshConversations: jest.fn(),
  sendMessage: jest.fn(),
  retryMessage: jest.fn(),
  refreshJoinRequests: jest.fn(),
  approveJoinRequest: jest.fn(),
  denyJoinRequest: jest.fn(),
  reportMember: jest.fn(),
  isRefreshingConversations: false,
};

// Mock contexts at the top level
jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@context/EventsContext', () => ({
  ...jest.requireActual('@context/EventsContext'),
  useEvents: () => mockEventsState,
}));

jest.mock('@context/ChatContext', () => ({
  useChat: () => mockChatState,
}));

// Mock react-navigation hooks
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNavigation,
    useRoute: () => createMockRoute('1'),
    useFocusEffect: jest.fn((callback) => {
      callback();
    }),
    useIsFocused: jest.fn(() => true),
  };
});

// Mock EventActionOverlay component
jest.mock('@components/EventActionOverlay', () => {
  const React = require('react');
  const { View, Text, Pressable, TextInput } = require('react-native');

  return function MockEventActionOverlay(props: any) {
    if (!props.isVisible) return null;

    switch (props.type) {
      case 'invite':
        return (
          <View testID="invite-overlay">
            <Text>Invite Overlay</Text>
            <TextInput
              testID="invite-message-input"
              value={props.inviteMessage}
              onChangeText={props.onInviteMessageChange}
              placeholder="Write a message..."
            />
            {props.inviteError && <Text testID="invite-error">{props.inviteError}</Text>}
            <Pressable testID="send-invite-button" onPress={props.onSendInvite}>
              <Text>Send Request</Text>
            </Pressable>
          </View>
        );

      case 'menu':
        return (
          <View testID="menu-overlay">
            {props.items?.map((item: any, index: number) => (
              <Pressable
                key={index}
                testID={`menu-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                onPress={item.onPress}
                disabled={item.disabled || item.loading}
              >
                <Text>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        );

      case 'confirm':
        return (
          <View testID="confirm-overlay">
            <Text testID="confirm-title">{props.title}</Text>
            <Text testID="confirm-description">{props.description}</Text>
            {props.errorMessage && <Text testID="confirm-error">{props.errorMessage}</Text>}
            <Pressable testID="confirm-button" onPress={props.onConfirm}>
              <Text>{props.confirmLabel}</Text>
            </Pressable>
            <Pressable testID="cancel-button" onPress={props.onCancel}>
              <Text>{props.cancelLabel}</Text>
            </Pressable>
          </View>
        );

      case 'result':
        return (
          <View testID="result-overlay">
            <Text testID="result-title">{props.title}</Text>
            <Text testID="result-description">{props.description}</Text>
            <Pressable testID="dismiss-button" onPress={props.onDismiss}>
              <Text>{props.dismissLabel}</Text>
            </Pressable>
          </View>
        );

      case 'report':
        return (
          <View testID="report-overlay">
            <Text>Report Overlay</Text>
            <TextInput
              testID="report-message-input"
              value={props.reportMessage}
              onChangeText={props.onReportMessageChange}
              placeholder="Tell us why..."
            />
            {props.reportError && <Text testID="report-error">{props.reportError}</Text>}
            <Pressable testID="submit-report-button" onPress={props.onSubmitReport}>
              <Text>Submit report</Text>
            </Pressable>
          </View>
        );

      case 'viewIntro':
        return (
          <View testID="view-intro-overlay">
            <Text testID="intro-message">{props.introMessage}</Text>
            <Pressable testID="dismiss-intro-button" onPress={props.onDismiss}>
              <Text>Close</Text>
            </Pressable>
          </View>
        );

      case 'pendingRequest':
        return (
          <View testID="pending-request-overlay">
            <Pressable testID="cancel-request-button" onPress={props.onCancelRequest}>
              <Text>Cancel request</Text>
            </Pressable>
            <Pressable testID="report-event-button" onPress={props.onReportEvent}>
              <Text>Report plan</Text>
            </Pressable>
          </View>
        );

      default:
        return <View testID="unknown-overlay" />;
    }
  };
});

jest.mock('@components/EventActionBadge', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  return function MockEventActionBadge(props: any) {
    if (!props.visible) return null;
    return (
      <View testID="event-action-badge">
        <Text>{props.label}</Text>
      </View>
    );
  };
});

// Import screen after mocks are set up
import EventDetailsScreen from '../EventDetailsScreen';

const BASE_URL = 'http://localhost:8080';

describe('EventDetailsScreen Rendering Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.resetMocks();
    mockNavigationListeners = {};

    // Reset to default states
    mockAuthState = {
      user: mockUser,
      token: 'test-token',
      signOut: jest.fn(),
      isSigningIn: false,
      signInWithGoogle: jest.fn(),
      refreshSessionSilently: jest.fn(),
      updateProfile: jest.fn(),
      authFetch: jest.fn((...args: Parameters<typeof fetch>) => fetch(...args)),
    };

    mockEventsState = {
      events: mockEvents,
      deleteUserEvent: jest.fn().mockResolvedValue(undefined),
      markEventRequested: jest.fn(),
      markEventReported: jest.fn(),
      isEventRequested: jest.fn(() => false),
      unmarkEventRequested: jest.fn(),
      refreshEvents: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      isLoading: false,
      error: null,
      guestDraft: null,
      saveGuestDraft: jest.fn(),
      clearGuestDraft: jest.fn(),
    };

    mockChatState = {
      conversations: [mockEventConversation],
      activeConversationId: null,
      isConnecting: false,
      error: null,
      messages: [],
      joinRequestsByConversation: {},
      setActiveConversation: jest.fn(),
      refreshConversations: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn(),
      retryMessage: jest.fn(),
      refreshJoinRequests: jest.fn().mockResolvedValue(undefined),
      approveJoinRequest: jest.fn().mockResolvedValue(undefined),
      denyJoinRequest: jest.fn().mockResolvedValue(undefined),
      reportMember: jest.fn().mockResolvedValue(undefined),
      isRefreshingConversations: false,
    };
  });

  describe('Event Display - Basic Rendering', () => {
    it('renders event title correctly', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText(mockGroupEvent.title)).toBeTruthy();
    });

    it('renders event location correctly', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText(mockGroupEvent.location)).toBeTruthy();
    });

    it('renders event time with date label', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const scheduleLine = `${formatEventDetailDateLabel(mockGroupEvent.eventDate)} · ${mockGroupEvent.time}`;
      expect(getByText(scheduleLine)).toBeTruthy();
    });

    it('renders display-ready event times without converting them again', () => {
      mockEventsState.events = [{ ...mockGroupEvent, time: '7:30 PM' }];

      const { getByText } = render(<EventDetailsScreen />);

      expect(
        getByText(`${formatEventDetailDateLabel(mockGroupEvent.eventDate)} · 7:30 PM`),
      ).toBeTruthy();
    });

    it('renders event description when provided', () => {
      const { getAllByText } = render(<EventDetailsScreen />);

      expect(getAllByText(mockGroupEvent.description!).length).toBeGreaterThan(0);
    });

    it('renders audience information correctly for group event', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const audienceLine = 'Group · All genders · 18 to 35 years';
      expect(getByText(audienceLine)).toBeTruthy();
    });

    it('renders audience information correctly for 1:1 event', () => {
      // Update events to use single event
      mockEventsState.events = [mockSingleEvent];

      // Update route to point to single event
      const routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(createMockRoute('2'));

      const { getByText } = render(<EventDetailsScreen />);

      const audienceLine = '1:1 · All genders · 21 to 40 years';
      expect(getByText(audienceLine)).toBeTruthy();

      // Restore the spy to avoid polluting other tests
      routeSpy.mockRestore();
    });

    it('renders "Details" section heading', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Plan details')).toBeTruthy();
    });
  });

  describe('Host View', () => {
    beforeEach(() => {
      // Set up as host (owner)
      mockEventsState.events = [mockOwnedEvent];
    });

    it('displays "Hosted by you" for event owner', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Hosted by you')).toBeTruthy();
    });

    it('shows "Go to chat" CTA button for host', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Go to chat')).toBeTruthy();
    });

    it('shows going row for host', () => {
      const { getByTestId } = render(<EventDetailsScreen />);

      expect(getByTestId('going-row')).toBeTruthy();
    });

    it('shows "Plan details updated" badge after a short delay when route param is set', () => {
      jest.useFakeTimers();
      const routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(createMockRoute('1', 'MyEvents', true));

      const { getByText, queryByText } = render(<EventDetailsScreen />);
      expect(queryByText('Plan details updated')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(350);
      });

      expect(getByText('Plan details updated')).toBeTruthy();

      routeSpy.mockRestore();
      jest.useRealTimers();
    });

    it('opens chat when "Go to chat" is pressed', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const chatButton = getByText('Go to chat');
      fireEvent.press(chatButton);

      expect(mockChatState.setActiveConversation).toHaveBeenCalledWith(mockEventConversation.id);
      expect(mockPush).toHaveBeenCalledWith('ChatThread');
    });

    it('opens menu overlay when menu button is pressed', async () => {
      const { getByTestId, queryByTestId } = render(<EventDetailsScreen />);

      // Menu should not be visible initially
      expect(queryByTestId('menu-overlay')).toBeNull();

      // Find and press menu button (more-horizontal icon)
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find((btn) => btn.props.accessibilityRole === 'button');

      // Press on the second pressable which should be the menu button
      fireEvent.press(menuButtons[1]);

      await waitFor(() => {
        expect(getByTestId('menu-overlay')).toBeTruthy();
      });
    });

    it('shows Edit plan and Delete plan menu items for host', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      const buttons = getAllByRole('button');
      fireEvent.press(buttons[1]); // Menu button

      await waitFor(() => {
        expect(getByTestId('menu-item-edit-plan')).toBeTruthy();
        expect(getByTestId('menu-item-delete-plan')).toBeTruthy();
      });
    });

    it('navigates to edit screen when Edit plan is pressed', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        const editButton = getByTestId('menu-item-edit-plan');
        fireEvent.press(editButton);
      });
      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(mockNavigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PUSH',
          payload: expect.objectContaining({
            name: 'CreateEvent',
            params: { editEventId: mockOwnedEvent.id },
          }),
        }),
      );
    });

    it('shows delete confirmation when Delete plan is pressed', async () => {
      const { getByTestId, getAllByRole, queryByTestId } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        const deleteButton = getByTestId('menu-item-delete-plan');
        fireEvent.press(deleteButton);
      });

      await waitFor(() => {
        expect(getByTestId('confirm-overlay')).toBeTruthy();
        expect(getByTestId('confirm-title')).toHaveTextContent('Delete this plan?');
      });
    });

    it('deletes event when confirmed', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and click delete
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-delete-plan'));
      });

      await waitFor(() => {
        fireEvent.press(getByTestId('confirm-button'));
      });

      await waitFor(() => {
        expect(mockEventsState.deleteUserEvent).toHaveBeenCalledWith(mockOwnedEvent.id);
      });
    });

    it('shows Requests tab for host on group event', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Requests')).toBeTruthy();
    });

    it('shows Members tab for host on group event', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Members')).toBeTruthy();
    });

    it('displays "No requests" when there are no pending requests', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('No requests')).toBeTruthy();
    });

    it('displays pending join requests for host', async () => {
      // Add pending requests to chat state
      mockChatState.joinRequestsByConversation = {
        [mockEventConversation.id]: [mockPendingJoinRequest],
      };

      const { getByText } = render(<EventDetailsScreen />);

      await waitFor(() => {
        expect(getByText(mockPendingJoinRequest.requester.name)).toBeTruthy();
        expect(getByText(mockPendingJoinRequest.message)).toBeTruthy();
      });
    });

    it('displays pending group requests from event-scoped key when conversation is not loaded', async () => {
      mockChatState.conversations = [];
      mockChatState.joinRequestsByConversation = {
        [-Number(mockOwnedEvent.id)]: [mockPendingJoinRequest],
      };

      const { getByText } = render(<EventDetailsScreen />);

      await waitFor(() => {
        expect(getByText(mockPendingJoinRequest.requester.name)).toBeTruthy();
        expect(getByText(mockPendingJoinRequest.message)).toBeTruthy();
      });
    });
  });

  describe('Guest View (Not Logged In)', () => {
    beforeEach(() => {
      // Set up as guest (no user)
      mockAuthState.user = null;
      mockAuthState.token = null;
      mockEventsState.events = [mockNonOwnedEvent];
    });

    it('displays host name for non-owned event', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText(`Hosted by ${mockNonOwnedEvent.hostName}`)).toBeTruthy();
    });

    it('shows "Request to join" CTA button for guest', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Request to join')).toBeTruthy();
    });

    it('shows going row for guest viewers', () => {
      const { getByTestId } = render(<EventDetailsScreen />);

      expect(getByTestId('going-row')).toBeTruthy();
      expect(getByTestId('going-count-label')).toHaveTextContent('2 Joined');
    });

    it('redirects to login when guest tries to join', async () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Press Request to join button
      const interestedButton = getByText('Request to join');
      fireEvent.press(interestedButton);

      // Should show invite overlay
      await waitFor(() => {
        expect(getByTestId('invite-overlay')).toBeTruthy();
      });

      // Enter a message
      const input = getByTestId('invite-message-input');
      fireEvent.changeText(input, 'I want to join!');

      // Press send - should show sign-in modal since no user
      const sendButton = getByTestId('send-invite-button');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(getByTestId('bottom-sheet-modal')).toBeTruthy();
      });
    });
  });

  describe('Non-Member View (Logged In, Not Joined)', () => {
    beforeEach(() => {
      // Set up as logged in user viewing someone else's event
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      // Remove user from conversation members
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [999], // User not in members
        },
      ];
    });

    it('shows "Request to join" button for non-member', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Request to join')).toBeTruthy();
    });

    it('shows going row for non-joined viewers', () => {
      const { getByTestId } = render(<EventDetailsScreen />);

      expect(getByTestId('going-row')).toBeTruthy();
      expect(getByTestId('going-count-label')).toHaveTextContent('1 Joined');
    });

    it('shows fallback host going state when conversation is missing', () => {
      mockChatState.conversations = [];
      const { getByTestId } = render(<EventDetailsScreen />);

      expect(getByTestId('going-row')).toBeTruthy();
      expect(getByTestId('going-count-label')).toHaveTextContent('1 Joined');
      expect(getByTestId('going-avatar-0')).toBeTruthy();
    });

    it('shows no going-line label for single events', () => {
      mockEventsState.events = [mockSingleEvent];
      mockChatState.conversations = [
        {
          ...mockConversations[0],
          eventId: Number(mockSingleEvent.id),
          memberIds: [mockSingleEvent.ownerId, mockUser.id],
          participants: [
            { id: mockSingleEvent.ownerId, name: mockSingleEvent.hostName },
            { id: mockUser.id, name: mockUser.name },
          ],
        },
      ];
      const routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(createMockRoute(mockSingleEvent.id));

      const { queryByTestId } = render(<EventDetailsScreen />);

      expect(queryByTestId('going-row')).toBeNull();
      expect(queryByTestId('going-count-label')).toBeNull();

      routeSpy.mockRestore();
    });

    it('opens invite prompt when Request to join is pressed', async () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      fireEvent.press(getByText('Request to join'));

      await waitFor(() => {
        expect(getByTestId('invite-overlay')).toBeTruthy();
      });
    });

    it('shows Report plan option in menu for non-member', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-report-plan')).toBeTruthy();
      });
    });

    it('sends join request successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ request: { id: 1, status: 'pending' } }), {
        status: 201,
      });

      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Request to join'));

      await waitFor(() => {
        expect(getByTestId('invite-overlay')).toBeTruthy();
      });

      // Enter message
      fireEvent.changeText(getByTestId('invite-message-input'), 'I would like to join!');

      // Send request
      fireEvent.press(getByTestId('send-invite-button'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/events/'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          }),
        );
      });
    });

    it('shows error when join request message is empty', async () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Request to join'));

      await waitFor(() => {
        expect(getByTestId('invite-overlay')).toBeTruthy();
      });

      // Try to send without message
      fireEvent.press(getByTestId('send-invite-button'));

      await waitFor(() => {
        expect(getByTestId('invite-error')).toBeTruthy();
      });
    });
  });

  describe('Member View (Joined Event)', () => {
    beforeEach(() => {
      // Set up as logged in member of the event
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [mockUser.id, 999], // User is in members
        },
      ];
    });

    it('shows "Go to chat" button for members', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Go to chat')).toBeTruthy();
    });

    it('shows going row for joined members', () => {
      const { getByTestId } = render(<EventDetailsScreen />);

      expect(getByTestId('going-row')).toBeTruthy();
      expect(getByTestId('going-count-label')).toHaveTextContent('2 Joined');
    });

    it('does not show "Request to join" button for members', () => {
      const { queryByText } = render(<EventDetailsScreen />);

      expect(queryByText('Request to join')).toBeNull();
    });

    it('shows Leave plan option in menu for members', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-leave-plan')).toBeTruthy();
      });
    });

    it('shows Report plan option in menu for members', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-report-plan')).toBeTruthy();
      });
    });

    it('shows View intro message option in menu for members', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-view-intro-message')).toBeTruthy();
      });
    });

    it('shows leave confirmation when Leave plan is pressed', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-leave-plan'));
      });

      await waitFor(() => {
        expect(getByTestId('confirm-overlay')).toBeTruthy();
        expect(getByTestId('confirm-title')).toHaveTextContent('Leave this plan?');
      });
    });

    it('leaves event when confirmed', async () => {
      fetchMock.mockResponseOnce('', { status: 200 });

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and click leave
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-leave-plan'));
      });

      await waitFor(() => {
        fireEvent.press(getByTestId('confirm-button'));
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(
            `/api/events/${mockNonOwnedEvent.id}/chat/members/${mockUser.id}`,
          ),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });

      expect(mockEventsState.unmarkEventRequested).toHaveBeenCalledWith(mockNonOwnedEvent.id);
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: {
              screen: 'Events',
              params: { showEventLeftBadge: true },
            },
          },
        ],
      });
    });
  });

  describe('Pending Join Request State', () => {
    beforeEach(() => {
      // Set up as user with pending request
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      mockEventsState.isEventRequested = jest.fn(() => true);
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [999], // User not yet a member
        },
      ];
    });

    it('shows "Request pending" button when request is pending', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Request pending')).toBeTruthy();
    });

    it('disables CTA button when request is pending', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const pendingButton = getByText('Request pending').parent;
      // The button should be disabled (not respond to press)
      expect(pendingButton).toBeTruthy();
    });

    it('shows Cancel request option in menu for pending state', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-cancel-request')).toBeTruthy();
      });
    });

    it('cancels request when Cancel request is pressed', async () => {
      fetchMock.mockResponseOnce('', { status: 200 });

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-cancel-request'));
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/api/events/${mockNonOwnedEvent.id}/chat/requests/me`),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });

  describe('Event Not Found State', () => {
    beforeEach(() => {
      // Set up with empty events or non-matching event ID
      mockEventsState.events = [];
      mockAuthState.token = null;
    });

    it('renders fallback UI when event is not found', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText("We couldn't find that plan.")).toBeTruthy();
    });

    it('shows back button on fallback screen', () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      const buttons = getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('navigates back when back button is pressed on fallback', () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      const backButton = getAllByRole('button')[0];
      fireEvent.press(backButton);

      expect(mockGoBack).toHaveBeenCalled();
    });

    it('fetches event details when the event is missing from context', async () => {
      const routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(createMockRoute('42'));
      mockAuthState.token = 'test-token';
      mockAuthState.authFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: 42,
            title: 'Past Coffee',
            location: 'Old Cafe',
            time: '18:30',
            event_date: '2026-01-10',
            date_label: 'Today',
            description: 'A past event',
            gender: 'All Gender',
            min_age: 21,
            max_age: 40,
            group_type: 'Group',
            user_id: mockUser.id,
            host_name: mockUser.name,
            cover_key: 'badminton',
            scheduled_at: '2026-01-10T18:30:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      });

      const { getByText } = render(<EventDetailsScreen />);

      await waitFor(() => {
        expect(getByText('Past Coffee')).toBeTruthy();
      });
      expect(mockAuthState.authFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/events/42'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      routeSpy.mockRestore();
    });
  });

  describe('Report plan Flow', () => {
    beforeEach(() => {
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [999],
        },
      ];
    });

    it('opens report overlay when Report plan is selected', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-report-plan'));
      });

      await waitFor(() => {
        expect(getByTestId('report-overlay')).toBeTruthy();
      });
    });

    it('shows error when report reason is empty', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and report
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-report-plan'));
      });

      await waitFor(() => {
        fireEvent.press(getByTestId('submit-report-button'));
      });

      await waitFor(() => {
        expect(getByTestId('report-error')).toBeTruthy();
      });
    });

    it('submits report successfully', async () => {
      fetchMock.mockResponseOnce('', { status: 200 });

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and report
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-report-plan'));
      });

      await waitFor(() => {
        fireEvent.changeText(getByTestId('report-message-input'), 'Inappropriate content');
        fireEvent.press(getByTestId('submit-report-button'));
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/api/events/${mockNonOwnedEvent.id}/report`),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ reason: 'Inappropriate content' }),
          }),
        );
      });

      const reportFlowDeleteCall = fetchMock.mock.calls.some(([url, init]) => {
        return (
          String(url).includes(`/api/events/${mockNonOwnedEvent.id}/chat/members/${mockUser.id}`) &&
          init?.method === 'DELETE'
        );
      });
      expect(reportFlowDeleteCall).toBe(false);
    });

    it('shows generic report error when submit fails', async () => {
      fetchMock.mockResponseOnce('', { status: 500 });

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and report
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-report-plan')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-report-plan'));

      await waitFor(() => {
        expect(getByTestId('report-message-input')).toBeTruthy();
      });
      fireEvent.changeText(getByTestId('report-message-input'), 'Inappropriate content');
      fireEvent.press(getByTestId('submit-report-button'));

      await waitFor(
        () => {
          expect(getByTestId('report-error')).toHaveTextContent(
            'Unable to submit report right now.',
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Host Join Request Management', () => {
    beforeEach(() => {
      // Set up as host with pending requests
      mockEventsState.events = [mockOwnedEvent];
      mockChatState.joinRequestsByConversation = {
        [mockEventConversation.id]: [mockPendingJoinRequest],
      };
    });

    it('displays accept and decline buttons for pending requests', async () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      await waitFor(() => {
        // Should have action buttons for the request
        const buttons = getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(2);
      });
    });

    it('approves request when accept button is pressed', async () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      // Find accept buttons (check mark icons)
      await waitFor(() => {
        const buttons = getAllByRole('button');
        // Press what should be the accept button (varies by implementation)
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    it('declines request when decline button is pressed', async () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      await waitFor(() => {
        const buttons = getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Description Expansion', () => {
    const longDescription = 'A'.repeat(150);

    beforeEach(() => {
      mockEventsState.events = [
        {
          ...mockNonOwnedEvent,
          description: longDescription,
        },
      ];
    });

    // Fire an onTextLayout with `lineCount` wrapped lines; >2 triggers truncation.
    const fireTextLayout = (getByTestId: (id: string) => any, lineCount: number) => {
      const lines = Array.from({ length: lineCount }, (_, i) => ({ text: `line${i} ` }));
      fireEvent(getByTestId('description-full-measure'), 'textLayout', {
        nativeEvent: { lines },
      });
    };

    it('shows "See more" for long descriptions', () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      fireTextLayout(getByTestId, 3);

      expect(getByText('See more')).toBeTruthy();
    });

    it('expands description when See more is pressed', () => {
      const { getByText, queryByText, getByTestId } = render(<EventDetailsScreen />);

      fireTextLayout(getByTestId, 3);

      fireEvent.press(getByText('See more'));

      // After expansion, "See more" should not be visible
      expect(queryByText('See more')).toBeNull();
      expect(getByText('See less')).toBeTruthy();
    });

    it('collapses description when See less is pressed', () => {
      const { getByText, queryByText, getByTestId } = render(<EventDetailsScreen />);

      fireTextLayout(getByTestId, 3);

      fireEvent.press(getByText('See more'));
      fireEvent.press(getByText('See less'));

      expect(queryByText('See less')).toBeNull();
      expect(getByText('See more')).toBeTruthy();
    });

    it('does not show toggle for short descriptions', () => {
      mockEventsState.events = [
        {
          ...mockNonOwnedEvent,
          description: 'Short desc',
        },
      ];

      const { queryByText, getByTestId } = render(<EventDetailsScreen />);

      fireTextLayout(getByTestId, 2);

      expect(queryByText('See more')).toBeNull();
      expect(queryByText('See less')).toBeNull();
    });
  });

  describe('Navigation', () => {
    it('navigates back when back button is pressed', () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      const backButton = getAllByRole('button')[0];
      fireEvent.press(backButton);

      expect(mockGoBack).toHaveBeenCalled();
    });

    it('resets navigation after delete success', async () => {
      mockEventsState.events = [mockOwnedEvent];

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and delete
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-delete-plan')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-delete-plan'));

      await waitFor(() => {
        expect(getByTestId('confirm-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('confirm-button'));

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [
            {
              name: 'Main',
              params: {
                screen: 'Events',
                params: { showEventDeletedBadge: true },
              },
            },
          ],
        });
      });
    });
  });

  describe('Date Label Formatting', () => {
    it('displays formatted date for today event', () => {
      mockEventsState.events = [{ ...mockGroupEvent, dateLabel: 'Today' as const }];

      const { getByText } = render(<EventDetailsScreen />);

      expect(
        getByText(
          `${formatEventDetailDateLabel(mockGroupEvent.eventDate)} · ${mockGroupEvent.time}`,
        ),
      ).toBeTruthy();
    });

    it('displays formatted date for tomorrow event', () => {
      mockEventsState.events = [
        {
          ...mockGroupEvent,
          dateLabel: 'Tmrw' as const,
          eventDate: mockSingleEvent.eventDate,
        },
      ];

      const { getByText } = render(<EventDetailsScreen />);

      expect(
        getByText(
          `${formatEventDetailDateLabel(mockSingleEvent.eventDate)} · ${mockGroupEvent.time}`,
        ),
      ).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockOwnedEvent];
    });

    it('handles delete failure gracefully', async () => {
      mockEventsState.deleteUserEvent = jest.fn().mockRejectedValue(new Error('Delete failed'));

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and try to delete
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-delete-plan')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-delete-plan'));

      await waitFor(() => {
        expect(getByTestId('confirm-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('confirm-button'));

      // Should show error message after rejection propagates
      await waitFor(
        () => {
          expect(getByTestId('confirm-error')).toBeTruthy();
        },
        { timeout: 3000 },
      );
    });

    it('handles leave event failure gracefully', async () => {
      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [mockUser.id, 999],
        },
      ];

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and try to leave
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-leave-plan')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-leave-plan'));

      await waitFor(() => {
        expect(getByTestId('confirm-button')).toBeTruthy();
      });

      // Mock fetch to reject for the leave request AFTER menu/confirm is shown
      fetchMock.mockRejectOnce(new Error('Network error'));
      fireEvent.press(getByTestId('confirm-button'));

      await waitFor(
        () => {
          expect(getByTestId('confirm-error')).toBeTruthy();
        },
        { timeout: 3000 },
      );
    });

    it('handles join request 401 by showing sign-in modal', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [999],
        },
      ];

      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Request to join'));

      await waitFor(() => {
        fireEvent.changeText(getByTestId('invite-message-input'), 'Hello!');
        fireEvent.press(getByTestId('send-invite-button'));
      });

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith('Login');
      });
    });

    it('handles join request 409 (duplicate) correctly', async () => {
      fetchMock.mockResponseOnce('', { status: 409 });

      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [999],
        },
      ];

      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Request to join'));

      await waitFor(() => {
        expect(getByTestId('invite-message-input')).toBeTruthy();
      });
      fireEvent.changeText(getByTestId('invite-message-input'), 'Hello!');
      fireEvent.press(getByTestId('send-invite-button'));

      await waitFor(
        () => {
          expect(getByTestId('invite-error')).toHaveTextContent(
            'You already have a pending request for this event.',
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Single (1:1) Events - Host View', () => {
    let routeSpy: jest.SpyInstance;

    beforeEach(() => {
      // Set up as host of a 1:1 event
      const singleOwnedEvent = {
        ...mockSingleEvent,
        ownerId: mockUser.id,
      };
      mockEventsState.events = [singleOwnedEvent];

      // Update route to point to the single event
      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(createMockRoute('2'));

      mockChatState.conversations = [
        {
          ...mockEventConversation,
          id: 2,
          eventId: 2,
          memberIds: [mockUser.id],
        },
      ];
    });

    afterEach(() => {
      routeSpy.mockRestore();
    });

    it('shows Requests and Accepted tabs for 1:1 events (no Members tab)', () => {
      const { getByText, queryByText } = render(<EventDetailsScreen />);

      expect(getByText('Requests')).toBeTruthy();
      expect(getByText('Accepted')).toBeTruthy();
      expect(queryByText('Members')).toBeNull();
    });

    it('opens JoinRequests when 1:1 host taps "Go to chat" without existing conversations', () => {
      mockChatState.conversations = [];

      const { getByText } = render(<EventDetailsScreen />);

      fireEvent.press(getByText('Go to chat'));

      expect(mockNavigate).toHaveBeenCalledWith(
        'JoinRequests',
        expect.objectContaining({
          conversationId: -2,
          eventId: 2,
          title: mockSingleEvent.title,
          groupType: 'Single',
        }),
      );
    });
  });

  describe('Accessibility', () => {
    it('has accessible back button', () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      const buttons = getAllByRole('button');
      expect(buttons[0]).toBeTruthy();
    });

    it('has accessible menu button', () => {
      const { getAllByRole } = render(<EventDetailsScreen />);

      const buttons = getAllByRole('button');
      expect(buttons[1]).toBeTruthy();
    });

    it('has accessible CTA button', () => {
      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [999],
        },
      ];

      const { getAllByRole } = render(<EventDetailsScreen />);

      const buttons = getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(2);
    });
  });

  describe('Introduction Message Display', () => {
    beforeEach(() => {
      // Set up as member with intro message fetched
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      mockEventsState.isEventRequested = jest.fn(() => true);
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockNonOwnedEvent.id),
          memberIds: [mockUser.id, 999],
        },
      ];

      // Mock the fetch for user's intro message
      fetchMock.mockResponseOnce(
        JSON.stringify({
          requests: [
            {
              event_id: Number(mockNonOwnedEvent.id),
              message: 'My introduction message',
            },
          ],
        }),
        { status: 200 },
      );
    });

    it('fetches and displays user intro message for members', async () => {
      const { queryByText } = render(<EventDetailsScreen />);

      // Wait for the fetch to complete
      await waitFor(
        () => {
          // The intro message section should be visible
          expect(queryByText('Introduction')).toBeTruthy();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Read-only Past Event Members', () => {
    let routeSpy: jest.SpyInstance;

    afterEach(() => {
      routeSpy?.mockRestore();
    });

    it('fetches and displays members without live chat conversation state', async () => {
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockAuthState.authFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            { id: mockUser.id, name: 'Past Host' },
            { id: mockOtherUser.id, name: 'Past Member' },
          ],
        }),
      });
      mockEventsState.events = [mockOwnedEvent];
      mockChatState.conversations = [];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockOwnedEvent.id, undefined, undefined, 'EventDetails', true),
        );

      const { getByText, queryByText } = render(<EventDetailsScreen />);

      await waitFor(() => {
        expect(getByText('Past Member')).toBeTruthy();
      });

      expect(getByText('Past Host')).toBeTruthy();
      expect(getByText('Host')).toBeTruthy();
      expect(queryByText('Requests')).toBeNull();
      expect(mockAuthState.authFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/events/${mockOwnedEvent.id}/members`),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('keeps the back action for read-only EventDetails routes', () => {
      mockAuthState.user = mockUser;
      mockAuthState.token = null;
      mockAuthState.authFetch = jest.fn();
      mockEventsState.events = [mockOwnedEvent];
      mockChatState.conversations = [];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockOwnedEvent.id, undefined, undefined, 'EventDetails', true),
        );

      const { getByLabelText, queryByLabelText } = render(<EventDetailsScreen />);

      expect(queryByLabelText('Close')).toBeNull();

      fireEvent.press(getByLabelText('Go back'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Overlay Members Tab', () => {
    let routeSpy: jest.SpyInstance;

    afterEach(() => {
      routeSpy?.mockRestore();
    });

    it('shows Members tab for non-host member in overlay group event with host at top', () => {
      // Non-host user viewing a group event overlay
      mockAuthState.user = mockOtherUser; // Liam, id: 2
      mockEventsState.events = [mockOwnedEvent]; // ownerId: 1 (Ava)
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockOwnedEvent.id),
          memberIds: [1, 2],
          participants: [
            { id: 2, name: 'Liam Test' },
            { id: 1, name: 'Ava Test' },
          ],
        },
      ];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockOwnedEvent.id, undefined, undefined, 'EventDetailsOverlay'),
        );

      const { getByText, queryByText, queryAllByText } = render(<EventDetailsScreen />);

      // Members tab should appear
      expect(getByText('Members')).toBeTruthy();
      // Requests tab should NOT appear
      expect(queryByText('Requests')).toBeNull();
      // Host name should be in the list
      expect(queryAllByText('Ava Test').length).toBeGreaterThan(0);
    });

    it('shows Members tab with action menu for host in overlay group event', () => {
      // Host user viewing overlay
      mockAuthState.user = mockUser; // Ava, id: 1
      mockEventsState.events = [mockOwnedEvent]; // ownerId: 1
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockOwnedEvent.id),
          memberIds: [1, 2],
          participants: [
            { id: 1, name: 'Ava Test' },
            { id: 2, name: 'Liam Test' },
          ],
        },
      ];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockOwnedEvent.id, undefined, undefined, 'EventDetailsOverlay'),
        );

      const { getByText, queryByText } = render(<EventDetailsScreen />);

      // Members tab should appear
      expect(getByText('Members')).toBeTruthy();
      // Host Requests/Members tabs should NOT appear (overlay + group)
      expect(queryByText('Requests')).toBeNull();
    });

    it('shows approved members in an Accepted tab for a 1:1 host overlay and omits the host', async () => {
      mockAuthState.user = mockOtherUser; // Liam, id: 2 (owner of single event)
      mockEventsState.events = [mockSingleEvent]; // ownerId: 2, Single

      const approvedRequest = {
        ...mockPendingJoinRequest,
        eventId: Number(mockSingleEvent.id),
        userId: mockUser.id,
        status: 'approved' as const,
        requester: { id: mockUser.id, name: mockUser.name },
      };

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockSingleEvent.id, undefined, undefined, 'EventDetailsOverlay', true),
        );

      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockSingleEvent.id),
          memberIds: [mockOtherUser.id, mockUser.id],
          participants: [
            { id: mockOtherUser.id, name: mockOtherUser.name },
            { id: mockUser.id, name: mockUser.name },
          ],
        },
      ];
      mockChatState.joinRequestsByConversation = {
        [mockEventConversation.id]: [approvedRequest],
      };

      const { getByLabelText, getByText, queryByText } = render(<EventDetailsScreen />);

      expect(getByText('Accepted')).toBeTruthy();
      expect(getByText(mockUser.name)).toBeTruthy();
      expect(getByLabelText(`Open actions for ${mockUser.name}`)).toBeTruthy();
      expect(queryByText(mockOtherUser.name)).toBeNull();
      expect(queryByText('Host')).toBeNull();
      expect(queryByText('Members')).toBeNull();
      expect(queryByText('Requests')).toBeNull();

      await waitFor(() => {
        expect(mockChatState.refreshJoinRequests).toHaveBeenCalledWith(
          mockEventConversation.id,
          Number(mockSingleEvent.id),
          { includeApproved: true },
        );
      });
    });

    it('shows the Accepted empty state for a 1:1 host overlay with no approved members', () => {
      mockAuthState.user = mockOtherUser;
      mockEventsState.events = [mockSingleEvent];
      mockChatState.conversations = [];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockSingleEvent.id, undefined, undefined, 'EventDetailsOverlay', true),
        );

      const { getByText, queryByText } = render(<EventDetailsScreen />);

      expect(getByText('Accepted')).toBeTruthy();
      expect(getByText('No accepted requests')).toBeTruthy();
      expect(getByText('Members you accept will appear here')).toBeTruthy();
      expect(queryByText('Host')).toBeNull();
    });

    it('regular EventDetails keeps existing host Requests + Members tabs for group events', () => {
      // Host viewing regular (non-overlay) group event
      mockAuthState.user = mockUser; // Ava, id: 1
      mockEventsState.events = [mockOwnedEvent]; // ownerId: 1, Group

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(createMockRoute(mockOwnedEvent.id));

      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockOwnedEvent.id),
          memberIds: [1, 2],
        },
      ];

      const { getByText } = render(<EventDetailsScreen />);

      // Regular EventDetails should still have host tabs
      expect(getByText('Requests')).toBeTruthy();
      expect(getByText('Members')).toBeTruthy();
    });

    it('does not render duplicate Members sections for read-only group overlay', () => {
      mockAuthState.user = mockOtherUser; // Liam, id: 2
      mockAuthState.authFetch = jest.fn();
      mockEventsState.events = [mockOwnedEvent]; // ownerId: 1
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockOwnedEvent.id),
          memberIds: [1, 2],
          participants: [
            { id: 1, name: 'Ava Test' },
            { id: 2, name: 'Liam Test' },
          ],
        },
      ];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockOwnedEvent.id, undefined, undefined, 'EventDetailsOverlay', true),
        );

      const { queryAllByText } = render(<EventDetailsScreen />);

      expect(queryAllByText('Members')).toHaveLength(1);
      expect(mockAuthState.authFetch).not.toHaveBeenCalled();
    });

    it('uses a right-side close action instead of a back action for read-only overlays', () => {
      mockAuthState.user = mockOtherUser;
      mockEventsState.events = [mockOwnedEvent];
      mockChatState.conversations = [
        {
          ...mockEventConversation,
          eventId: Number(mockOwnedEvent.id),
          memberIds: [1, 2],
          participants: [
            { id: 1, name: 'Ava Test' },
            { id: 2, name: 'Liam Test' },
          ],
        },
      ];

      routeSpy = jest
        .spyOn(require('@react-navigation/native'), 'useRoute')
        .mockReturnValue(
          createMockRoute(mockOwnedEvent.id, undefined, undefined, 'EventDetailsOverlay', true),
        );

      const { getByLabelText, queryByLabelText } = render(<EventDetailsScreen />);
      const closeButton = getByLabelText('Close');

      expect(queryByLabelText('Go back')).toBeNull();
      expect(closeButton.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            position: 'absolute',
            top: 12,
            right: 16,
          }),
        ]),
      );

      fireEvent.press(closeButton);

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });
});
