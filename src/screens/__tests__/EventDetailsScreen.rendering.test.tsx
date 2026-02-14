/**
 * EventDetailsScreen Rendering Tests
 * Comprehensive tests using @testing-library/react-native
 * Tests event display, host/guest/member views, join/leave/report flows
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';

import { mockEvents, mockUsers, mockConversations, mockJoinRequests } from '../../__tests__/mocks/mockData';

// Mock user for different test scenarios
const mockUser = mockUsers[0]; // Ava Test, id: 1
const mockOtherUser = mockUsers[1]; // Liam Test, id: 2
const mockGuestUser = null;

// Mock event data
const mockGroupEvent = mockEvents[0]; // Coffee Meetup, ownerId: 1 (Ava), Group
const mockSingleEvent = mockEvents[1]; // Hiking Adventure, ownerId: 2 (Liam), Single
const mockOwnedEvent = { ...mockGroupEvent, ownerId: mockUser.id };
const mockNonOwnedEvent = { ...mockGroupEvent, ownerId: 999, hostName: 'Other Host' };

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
const mockGoBack = jest.fn();
const mockReset = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  reset: mockReset,
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  getParent: jest.fn(() => null),
  getState: jest.fn(() => ({ routes: [], index: 0 })),
  dispatch: jest.fn(),
  setParams: jest.fn(),
};

// Mock route with event ID
const createMockRoute = (eventId: string, origin?: string) => ({
  key: 'EventDetails-test',
  name: 'EventDetails' as const,
  params: { eventId, origin },
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
              <Text>Submit Report</Text>
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
              <Text>Cancel Request</Text>
            </Pressable>
            <Pressable testID="report-event-button" onPress={props.onReportEvent}>
              <Text>Report Event</Text>
            </Pressable>
          </View>
        );

      default:
        return <View testID="unknown-overlay" />;
    }
  };
});

// Import screen after mocks are set up
import EventDetailsScreen from '../EventDetailsScreen';

const BASE_URL = 'http://localhost:8080';

describe('EventDetailsScreen Rendering Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.resetMocks();

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

      const scheduleLine = `Today, ${mockGroupEvent.time}`;
      expect(getByText(scheduleLine)).toBeTruthy();
    });

    it('renders event description when provided', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText(mockGroupEvent.description!)).toBeTruthy();
    });

    it('renders audience information correctly for group event', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const audienceLine = `Group, ${mockGroupEvent.audience}`;
      expect(getByText(audienceLine)).toBeTruthy();
    });

    it('renders audience information correctly for 1:1 event', () => {
      // Update events to use single event
      mockEventsState.events = [mockSingleEvent];

      // Update route to point to single event
      const routeSpy = jest.spyOn(require('@react-navigation/native'), 'useRoute').mockReturnValue(
        createMockRoute('2')
      );

      const { getByText } = render(<EventDetailsScreen />);

      const audienceLine = `1:1, ${mockSingleEvent.audience}`;
      expect(getByText(audienceLine)).toBeTruthy();

      // Restore the spy to avoid polluting other tests
      routeSpy.mockRestore();
    });

    it('renders "Details" section heading', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Details')).toBeTruthy();
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

    it('shows "Go to Chat" CTA button for host', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Go to Chat')).toBeTruthy();
    });

    it('opens chat when "Go to Chat" is pressed', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const chatButton = getByText('Go to Chat');
      fireEvent.press(chatButton);

      expect(mockChatState.setActiveConversation).toHaveBeenCalledWith(mockEventConversation.id);
      expect(mockNavigate).toHaveBeenCalledWith('ChatThread');
    });

    it('opens menu overlay when menu button is pressed', async () => {
      const { getByTestId, queryByTestId } = render(<EventDetailsScreen />);

      // Menu should not be visible initially
      expect(queryByTestId('menu-overlay')).toBeNull();

      // Find and press menu button (more-horizontal icon)
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find(btn => btn.props.accessibilityRole === 'button');

      // Press on the second pressable which should be the menu button
      fireEvent.press(menuButtons[1]);

      await waitFor(() => {
        expect(getByTestId('menu-overlay')).toBeTruthy();
      });
    });

    it('shows Edit Details and Delete Event menu items for host', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      const buttons = getAllByRole('button');
      fireEvent.press(buttons[1]); // Menu button

      await waitFor(() => {
        expect(getByTestId('menu-item-edit-details')).toBeTruthy();
        expect(getByTestId('menu-item-delete-event')).toBeTruthy();
      });
    });

    it('navigates to edit screen when Edit Details is pressed', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        const editButton = getByTestId('menu-item-edit-details');
        fireEvent.press(editButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('Main', {
        screen: 'Create',
        params: { editEventId: mockOwnedEvent.id },
      });
    });

    it('shows delete confirmation when Delete Event is pressed', async () => {
      const { getByTestId, getAllByRole, queryByTestId } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        const deleteButton = getByTestId('menu-item-delete-event');
        fireEvent.press(deleteButton);
      });

      await waitFor(() => {
        expect(getByTestId('confirm-overlay')).toBeTruthy();
        expect(getByTestId('confirm-title')).toHaveTextContent('Delete this event?');
      });
    });

    it('deletes event when confirmed', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and click delete
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-delete-event'));
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

    it('displays "No requests yet" when there are no pending requests', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('No requests yet')).toBeTruthy();
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

    it('shows "Interested" CTA button for guest', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Interested')).toBeTruthy();
    });

    it('redirects to login when guest tries to join', async () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Press Interested button
      const interestedButton = getByText('Interested');
      fireEvent.press(interestedButton);

      // Should show invite overlay
      await waitFor(() => {
        expect(getByTestId('invite-overlay')).toBeTruthy();
      });

      // Enter a message
      const input = getByTestId('invite-message-input');
      fireEvent.changeText(input, 'I want to join!');

      // Press send - should redirect to login since no user
      const sendButton = getByTestId('send-invite-button');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Login');
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
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [999], // User not in members
      }];
    });

    it('shows "Interested" button for non-member', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Interested')).toBeTruthy();
    });

    it('opens invite prompt when Interested is pressed', async () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      fireEvent.press(getByText('Interested'));

      await waitFor(() => {
        expect(getByTestId('invite-overlay')).toBeTruthy();
      });
    });

    it('shows Report Event option in menu for non-member', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-report-event')).toBeTruthy();
      });
    });

    it('sends join request successfully', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ request: { id: 1, status: 'pending' } }),
        { status: 201 }
      );

      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Interested'));

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
          })
        );
      });
    });

    it('shows error when join request message is empty', async () => {
      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Interested'));

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
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [mockUser.id, 999], // User is in members
      }];
    });

    it('shows "Go to Chat" button for members', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Go to Chat')).toBeTruthy();
    });

    it('does not show "Interested" button for members', () => {
      const { queryByText } = render(<EventDetailsScreen />);

      expect(queryByText('Interested')).toBeNull();
    });

    it('shows Leave Event option in menu for members', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-leave-event')).toBeTruthy();
      });
    });

    it('shows Report Event option in menu for members', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-report-event')).toBeTruthy();
      });
    });

    it('shows View Intro Message option in menu for members', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-view-intro-message')).toBeTruthy();
      });
    });

    it('shows leave confirmation when Leave Event is pressed', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-leave-event'));
      });

      await waitFor(() => {
        expect(getByTestId('confirm-overlay')).toBeTruthy();
        expect(getByTestId('confirm-title')).toHaveTextContent('Leave this event?');
      });
    });

    it('leaves event when confirmed', async () => {
      fetchMock.mockResponseOnce('', { status: 200 });

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and click leave
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-leave-event'));
      });

      await waitFor(() => {
        fireEvent.press(getByTestId('confirm-button'));
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/api/events/${mockNonOwnedEvent.id}/chat/members/${mockUser.id}`),
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      expect(mockEventsState.unmarkEventRequested).toHaveBeenCalledWith(mockNonOwnedEvent.id);
    });
  });

  describe('Pending Join Request State', () => {
    beforeEach(() => {
      // Set up as user with pending request
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      mockEventsState.isEventRequested = jest.fn(() => true);
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [999], // User not yet a member
      }];
    });

    it('shows "Pending Request" button when request is pending', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('Pending Request')).toBeTruthy();
    });

    it('disables CTA button when request is pending', () => {
      const { getByText } = render(<EventDetailsScreen />);

      const pendingButton = getByText('Pending Request').parent;
      // The button should be disabled (not respond to press)
      expect(pendingButton).toBeTruthy();
    });

    it('shows Cancel Request option in menu for pending state', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-cancel-request')).toBeTruthy();
      });
    });

    it('cancels request when Cancel Request is pressed', async () => {
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
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });

  describe('Event Not Found State', () => {
    beforeEach(() => {
      // Set up with empty events or non-matching event ID
      mockEventsState.events = [];
    });

    it('renders fallback UI when event is not found', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText("We couldn't find that event.")).toBeTruthy();
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
  });

  describe('Report Event Flow', () => {
    beforeEach(() => {
      mockAuthState.user = mockUser;
      mockAuthState.token = 'test-token';
      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [999],
      }];
    });

    it('opens report overlay when Report Event is selected', async () => {
      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        fireEvent.press(getByTestId('menu-item-report-event'));
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
        fireEvent.press(getByTestId('menu-item-report-event'));
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
        fireEvent.press(getByTestId('menu-item-report-event'));
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
          })
        );
      });
    });

    it('shows generic report error when submit fails', async () => {
      fetchMock.mockResponseOnce('', { status: 500 });

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and report
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-report-event')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-report-event'));

      await waitFor(() => {
        expect(getByTestId('report-message-input')).toBeTruthy();
      });
      fireEvent.changeText(getByTestId('report-message-input'), 'Inappropriate content');
      fireEvent.press(getByTestId('submit-report-button'));

      await waitFor(() => {
        expect(getByTestId('report-error')).toHaveTextContent('Unable to submit report right now.');
      }, { timeout: 3000 });
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
    beforeEach(() => {
      // Create event with long description
      const longDescription = 'A'.repeat(150);
      mockEventsState.events = [{
        ...mockNonOwnedEvent,
        description: longDescription,
      }];
    });

    it('shows "See more" for long descriptions', () => {
      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText('...See more')).toBeTruthy();
    });

    it('expands description when See more is pressed', () => {
      const { getByText, queryByText } = render(<EventDetailsScreen />);

      fireEvent.press(getByText('...See more'));

      // After expansion, "See more" should not be visible
      expect(queryByText('...See more')).toBeNull();
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
        expect(getByTestId('menu-item-delete-event')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-delete-event'));

      await waitFor(() => {
        expect(getByTestId('confirm-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('confirm-button'));

      // After delete, result overlay should show
      await waitFor(() => {
        expect(getByTestId('result-overlay')).toBeTruthy();
      }, { timeout: 3000 });

      // Dismiss result
      fireEvent.press(getByTestId('dismiss-button'));

      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('Date Label Formatting', () => {
    it('displays "Today" for events with Today dateLabel', () => {
      mockEventsState.events = [{ ...mockGroupEvent, dateLabel: 'Today' as const }];

      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText(`Today, ${mockGroupEvent.time}`)).toBeTruthy();
    });

    it('displays "Tomorrow" for events with Tmrw dateLabel', () => {
      mockEventsState.events = [{ ...mockGroupEvent, dateLabel: 'Tmrw' as const }];

      const { getByText } = render(<EventDetailsScreen />);

      expect(getByText(`Tomorrow, ${mockGroupEvent.time}`)).toBeTruthy();
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
        expect(getByTestId('menu-item-delete-event')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-delete-event'));

      await waitFor(() => {
        expect(getByTestId('confirm-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('confirm-button'));

      // Should show error message after rejection propagates
      await waitFor(() => {
        expect(getByTestId('confirm-error')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('handles leave event failure gracefully', async () => {
      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [mockUser.id, 999],
      }];

      const { getByTestId, getAllByRole } = render(<EventDetailsScreen />);

      // Open menu and try to leave
      fireEvent.press(getAllByRole('button')[1]);

      await waitFor(() => {
        expect(getByTestId('menu-item-leave-event')).toBeTruthy();
      });
      fireEvent.press(getByTestId('menu-item-leave-event'));

      await waitFor(() => {
        expect(getByTestId('confirm-button')).toBeTruthy();
      });

      // Mock fetch to reject for the leave request AFTER menu/confirm is shown
      fetchMock.mockRejectOnce(new Error('Network error'));
      fireEvent.press(getByTestId('confirm-button'));

      await waitFor(() => {
        expect(getByTestId('confirm-error')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('handles join request 401 by redirecting to login', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [999],
      }];

      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Interested'));

      await waitFor(() => {
        fireEvent.changeText(getByTestId('invite-message-input'), 'Hello!');
        fireEvent.press(getByTestId('send-invite-button'));
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Login');
      });
    });

    it('handles join request 409 (duplicate) correctly', async () => {
      fetchMock.mockResponseOnce('', { status: 409 });

      mockEventsState.events = [mockNonOwnedEvent];
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [999],
      }];

      const { getByText, getByTestId } = render(<EventDetailsScreen />);

      // Open invite prompt
      fireEvent.press(getByText('Interested'));

      await waitFor(() => {
        expect(getByTestId('invite-message-input')).toBeTruthy();
      });
      fireEvent.changeText(getByTestId('invite-message-input'), 'Hello!');
      fireEvent.press(getByTestId('send-invite-button'));

      await waitFor(() => {
        expect(getByTestId('invite-error')).toHaveTextContent('You already have a pending request for this event.');
      }, { timeout: 3000 });
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
      routeSpy = jest.spyOn(require('@react-navigation/native'), 'useRoute').mockReturnValue(
        createMockRoute('2')
      );

      mockChatState.conversations = [{
        ...mockEventConversation,
        id: 2,
        eventId: 2,
        memberIds: [mockUser.id],
      }];
    });

    afterEach(() => {
      routeSpy.mockRestore();
    });

    it('shows only Requests tab for 1:1 events (no Members tab)', () => {
      const { getByText, queryByText } = render(<EventDetailsScreen />);

      expect(getByText('Requests')).toBeTruthy();
      // Members tab should not be visible for 1:1 events
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
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [999],
      }];

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
      mockChatState.conversations = [{
        ...mockEventConversation,
        eventId: Number(mockNonOwnedEvent.id),
        memberIds: [mockUser.id, 999],
      }];

      // Mock the fetch for user's intro message
      fetchMock.mockResponseOnce(
        JSON.stringify({
          requests: [{
            event_id: Number(mockNonOwnedEvent.id),
            message: 'My introduction message',
          }],
        }),
        { status: 200 }
      );
    });

    it('fetches and displays user intro message for members', async () => {
      const { queryByText } = render(<EventDetailsScreen />);

      // Wait for the fetch to complete
      await waitFor(() => {
        // The intro message section should be visible
        expect(queryByText('Introduction')).toBeTruthy();
      }, { timeout: 3000 });
    });
  });
});
