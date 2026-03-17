/**
 * Rendering tests for ProfileScreen
 * Tests user info display, sign out functionality, menu items, and guest state
 */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import ProfileScreen from '../ProfileScreen';
import {
  render,
  createMockUseAuth,
  createMockUseChat,
  createMockUseEvents,
} from '../../__tests__/utils/testUtils';
import { mockUsers, mockConversations, mockEvents } from '../../__tests__/mocks/mockData';
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

// Mock SVG icons
jest.mock('@assets/edit-profile-icon-profile.svg', () => 'EditProfileIconSvg');
jest.mock('@assets/past-event-icon-profile.svg', () => 'PastEventsIconSvg');
jest.mock('@assets/privacy-policy-icon-profile.svg', () => 'PrivacyPolicyIconSvg');
jest.mock('@assets/help-icon-profile.svg', () => 'HelpIconSvg');
jest.mock('@assets/logout-icon-profile.svg', () => 'LogoutIconSvg');
jest.mock('@assets/trash-icon-profile.svg', () => 'TrashIconSvg');

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="linear-gradient">{children}</View>;
  },
}));

// Import mocked modules
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseChat = useChat as jest.Mock;
const mockedUseEvents = useEvents as jest.Mock;

describe('ProfileScreen Rendering', () => {
  const mockSignOut = jest.fn();

  const setupMocks = (overrides: {
    authOverrides?: object;
    chatOverrides?: object;
    eventsOverrides?: object;
  } = {}) => {
    mockedUseAuth.mockReturnValue(
      createMockUseAuth({
        user: mockUsers[0],
        signOut: mockSignOut,
        ...overrides.authOverrides,
      })()
    );
    mockedUseChat.mockReturnValue(
      createMockUseChat({
        conversations: mockConversations,
        ...overrides.chatOverrides,
      })()
    );
    mockedUseEvents.mockReturnValue(
      createMockUseEvents({
        userEvents: mockEvents.filter((e) => e.ownerId === 1),
        ...overrides.eventsOverrides,
      })()
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('User Info Display', () => {
    it('should display user name', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Ava Test')).toBeTruthy();
    });

    it('should display user email', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('ava@example.com')).toBeTruthy();
    });

    it('should display avatar with user initial', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      // First character of "Ava Test" is "A"
      expect(getByText('A')).toBeTruthy();
    });

    it('should display correct initial for different users', () => {
      setupMocks({
        authOverrides: { user: mockUsers[1] }, // Liam Test
      });
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('L')).toBeTruthy();
      expect(getByText('Liam Test')).toBeTruthy();
    });

    it('should display hosted events count', () => {
      setupMocks({
        eventsOverrides: {
          userEvents: mockEvents.filter((e) => e.ownerId === 1), // 2 events
        },
      });
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('2')).toBeTruthy();
      expect(getByText('Hosted')).toBeTruthy();
    });

    it('should display joined events count', () => {
      setupMocks({
        eventsOverrides: {
          events: [mockEvents[0]],
          userEvents: [],
        },
        chatOverrides: {
          conversations: [
            { ...mockConversations[0], eventId: 1, createdBy: 2 }, // Joined event
          ],
        },
      });
      const { getAllByText, getByText } = render(<ProfileScreen />);

      expect(getAllByText('1').length).toBe(1);
      expect(getByText('Joined')).toBeTruthy();
    });
  });

  describe('Sign Out Button', () => {
    it('should display Logout menu item', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Logout')).toBeTruthy();
    });

    it('should call signOut when Logout is pressed', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      const logoutButton = getByText('Logout');
      fireEvent.press(logoutButton);

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('Profile Menu Items', () => {
    it('should display Edit Profile option', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Edit Profile')).toBeTruthy();
    });

    it('should display Past Events option', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Past Events')).toBeTruthy();
    });

    it('should display Privacy Policy option', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Privacy Policy')).toBeTruthy();
    });

    it('should display Help option', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Help')).toBeTruthy();
    });

    it('should display Delete option', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Delete')).toBeTruthy();
    });

    it('should show alert when Edit Profile is pressed', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      fireEvent.press(getByText('Edit Profile'));

      expect(Alert.alert).toHaveBeenCalledWith('Edit Profile', 'Coming Soon');
    });

    it('should show alert when Past Events is pressed', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      fireEvent.press(getByText('Past Events'));

      expect(Alert.alert).toHaveBeenCalledWith('Past Events', 'Coming Soon');
    });

    it('should show alert when Privacy Policy is pressed', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      fireEvent.press(getByText('Privacy Policy'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Privacy Policy',
        'Privacy Policy information will be available here.'
      );
    });

    it('should show alert when Help is pressed', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      fireEvent.press(getByText('Help'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Help',
        'Help & Support information will be available here.'
      );
    });

    it('should show alert when Delete is pressed', () => {
      setupMocks();
      const { getByText } = render(<ProfileScreen />);

      fireEvent.press(getByText('Delete'));

      expect(Alert.alert).toHaveBeenCalledWith('Delete Account', 'Coming Soon');
    });
  });

  describe('Guest User State', () => {
    it('should show guest card when user is not logged in', () => {
      setupMocks({
        authOverrides: { user: null },
      });
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('No profile to show')).toBeTruthy();
      expect(getByText('Sign in to view your account')).toBeTruthy();
    });

    it('should display Continue button for guest users', () => {
      setupMocks({
        authOverrides: { user: null },
      });
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Continue')).toBeTruthy();
    });

    it('should open sign-in modal when Continue is pressed', () => {
      setupMocks({
        authOverrides: { user: null },
      });
      const { getByText, getByTestId } = render(<ProfileScreen />);

      fireEvent.press(getByText('Continue'));

      expect(getByTestId('bottom-sheet-modal')).toBeTruthy();
    });

    it('should show Privacy Policy and Help menu items for guest users', () => {
      setupMocks({
        authOverrides: { user: null },
      });
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Privacy Policy')).toBeTruthy();
      expect(getByText('Help')).toBeTruthy();
    });

    it('should NOT show Edit Profile, Past Events, Logout, Delete for guest users', () => {
      setupMocks({
        authOverrides: { user: null },
      });
      const { queryByText } = render(<ProfileScreen />);

      expect(queryByText('Edit Profile')).toBeNull();
      expect(queryByText('Past Events')).toBeNull();
      expect(queryByText('Logout')).toBeNull();
      expect(queryByText('Delete')).toBeNull();
    });
  });

  describe('Profile Header Card', () => {
    it('should render gradient background', () => {
      setupMocks();
      const { getByTestId } = render(<ProfileScreen />);

      expect(getByTestId('linear-gradient')).toBeTruthy();
    });

    it('should display default name when user name is null', () => {
      setupMocks({
        authOverrides: { user: { ...mockUsers[0], name: null as unknown as string } },
      });
      const { getByText } = render(<ProfileScreen />);

      expect(getByText('Your Profile')).toBeTruthy();
    });
  });

  describe('Stats Display', () => {
    it('should show zero counts when no events', () => {
      setupMocks({
        eventsOverrides: { events: [], userEvents: [] },
        chatOverrides: { conversations: [] },
      });
      const { getAllByText } = render(<ProfileScreen />);

      // Both Hosted and Joined should show 0
      const zeros = getAllByText('0');
      expect(zeros.length).toBe(2);
    });

    it('should correctly calculate joined count excluding own and duplicate event conversations', () => {
      setupMocks({
        authOverrides: { user: mockUsers[0] }, // id: 1
        eventsOverrides: {
          events: [mockEvents[0], mockEvents[1]], // Active event IDs: 1, 2
          userEvents: [],
        },
        chatOverrides: {
          conversations: [
            { ...mockConversations[0], eventId: 1, createdBy: 1 }, // Own event - not counted
            { ...mockConversations[1], eventId: 2, createdBy: 2 }, // Joined event - counted
            { ...mockConversations[1], id: 3, eventId: 2, createdBy: 3 }, // Same event - deduped
            { ...mockConversations[1], id: 4, eventId: 999, createdBy: 2 }, // Stale event - ignored
          ],
        },
      });
      const { getAllByText, getByText } = render(<ProfileScreen />);

      // Should show 1 joined event after own-event filtering + dedupe + stale filtering.
      expect(getAllByText('1').length).toBe(1);
      expect(getByText('Joined')).toBeTruthy();
    });

    it('should ignore stale conversation event IDs missing from active events', () => {
      setupMocks({
        eventsOverrides: {
          events: [mockEvents[0]],
          userEvents: [],
        },
        chatOverrides: {
          conversations: [
            { ...mockConversations[0], eventId: 999, createdBy: 2 }, // Missing from active events
          ],
        },
      });
      const { getAllByText } = render(<ProfileScreen />);

      // Hosted and Joined should both remain 0.
      expect(getAllByText('0').length).toBe(2);
    });
  });
});
