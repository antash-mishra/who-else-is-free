/**
 * Rendering tests for CreateEventScreen
 * Uses @testing-library/react-native for component rendering.
 * Tests form validation, submission flows, edit mode, guest behavior, and modal interactions.
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';

import { mockUsers, mockEvents } from '../../__tests__/mocks/mockData';
import { mockNavigation, mockRoute } from '../../__tests__/mocks/mockModules';

// Mock user and context functions
const mockUser = { ...mockUsers[0] };
const mockAddUserEvent = jest.fn();
const mockUpdateUserEvent = jest.fn();
const mockQueueGuestEvent = jest.fn();
const mockRootNavigate = jest.fn();

// State to control guest mode and edit mode
let isGuestMode = false;
let editModeEvents: typeof mockEvents = [];
let currentRouteParams: { editEventId?: string } = {};
let mockIsPastTime = false;

// Mock contexts
jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    user: isGuestMode ? null : mockUser,
    token: isGuestMode ? null : 'test-token',
  }),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({
    events: editModeEvents.length > 0 ? editModeEvents : mockEvents,
    addUserEvent: mockAddUserEvent,
    updateUserEvent: mockUpdateUserEvent,
    queueGuestEvent: mockQueueGuestEvent,
    refreshEvents: jest.fn(),
  }),
}));

// Mock dateTime utils
jest.mock('@utils/dateTime', () => ({
  computeNextAvailableTime: () => '14:00',
  isPastTimeSelection: () => mockIsPastTime,
  buildScheduledAtUTC: () => '2026-01-24T14:00:00Z',
  getDateStringForChoice: (choice: string) => (choice === 'today' ? '2026-01-24' : '2026-01-25'),
  getDateChoiceFromEventDate: () => 'today',
  parseTimeString: (time: string) => {
    const parts = time.split(':').map(Number);
    return { hour: parts[0] || 14, minute: parts[1] || 0 };
  },
  formatTime: (hour: number, minute: number) =>
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  timeStringToMinutes: (time: string) => {
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  },
}));

// Mock covers
jest.mock('@constants/covers', () => ({
  DEFAULT_COVER_KEY: 'cover_01',
  resolveCoverUri: () => 'https://example.com/cover.png',
  COVER_OPTIONS: [
    { key: 'cover_01', label: 'Sunset Glow', source: { uri: 'mock-cover-1' } },
    { key: 'cover_02', label: 'Ocean Mist', source: { uri: 'mock-cover-2' } },
  ],
}));

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      ...mockNavigation,
      getParent: () => ({ navigate: mockRootNavigate }),
    }),
    useRoute: () => ({ ...mockRoute, params: currentRouteParams }),
    useFocusEffect: (callback: () => (() => void) | void) => {
      React.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, []);
    },
  };
});

import CreateEventScreen from '../CreateEventScreen';

describe('CreateEventScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.resetMocks();
    currentRouteParams = {};
    editModeEvents = [];
    isGuestMode = false;
    mockIsPastTime = false;
    mockAddUserEvent.mockResolvedValue('new-event-123');
    mockUpdateUserEvent.mockResolvedValue({});
  });

  describe('Form Field Rendering', () => {
    it('should render all form fields and labels', () => {
      const { getByPlaceholderText, getByText, getAllByText } = render(<CreateEventScreen />);

      // Text inputs
      expect(getByPlaceholderText('Event Name')).toBeTruthy();
      expect(getByPlaceholderText('Description')).toBeTruthy();
      expect(getByPlaceholderText('Search...')).toBeTruthy();
      expect(getByPlaceholderText('HH')).toBeTruthy();
      expect(getByPlaceholderText('MM')).toBeTruthy();

      // Labels
      expect(getByText('Group Type')).toBeTruthy();
      expect(getByText('Gender')).toBeTruthy();
      expect(getByText('Age')).toBeTruthy();
      expect(getByText('Date')).toBeTruthy();
      expect(getByText('Location')).toBeTruthy();
      expect(getAllByText('Create Event').length).toBeGreaterThan(0);
    });

    it('should render default option values', () => {
      const { getByText } = render(<CreateEventScreen />);

      expect(getByText('1:1')).toBeTruthy();
      expect(getByText('All gender')).toBeTruthy();
      expect(getByText('All age')).toBeTruthy();
      expect(getByText('Today')).toBeTruthy();
    });
  });

  describe('Form Input Interactions', () => {
    it('should update text inputs on change', () => {
      const { getByPlaceholderText } = render(<CreateEventScreen />);

      const nameInput = getByPlaceholderText('Event Name');
      fireEvent.changeText(nameInput, 'My Test Event');
      expect(nameInput.props.value).toBe('My Test Event');

      const descInput = getByPlaceholderText('Description');
      fireEvent.changeText(descInput, 'A great description');
      expect(descInput.props.value).toBe('A great description');

      const locationInput = getByPlaceholderText('Search...');
      fireEvent.changeText(locationInput, 'Central Park');
      expect(locationInput.props.value).toBe('Central Park');
    });

    it('should update time inputs and sanitize non-numeric chars', () => {
      const { getByPlaceholderText } = render(<CreateEventScreen />);

      const hourInput = getByPlaceholderText('HH');
      fireEvent.changeText(hourInput, '1a2');
      expect(hourInput.props.value).toBe('12');

      const minuteInput = getByPlaceholderText('MM');
      fireEvent.changeText(minuteInput, '3b0');
      expect(minuteInput.props.value).toBe('30');
    });

    it('should limit time input to 2 characters', () => {
      const { getByPlaceholderText } = render(<CreateEventScreen />);

      const hourInput = getByPlaceholderText('HH');
      fireEvent.changeText(hourInput, '123');
      expect(hourInput.props.value).toBe('12');
    });

    it('should toggle date choice between Today and Tomorrow', () => {
      const { getByText } = render(<CreateEventScreen />);

      fireEvent.press(getByText('Today'));
      expect(getByText('Tomorrow')).toBeTruthy();

      fireEvent.press(getByText('Tomorrow'));
      expect(getByText('Today')).toBeTruthy();
    });

    it('should pad time input on blur', () => {
      const { getByPlaceholderText } = render(<CreateEventScreen />);

      const hourInput = getByPlaceholderText('HH');
      fireEvent.changeText(hourInput, '5');
      fireEvent(hourInput, 'blur');
      expect(hourInput.props.value).toBe('05');

      const minuteInput = getByPlaceholderText('MM');
      fireEvent.changeText(minuteInput, '3');
      fireEvent(minuteInput, 'blur');
      expect(minuteInput.props.value).toBe('03');
    });
  });

  describe('Validation', () => {
    it('should show error when submitting empty form', async () => {
      const { getByText } = render(<CreateEventScreen />);

      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => {
        expect(getByText('All fields are required')).toBeTruthy();
      });
    });

    it('should show error when only whitespace in name and description', async () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), '   ');
      fireEvent.changeText(getByPlaceholderText('Description'), '   ');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => {
        expect(getByText('All fields are required')).toBeTruthy();
      });
    });

    it('should show error for past time selection', async () => {
      mockIsPastTime = true;
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Test Event');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => {
        expect(getByText('All fields are required')).toBeTruthy();
      });
    });

    it('should allow submission with only name or description filled', async () => {
      const { getByPlaceholderText, getByText, rerender } = render(<CreateEventScreen />);

      // Test with name only
      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Test Event');
      fireEvent.press(screen.getByTestId('create-event-submit'));
      await waitFor(() => expect(mockAddUserEvent).toHaveBeenCalled());

      jest.clearAllMocks();
      rerender(<CreateEventScreen />);

      // Test with description only
      fireEvent.changeText(getByPlaceholderText('Description'), 'Test description');
      fireEvent.press(screen.getByTestId('create-event-submit'));
      await waitFor(() => expect(mockAddUserEvent).toHaveBeenCalled());
    });
  });

  describe('Create Flow', () => {
    it('should call addUserEvent with correct form data on submission', async () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Coffee Meetup');
      fireEvent.changeText(getByPlaceholderText('Description'), 'Casual chat');
      fireEvent.changeText(getByPlaceholderText('Search...'), 'Central Park');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => {
        expect(mockAddUserEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Coffee Meetup',
            description: 'Casual chat',
            location: 'Central Park',
            userId: mockUser.id,
            hostName: mockUser.name,
            groupType: 'Single',
            gender: 'Any',
            minAge: 18,
            maxAge: 60,
          })
        );
      });
    });

    it('should navigate to MyEvents after successful creation', async () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Test Event');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => {
        expect(mockNavigation.navigate).toHaveBeenCalledWith('MyEvents');
      });
    });

    it('should show "Creating..." while submitting', async () => {
      mockAddUserEvent.mockImplementation(() => new Promise((r) => setTimeout(() => r('123'), 100)));
      const { getByPlaceholderText, getByText, queryByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Test Event');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => expect(queryByText('Creating...')).toBeTruthy());
    });

    it('should use default location and title when not provided', async () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Description'), 'Just description');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => {
        expect(mockAddUserEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New event',
            location: 'To be decided',
          })
        );
      });
    });

    it('should handle API error gracefully', async () => {
      mockAddUserEvent.mockRejectedValue(new Error('Network error'));
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Test Event');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => expect(getByText('All fields are required')).toBeTruthy());
    });
  });

  describe('Edit Flow', () => {
    const existingEvent = {
      ...mockEvents[0],
      id: 'edit-event-123',
      title: 'Existing Event',
      description: 'Existing description',
      location: 'Existing Location',
      time: '15:00',
      groupType: 'Group' as const,
      gender: 'Female',
      minAge: 25,
      maxAge: 35,
      coverKey: 'cover_02' as const,
    };

    beforeEach(() => {
      currentRouteParams = { editEventId: existingEvent.id };
      editModeEvents = [existingEvent];
    });

    it('should pre-fill form with existing event data', () => {
      const { getByDisplayValue } = render(<CreateEventScreen />);

      expect(getByDisplayValue('Existing Event')).toBeTruthy();
      expect(getByDisplayValue('Existing description')).toBeTruthy();
      expect(getByDisplayValue('Existing Location')).toBeTruthy();
    });

    it('should show "Update Event" button and call updateUserEvent on submission', async () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      expect(getByText('Update Event')).toBeTruthy();

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Updated Event');
      fireEvent.press(getByText('Update Event'));

      await waitFor(() => {
        expect(mockUpdateUserEvent).toHaveBeenCalledWith(
          existingEvent.id,
          expect.objectContaining({ title: 'Updated Event' })
        );
      });
    });

    it('should navigate to EventDetails with update badge after successful update', async () => {
      const { getByText } = render(<CreateEventScreen />);

      fireEvent.press(getByText('Update Event'));

      await waitFor(() =>
        expect(mockRootNavigate).toHaveBeenCalledWith('EventDetails', {
          eventId: existingEvent.id,
          origin: 'MyEvents',
          showEventUpdatedBadge: true,
        })
      );
    });

    it('should show "Updating..." while submitting', async () => {
      mockUpdateUserEvent.mockImplementation(() => new Promise((r) => setTimeout(r, 100)));
      const { getByText, queryByText } = render(<CreateEventScreen />);

      fireEvent.press(getByText('Update Event'));

      await waitFor(() => expect(queryByText('Updating...')).toBeTruthy());
    });
  });

  describe('Guest User Queuing Behavior', () => {
    beforeEach(() => {
      isGuestMode = true;
    });

    it('should show "Sign Up or Log In" button for guest users', () => {
      const { getByText } = render(<CreateEventScreen />);
      expect(getByText('Sign Up or Log In')).toBeTruthy();
    });

    it('should queue event draft when guest submits valid form', () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Guest Event');
      fireEvent.changeText(getByPlaceholderText('Description'), 'Guest description');
      fireEvent.press(getByText('Sign Up or Log In'));

      expect(mockQueueGuestEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Guest Event',
          description: 'Guest description',
        })
      );
      expect(mockRootNavigate).toHaveBeenCalledWith('Login');
    });

    it('should not queue event when form is empty', () => {
      const { getByText } = render(<CreateEventScreen />);

      fireEvent.press(getByText('Sign Up or Log In'));

      expect(mockQueueGuestEvent).not.toHaveBeenCalled();
    });
  });

  describe('Modal Interactions', () => {
    it('should open selection modals on press', () => {
      const { getByText, queryByTestId } = render(<CreateEventScreen />);

      // Group type modal
      fireEvent.press(getByText('1:1').parent!);
      expect(queryByTestId('selection-modal')).toBeTruthy();
    });

    it('should open gender modal on press', () => {
      const { getByText, queryByTestId } = render(<CreateEventScreen />);

      fireEvent.press(getByText('All gender').parent!);
      expect(queryByTestId('selection-modal')).toBeTruthy();
    });

    it('should open age modal on press', () => {
      const { getByText, queryByTestId } = render(<CreateEventScreen />);

      fireEvent.press(getByText('All age').parent!);
      expect(queryByTestId('selection-modal')).toBeTruthy();
    });
  });

  describe('Dismiss Button', () => {
    it('should call goBack when dismiss button is pressed', () => {
      const { getAllByRole } = render(<CreateEventScreen />);

      const buttons = getAllByRole('button');
      fireEvent.press(buttons[0]);
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  describe('Cover Image and Accessibility', () => {
    it('should render cover images and accessible buttons', () => {
      const { UNSAFE_getAllByType, getAllByRole } = render(<CreateEventScreen />);

      const { Image } = require('react-native');
      expect(UNSAFE_getAllByType(Image).length).toBeGreaterThan(0);
      expect(getAllByRole('button').length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Form Reset', () => {
    it('should allow retry after fixing validation errors', async () => {
      const { getByPlaceholderText, getByText } = render(<CreateEventScreen />);

      // Trigger error
      fireEvent.press(screen.getByTestId('create-event-submit'));
      await waitFor(() => expect(getByText('All fields are required')).toBeTruthy());

      // Fix and retry
      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Valid Name');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => expect(mockAddUserEvent).toHaveBeenCalled());
    });

    it('should reset form after successful creation', async () => {
      const { getByPlaceholderText, getByText, rerender } = render(<CreateEventScreen />);

      fireEvent.changeText(getByPlaceholderText('Event Name'), 'Test Event');
      fireEvent.press(screen.getByTestId('create-event-submit'));

      await waitFor(() => expect(mockAddUserEvent).toHaveBeenCalled());

      rerender(<CreateEventScreen />);
      await waitFor(() => expect(getByPlaceholderText('Event Name').props.value).toBe(''));
    });
  });
});
