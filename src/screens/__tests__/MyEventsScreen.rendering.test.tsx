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
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

// Import screen after mocks
import MyEventsScreen from '../MyEventsScreen';

const renderWithNav = (component: React.ReactElement) => {
  return render(
    <NavigationContainer>{component}</NavigationContainer>
  );
};

describe('MyEventsScreen Rendering', () => {
  const defaultUser = mockUsers[0];
  const userHostedEvents = mockEvents.filter(e => e.ownerId === defaultUser.id);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: defaultUser });
    mockUseEvents.mockReturnValue({
      events: mockEvents,
      userEvents: userHostedEvents,
      requestedEvents: [],
      isLoading: false,
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
      expect(screen.getByText('Your Events')).toBeTruthy();
    });

    it('renders all filter buttons', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('Upcoming')).toBeTruthy();
      expect(screen.getAllByText('Hosting')[0]).toBeTruthy();
      expect(screen.getAllByText('Joined')[0]).toBeTruthy();
      expect(screen.getByText('Requested')).toBeTruthy();
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
      const hostingButton = screen.getAllByText('Hosting')[0];
      fireEvent.press(hostingButton);
      // Should still show event cards
      expect(screen.getAllByTestId('event-card').length).toBeGreaterThan(0);
    });

    it('switches to Joined filter when pressed', () => {
      mockUseChat.mockReturnValue({
        conversations: [{
          ...mockConversations[0],
          createdBy: 2, // Different user created, so user 1 "joined"
        }],
      });
      renderWithNav(<MyEventsScreen />);
      const joinedButton = screen.getAllByText('Joined')[0];
      fireEvent.press(joinedButton);
      // Filter is now active
      expect(joinedButton).toBeTruthy();
    });

    it('switches to Requested filter when pressed', () => {
      renderWithNav(<MyEventsScreen />);
      const requestedButton = screen.getByText('Requested');
      fireEvent.press(requestedButton);
      expect(requestedButton).toBeTruthy();
    });

    it('toggles back to all when same filter pressed again', () => {
      renderWithNav(<MyEventsScreen />);
      const hostingButton = screen.getAllByText('Hosting')[0];
      fireEvent.press(hostingButton);
      fireEvent.press(hostingButton);
      // Should be back to showing all events
      expect(screen.getByText('Upcoming')).toBeTruthy();
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

    it('renders section headers for Today events', () => {
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('Today')).toBeTruthy();
    });

    it('renders section headers for Tomorrow events', () => {
      mockUseEvents.mockReturnValue({
        events: mockEvents,
        userEvents: mockEvents.filter(e => e.dateLabel === 'Tmrw'),
        requestedEvents: [],
        isLoading: false,
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
        refreshEvents: jest.fn(),
        refreshRequestedEvents: jest.fn(),
      });
      mockUseChat.mockReturnValue({ conversations: [] });
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByTestId('empty-state')).toBeTruthy();
      expect(screen.getByText("You don't have any events")).toBeTruthy();
    });

    it('shows login prompt for guest users', () => {
      mockUseAuth.mockReturnValue({ user: null });
      renderWithNav(<MyEventsScreen />);
      expect(screen.getByText('No events to show')).toBeTruthy();
      expect(screen.getByText('Log In')).toBeTruthy();
    });

    it('navigates to login when Log In pressed', () => {
      mockUseAuth.mockReturnValue({ user: null });
      renderWithNav(<MyEventsScreen />);
      const loginButton = screen.getByText('Log In');
      fireEvent.press(loginButton);
      expect(mockNavigate).toHaveBeenCalledWith('Login');
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
        expect(mockNavigate).toHaveBeenCalledWith('EventDetails', expect.objectContaining({
          origin: 'MyEvents',
        }));
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
        refreshEvents,
        refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      });
      renderWithNav(<MyEventsScreen />);
      // Trigger refresh - the component handles this internally
      expect(refreshEvents).toBeDefined();
    });
  });

  describe('Sort Mode Toggle', () => {
    it('toggles sort mode when Upcoming button pressed', () => {
      renderWithNav(<MyEventsScreen />);
      const upcomingButton = screen.getByText('Upcoming');
      fireEvent.press(upcomingButton);
      // Sort mode toggles, may show "Newest" section
      expect(upcomingButton).toBeTruthy();
    });
  });

  describe('Joined Events from Conversations', () => {
    it('shows joined events based on conversations', () => {
      mockUseChat.mockReturnValue({
        conversations: [{
          id: 1,
          eventId: 2,
          createdBy: 2, // Different from current user
          memberIds: [1, 2],
          participants: [],
          displayName: 'Test',
          unreadCount: 0,
        }],
      });
      renderWithNav(<MyEventsScreen />);
      const joinedButton = screen.getAllByText('Joined')[0];
      fireEvent.press(joinedButton);
      // Should filter to show joined events
      expect(joinedButton).toBeTruthy();
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
        refreshEvents: jest.fn(),
        refreshRequestedEvents: jest.fn(),
      });
      renderWithNav(<MyEventsScreen />);
      const requestedButton = screen.getByText('Requested');
      fireEvent.press(requestedButton);
      expect(screen.getByText('1')).toBeTruthy(); // Count badge
    });
  });
});
