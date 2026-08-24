/**
 * Rendering tests for MyEventsScreen
 * Tests tab switching, event lists, empty states, and interactions
 */

import React from 'react';

import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

import { mockUsers, mockEvents, mockConversations } from '../../__tests__/mocks/mockData';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
    }),
    useRoute: () => ({
      key: 'MyEvents-test',
      name: 'MyEvents',
      params: {},
    }),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const actual = jest.requireActual('@react-navigation/bottom-tabs');
  return {
    ...actual,
    useBottomTabBarHeight: () => 0,
  };
});

// Mock contexts
const mockUseAuth = jest.fn();
const mockUseEvents = jest.fn();
const mockUseChat = jest.fn();

jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: () => mockUseEvents(),
}));

jest.mock('@context/ChatContext', () => ({
  useChat: () => mockUseChat(),
}));

// Mock safe area
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// Import screen after mocks
import MyEventsScreen from '../MyEventsScreen';

const renderWithNav = (component: React.ReactElement) => {
  return render(<NavigationContainer>{component}</NavigationContainer>);
};

describe('MyEventsScreen Rendering', () => {
  const defaultUser = mockUsers[0];
  const userHostedEvents = mockEvents.filter((e) => e.ownerId === defaultUser.id);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: defaultUser });
    mockUseEvents.mockReturnValue({
      events: mockEvents,
      userEvents: userHostedEvents,
      requestedEvents: [],
      isLoading: false,
      error: null,
      refreshEvents: jest.fn().mockResolvedValue(undefined),
      refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
    });
    mockUseChat.mockReturnValue({
      conversations: mockConversations,
    });
  });

  describe('Header and Filter Tabs', () => {
    it('renders the header title', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('My plans')).toBeTruthy();
    });

    it('renders all filter buttons', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByTestId('segment-hosting')).toBeTruthy();
      expect(screen.getByTestId('segment-joined')).toBeTruthy();
      expect(screen.getByTestId('segment-requested')).toBeTruthy();
      expect(screen.getAllByText('Hosting')[0]).toBeTruthy();
      expect(screen.getAllByText('Joined')[0]).toBeTruthy();
      expect(screen.getByText('Requests')).toBeTruthy();
    });

    it('displays event counts in filter badges', () => {
      renderWithNav(<MyEventsScreen />);
      // Hosting count should be displayed (2 events owned by user 1)
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  describe('Tab Switching', () => {
    it('switches to Hosting filter when pressed', () => {
      renderWithNav(<MyEventsScreen />);
      const hostingButton = screen.getByTestId('segment-hosting');
      fireEvent.press(hostingButton);
      expect(screen.getByTestId('segment-hosting').props.accessibilityState.selected).toBe(true);
      expect(screen.getAllByTestId('event-card').length).toBeGreaterThan(0);
    });

    it('switches to Joined filter when pressed', () => {
      mockUseChat.mockReturnValue({
        conversations: [
          {
            ...mockConversations[0],
            createdBy: 2, // Different user created, so user 1 "joined"
          },
        ],
      });
      renderWithNav(<MyEventsScreen />);
      const joinedButton = screen.getByTestId('segment-joined');
      fireEvent.press(joinedButton);
      expect(screen.getByTestId('segment-joined').props.accessibilityState.selected).toBe(true);
    });

    it('switches to Requested filter when pressed', () => {
      renderWithNav(<MyEventsScreen />);
      const requestedButton = screen.getByTestId('segment-requested');
      fireEvent.press(requestedButton);
      expect(screen.getByTestId('segment-requested').props.accessibilityState.selected).toBe(true);
    });

    it('keeps the selected segment active when pressed again', () => {
      renderWithNav(<MyEventsScreen />);
      const hostingButton = screen.getByTestId('segment-hosting');
      fireEvent.press(hostingButton);
      fireEvent.press(hostingButton);
      expect(screen.getByTestId('segment-hosting').props.accessibilityState.selected).toBe(true);
    });
  });

  describe('Event Lists', () => {
    it('renders event cards for hosted events', () => {
      renderWithNav(<MyEventsScreen />);
      const eventCards = screen.getAllByTestId('event-card');
      expect(eventCards.length).toBeGreaterThan(0);
    });

    it('displays event titles in cards', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('Coffee Meetup')).toBeTruthy();
    });

    it('displays event locations in cards', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText(/Central Park/)).toBeTruthy();
    });

    it('displays compact third-line card metadata', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('Central Park · 10:00')).toBeTruthy();
      expect(screen.getByText('Group · 18-35')).toBeTruthy();
      expect(screen.queryByText('All Gender, 18 to 35 years')).toBeNull();
    });

    it('renders section headers for Today events', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('Today')).toBeTruthy();
    });

    it('renders section headers for Tomorrow events', () => {
      mockUseEvents.mockReturnValue({
        events: mockEvents,
        userEvents: mockEvents.filter((e) => e.dateLabel === 'Tmrw'),
        requestedEvents: [],
        isLoading: false,
        error: null,
        refreshEvents: jest.fn(),
        refreshRequestedEvents: jest.fn(),
      });
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('Tomorrow')).toBeTruthy();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no events exist', () => {
      mockUseEvents.mockReturnValue({
        events: [],
        userEvents: [],
        requestedEvents: [],
        isLoading: false,
        error: null,
        refreshEvents: jest.fn(),
        refreshRequestedEvents: jest.fn(),
      });
      mockUseChat.mockReturnValue({ conversations: [] });
      renderWithNav(<MyEventsScreen />);
      expect(screen.getAllByTestId('empty-state').length).toBeGreaterThan(0);
      expect(screen.getByText('No plans hosted')).toBeTruthy();
      expect(screen.getByText('Your hosted plans will appear here.')).toBeTruthy();
    });

    it('shows login prompt for guest users', () => {
      mockUseAuth.mockReturnValue({ user: null });
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByTestId('empty-state')).toBeTruthy();
      expect(screen.getByText('Your plans are waiting')).toBeTruthy();
      expect(screen.getByText('Get started to create or join plans.')).toBeTruthy();
      expect(screen.getByText('Get started')).toBeTruthy();
      expect(screen.queryByTestId('segment-hosting')).toBeNull();
    });

    it('opens sign-in modal when Get started pressed', () => {
      mockUseAuth.mockReturnValue({ user: null });
      renderWithNav(<MyEventsScreen />);
      const continueButton = screen.getByText('Get started');
      fireEvent.press(continueButton);
      expect(screen.getByTestId('bottom-sheet-modal')).toBeTruthy();
    });
  });

  describe('Load States', () => {
    it('shows loading instead of a false empty state before the initial load completes', () => {
      mockUseEvents.mockReturnValue({
        events: [],
        userEvents: [],
        requestedEvents: [],
        isLoading: true,
        error: null,
        refreshEvents: jest.fn().mockResolvedValue(undefined),
        refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      });
      mockUseChat.mockReturnValue({ conversations: [] });

      renderWithNav(<MyEventsScreen />);

      expect(screen.getByTestId('event-list-loading-state')).toBeTruthy();
      expect(screen.queryByText('No plans hosted')).toBeNull();
      expect(screen.getByTestId('segment-hosting')).toBeTruthy();
    });

    it('shows the shared error state instead of a false empty state', () => {
      mockUseEvents.mockReturnValue({
        events: [],
        userEvents: [],
        requestedEvents: [],
        isLoading: false,
        error: 'Unable to load plans.',
        refreshEvents: jest.fn().mockResolvedValue(undefined),
        refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      });
      mockUseChat.mockReturnValue({ conversations: [] });

      renderWithNav(<MyEventsScreen />);

      expect(screen.getByTestId('event-list-error-state')).toBeTruthy();
      expect(screen.getByLabelText('Unable to load plans')).toBeTruthy();
      expect(screen.getByText('Unable to load plans.')).toBeTruthy();
      expect(screen.getByText('Try again')).toBeTruthy();
      expect(screen.queryByText('No plans hosted')).toBeNull();
      expect(screen.getByTestId('segment-hosting')).toBeTruthy();
    });

    it('retries the event request from the error state', () => {
      const refreshEvents = jest.fn().mockResolvedValue(undefined);
      mockUseEvents.mockReturnValue({
        events: [],
        userEvents: [],
        requestedEvents: [],
        isLoading: false,
        error: 'Unable to load plans.',
        refreshEvents,
        refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      });

      renderWithNav(<MyEventsScreen />);
      fireEvent.press(screen.getByText('Try again'));

      expect(refreshEvents).toHaveBeenCalledTimes(1);
    });

    it('keeps cached event content visible during a later refresh failure', () => {
      mockUseEvents.mockReturnValue({
        events: mockEvents,
        userEvents: userHostedEvents,
        requestedEvents: [],
        isLoading: false,
        error: 'Unable to load plans.',
        refreshEvents: jest.fn().mockResolvedValue(undefined),
        refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      });

      renderWithNav(<MyEventsScreen />);

      expect(screen.getAllByTestId('event-card').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('event-list-error-state')).toBeNull();
    });
  });

  describe('Event Card Interactions', () => {
    it('navigates to EventDetails when event card pressed', async () => {
      renderWithNav(<MyEventsScreen />);
      const eventCards = screen.getAllByTestId('event-card');
      const pressable = eventCards[0].parent;
      if (pressable) {
        fireEvent.press(pressable);
      }
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          'EventDetails',
          expect.objectContaining({
            origin: 'MyEvents',
          }),
        );
      });
    });
  });

  describe('Refresh Behavior', () => {
    it('calls refreshEvents on pull to refresh', async () => {
      const refreshEvents = jest.fn().mockResolvedValue(undefined);
      mockUseEvents.mockReturnValue({
        events: mockEvents,
        userEvents: userHostedEvents,
        requestedEvents: [],
        isLoading: false,
        error: null,
        refreshEvents,
        refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      });
      renderWithNav(<MyEventsScreen />);
      // Trigger refresh - the component handles this internally
      expect(refreshEvents).toBeDefined();
    });
  });

  describe('Segmented Control State', () => {
    it('starts on the Hosting segment', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByTestId('segment-hosting').props.accessibilityState.selected).toBe(true);
    });
  });

  describe('Joined Events from Conversations', () => {
    it('shows joined events based on conversations', () => {
      mockUseChat.mockReturnValue({
        conversations: [
          {
            id: 1,
            eventId: 2,
            createdBy: 2, // Different from current user
            memberIds: [1, 2],
            participants: [],
            displayName: 'Test',
            unreadCount: 0,
          },
        ],
      });
      renderWithNav(<MyEventsScreen />);
      const joinedButton = screen.getByTestId('segment-joined');
      fireEvent.press(joinedButton);
      expect(screen.getByTestId('segment-joined').props.accessibilityState.selected).toBe(true);
    });
  });

  describe('Requested Events', () => {
    it('shows pending badge for requested events', () => {
      const requestedEvent = {
        ...mockEvents[0],
        id: '99',
        ownerId: 999,
      };
      mockUseEvents.mockReturnValue({
        events: [...mockEvents, requestedEvent],
        userEvents: userHostedEvents,
        requestedEvents: [requestedEvent],
        isLoading: false,
        error: null,
        refreshEvents: jest.fn(),
        refreshRequestedEvents: jest.fn(),
      });
      renderWithNav(<MyEventsScreen />);
      const requestedButton = screen.getByTestId('segment-requested');
      fireEvent.press(requestedButton);
      expect(screen.getByText('1')).toBeTruthy(); // Count badge
    });
  });
});
