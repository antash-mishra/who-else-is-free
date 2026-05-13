/**
 * Rendering tests for HomeScreen
 * Tests actual component rendering using @testing-library/react-native
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';
import { mockEvents, mockUsers, mockConversations, createTodayEvent, createTomorrowEvent } from '../../__tests__/mocks/mockData';
import { mockNavigation } from '../../__tests__/mocks/mockModules';

const mockUser = mockUsers[0];

let mockAuthValue: { user: typeof mockUser | null; token: string | null } = {
  user: mockUser,
  token: 'test-token',
};
let mockEventsValue = {
  events: mockEvents,
  isLoading: false,
  error: null as string | null,
  refreshEvents: jest.fn().mockResolvedValue(undefined),
  refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
  isEventRequested: jest.fn().mockReturnValue(false),
};
let mockChatValue = { conversations: mockConversations };
let mockViewerLocation = {
  coords: null as { latitude: number; longitude: number } | null,
  permission: null as "granted" | "denied" | "undetermined" | null,
  isLoading: false,
};

jest.mock('@context/AuthContext', () => ({ useAuth: () => mockAuthValue }));
jest.mock('@context/EventsContext', () => ({ useEvents: () => mockEventsValue }));
jest.mock('@context/ChatContext', () => ({ useChat: () => mockChatValue }));
jest.mock('@hooks/useViewerLocation', () => ({
  useViewerLocation: () => mockViewerLocation,
}));
jest.mock('@react-navigation/bottom-tabs', () => {
  const actual = jest.requireActual('@react-navigation/bottom-tabs');
  return {
    ...actual,
    useBottomTabBarHeight: () => 0,
  };
});

jest.mock('@components/EmptyState', () => {
  const { View, Text } = require('react-native');
  return ({ title, description }: { title: string; description: string }) => (
    <View testID="empty-state">
      <Text testID="empty-state-title">{title}</Text>
      <Text testID="empty-state-description">{description}</Text>
    </View>
  );
});

jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => (
    <View testID="screen-container">{children}</View>
  );
});

jest.mock('@components/AnimatedPager', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({
    children,
    selectedIndex,
  }: {
    children: React.ReactNode;
    selectedIndex: number;
    onPageChange: (index: number) => void;
  }) => {
    const pages = React.Children.toArray(children);
    return <View testID="animated-pager">{pages[selectedIndex]}</View>;
  };
});

jest.mock('@components/SegmentedControl', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return ({
    options,
    value,
    onChange,
  }: {
    options: Array<{ label: string; value: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <View>
      {options.map((option) => (
        <Pressable
          key={option.value}
          testID={`segment-${option.value}`}
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
        >
          <Text>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
});

jest.mock('@assets/illustration/discoverEvent-emptyState.png', () => 'mock-empty-state-image');

describe('HomeScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValue = { user: mockUser, token: 'test-token' };
    mockEventsValue = {
      events: mockEvents,
      isLoading: false,
      error: null,
      refreshEvents: jest.fn().mockResolvedValue(undefined),
      refreshRequestedEvents: jest.fn().mockResolvedValue(undefined),
      isEventRequested: jest.fn().mockReturnValue(false),
    };
    mockChatValue = { conversations: mockConversations };
    mockViewerLocation = {
      coords: null,
      permission: null,
      isLoading: false,
    };
  });

  describe('Loading State', () => {
    it('renders loading indicator when loading with no events', () => {
      mockEventsValue.isLoading = true;
      mockEventsValue.events = [];
      const { getByTestId, queryByTestId } = render(<HomeScreen />);
      expect(getByTestId('screen-container')).toBeTruthy();
      expect(queryByTestId('empty-state')).toBeNull();
    });

    it('does not show loading when events exist', () => {
      mockEventsValue.isLoading = true;
      const { getAllByTestId } = render(<HomeScreen />);
      expect(getAllByTestId('event-card').length).toBeGreaterThan(0);
    });
  });

  describe('Error State', () => {
    it('displays error message and retry button', () => {
      mockEventsValue.isLoading = false;
      mockEventsValue.events = [];
      mockEventsValue.error = 'Unable to load events.';
      const { getByText } = render(<HomeScreen />);
      expect(getByText('Unable to load events.')).toBeTruthy();
      expect(getByText('Try again')).toBeTruthy();
    });

    it('calls refreshEvents when retry button is pressed', () => {
      mockEventsValue.events = [];
      mockEventsValue.error = 'Network error';
      const { getByText } = render(<HomeScreen />);
      fireEvent.press(getByText('Try again'));
      expect(mockEventsValue.refreshEvents).toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('renders empty state with correct content when no events', () => {
      mockEventsValue.events = [];
      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('empty-state')).toBeTruthy();
      expect(getByTestId('empty-state-title').props.children).toBe('Nothing Happening Here (Yet!)');
      expect(getByTestId('empty-state-description').props.children).toContain('no events available');
    });
  });

  describe('Events Grouped by Sections', () => {
    it('renders Today section for today events', () => {
      mockEventsValue.events = [createTodayEvent({ id: '100' })];
      const { getByText } = render(<HomeScreen />);
      expect(getByText('Today')).toBeTruthy();
    });

    it('renders Tomorrow section for tomorrow events', () => {
      mockEventsValue.events = [createTomorrowEvent({ id: '101' })];
      const { getByText } = render(<HomeScreen />);
      expect(getByText('Tomorrow')).toBeTruthy();
    });

    it('renders both sections when events exist for both days', () => {
      mockEventsValue.events = [
        createTodayEvent({ id: '100' }),
        createTomorrowEvent({ id: '101' }),
      ];
      const { getByText } = render(<HomeScreen />);
      expect(getByText('Today')).toBeTruthy();
      expect(getByText('Tomorrow')).toBeTruthy();
    });

    it('renders formatted headers for non-Today/Tomorrow dates', () => {
      mockEventsValue.events = [
        createTodayEvent({
          id: '102',
          eventDate: '2099-01-15',
        }),
      ];
      const futureDate = new Date(2099, 0, 15);
      const expectedHeader = `${String(futureDate.getDate()).padStart(2, '0')} ${futureDate.toLocaleString('en-US', { month: 'short' })}, ${futureDate.toLocaleString('en-US', { weekday: 'short' })}`;

      const { getByText } = render(<HomeScreen />);
      expect(getByText(expectedHeader)).toBeTruthy();
    });

    it('renders correct number of event cards', () => {
      const { getAllByTestId } = render(<HomeScreen />);
      expect(getAllByTestId('event-card').length).toBe(mockEvents.length);
    });

    it('renders compact third-line card metadata', () => {
      mockEventsValue.events = [
        createTodayEvent({
          id: '103',
          groupType: 'Group',
          gender: 'Any',
          minAge: 30,
          maxAge: 40,
        }),
      ];

      const { getByText, queryByText } = render(<HomeScreen />);
      expect(getByText('Group, 30-40')).toBeTruthy();
      expect(queryByText('All Gender, 18 to 50 years')).toBeNull();
    });
  });

  describe('Sort Toggle', () => {
    it('renders segmented control with sort options', () => {
      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('segment-upcoming')).toBeTruthy();
      expect(getByTestId('segment-newest')).toBeTruthy();
    });

    it('hides nearest sort mode when viewer location is unavailable', () => {
      const { queryByTestId } = render(<HomeScreen />);
      expect(queryByTestId('segment-nearest')).toBeNull();
    });

    it('defaults to upcoming sort mode', () => {
      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('segment-upcoming').props.accessibilityState.selected).toBe(true);
    });

    it('switches to newest mode and shows Newest Created section header', () => {
      mockEventsValue.events = [createTodayEvent({ id: '100', createdAt: new Date().toISOString() })];
      const { getByTestId, getAllByText, queryByText } = render(<HomeScreen />);
      expect(getAllByText('Today')[0]).toBeTruthy();
      fireEvent.press(getByTestId('segment-newest'));
      expect(getByTestId('segment-newest').props.accessibilityState.selected).toBe(true);
      expect(getAllByText('Newest created')[0]).toBeTruthy();
      expect(queryByText('Today')).toBeNull();
    });

    it('shows nearest sort mode when viewer location is available', () => {
      mockViewerLocation.coords = { latitude: 12.9716, longitude: 77.5946 };
      mockViewerLocation.permission = 'granted';

      const { getByTestId } = render(<HomeScreen />);

      expect(getByTestId('segment-nearest')).toBeTruthy();
    });

    it('moves far events out of the primary nearby list when location is available', () => {
      mockViewerLocation.coords = { latitude: 12.9716, longitude: 77.5946 };
      mockViewerLocation.permission = 'granted';
      mockEventsValue.events = [
        createTodayEvent({
          id: 'blr',
          title: 'Bangalore Coffee',
          latitude: 12.975,
          longitude: 77.6,
        }),
        createTodayEvent({
          id: 'dub',
          title: 'Dublin Pint',
          latitude: 53.3498,
          longitude: -6.2603,
        }),
        createTodayEvent({
          id: 'unknown',
          title: 'Mystery Hangout',
        }),
      ];

      const { getByText } = render(<HomeScreen />);

      expect(getByText('Today')).toBeTruthy();
      expect(getByText('Bangalore Coffee')).toBeTruthy();
      expect(getByText('Farther away')).toBeTruthy();
      expect(getByText('Dublin Pint')).toBeTruthy();
      expect(getByText('Unknown distance')).toBeTruthy();
      expect(getByText('Mystery Hangout')).toBeTruthy();
    });

    it('sorts nearest mode by distance and keeps unknown-distance events visible', () => {
      mockViewerLocation.coords = { latitude: 12.9716, longitude: 77.5946 };
      mockViewerLocation.permission = 'granted';
      mockEventsValue.events = [
        createTodayEvent({
          id: 'dub',
          title: 'Dublin Pint',
          latitude: 53.3498,
          longitude: -6.2603,
        }),
        createTodayEvent({
          id: 'blr',
          title: 'Bangalore Coffee',
          latitude: 12.975,
          longitude: 77.6,
        }),
        createTodayEvent({
          id: 'unknown',
          title: 'Mystery Hangout',
        }),
      ];

      const { getByTestId, UNSAFE_getAllByType, getByText } = render(<HomeScreen />);

      fireEvent.press(getByTestId('segment-nearest'));

      const { SectionList } = require('react-native');
      const nearestList = UNSAFE_getAllByType(SectionList)[0];
      const renderedTitles = nearestList.props.sections.flatMap(
        (section: { data: Array<{ title: string }> }) =>
          section.data.map((item) => item.title),
      );
      expect(renderedTitles.indexOf('Bangalore Coffee')).toBeLessThan(
        renderedTitles.indexOf('Dublin Pint'),
      );
      expect(getByText('Unknown distance')).toBeTruthy();
      expect(getByText('Mystery Hangout')).toBeTruthy();
    });
  });

  describe('Pull-to-Refresh', () => {
    it('calls refreshEvents on pull-to-refresh', async () => {
      const { UNSAFE_getByType } = render(<HomeScreen />);
      const { SectionList } = require('react-native');
      const refreshControl = UNSAFE_getByType(SectionList).props.refreshControl;
      await act(async () => { refreshControl.props.onRefresh(); });
      expect(mockEventsValue.refreshEvents).toHaveBeenCalled();
    });

    it('does not tie pull-refresh spinner to background loading', () => {
      mockEventsValue.isLoading = true;
      const { UNSAFE_getByType } = render(<HomeScreen />);
      const { SectionList } = require('react-native');
      expect(UNSAFE_getByType(SectionList).props.refreshControl.props.refreshing).toBe(false);
    });
  });

  describe('Event Card Navigation', () => {
    it('navigates to EventDetails with correct params when card pressed', () => {
      const { getAllByTestId } = render(<HomeScreen />);
      fireEvent.press(getAllByTestId('event-card')[0]);
      expect(mockNavigation.navigate).toHaveBeenCalledWith('EventDetails', {
        eventId: mockEvents[0].id,
        origin: 'Events',
      });
    });

    it('passes correct eventId for different events', () => {
      const { getAllByTestId } = render(<HomeScreen />);
      fireEvent.press(getAllByTestId('event-card')[1]);
      // Events are grouped by date: Today events first, then Tomorrow
      // mockEvents[0] (id: '1') and mockEvents[2] (id: '3') are Today, so index 1 is id '3'
      expect(mockNavigation.navigate).toHaveBeenCalledWith('EventDetails', {
        eventId: '3',
        origin: 'Events',
      });
    });
  });

  describe('Badge Labels', () => {
    it('shows Hosting badge for user-owned events', () => {
      mockEventsValue.events = [createTodayEvent({ id: '100', ownerId: mockUser.id })];
      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('event-card-badge')).toBeTruthy();
    });

    it('shows Pending badge for requested events', () => {
      mockEventsValue.events = [createTodayEvent({ id: '99', ownerId: 999 })];
      mockEventsValue.isEventRequested = jest.fn().mockReturnValue(true);
      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('event-card-badge')).toBeTruthy();
    });

    it('shows Joined badge for events user has joined', () => {
      mockEventsValue.events = [createTodayEvent({ id: '1', ownerId: 999 })];
      mockChatValue.conversations = [{ ...mockConversations[0], eventId: 1, createdBy: 999 }];
      const { getByTestId } = render(<HomeScreen />);
      expect(getByTestId('event-card-badge')).toBeTruthy();
    });
  });

  describe('Header', () => {
    it('renders Discover Events header', () => {
      const { getByText } = render(<HomeScreen />);
      expect(getByText('Discover Events')).toBeTruthy();
    });
  });

  describe('Guest User', () => {
    it('renders events without badges for guest user', () => {
      mockAuthValue.user = null;
      const { getAllByTestId, queryAllByTestId } = render(<HomeScreen />);
      expect(getAllByTestId('event-card').length).toBe(mockEvents.length);
      expect(queryAllByTestId('event-card-badge').length).toBe(0);
    });
  });
});
