import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { mockEvents, mockUsers } from '../../__tests__/mocks/mockData';
import { mockNavigation, mockRoute } from '../../__tests__/mocks/mockModules';

const mockUser = { ...mockUsers[0] };
const mockAddUserEvent = jest.fn();
const mockUpdateUserEvent = jest.fn();
const mockQueueGuestEvent = jest.fn();
const mockRootNavigate = jest.fn();

let isGuestMode = false;
let editModeEvents = [...mockEvents];
let currentRouteParams: { editEventId?: string | null } = {};
let mockIsPastDateTime = false;

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    user: isGuestMode ? null : mockUser,
    token: isGuestMode ? null : 'test-token',
  }),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({
    events: editModeEvents,
    addUserEvent: mockAddUserEvent,
    updateUserEvent: mockUpdateUserEvent,
    queueGuestEvent: mockQueueGuestEvent,
    refreshEvents: jest.fn(),
  }),
}));

jest.mock('@utils/dateTime', () => ({
  getDefaultEventDateTime: () => new Date('2026-01-24T14:00:00.000Z'),
  getMaxEventDateTime: () => new Date('2026-02-23T14:00:00.000Z'),
  isPastDateTimeSelection: () => mockIsPastDateTime,
  combineDateAndTime: () => new Date('2026-01-24T14:00:00.000Z'),
  toDateKey: () => '2026-01-24',
  getLegacyDateLabel: () => 'Today',
  formatDateTimeValue: () => '24 Jan, Sat • 14:00',
  formatPickerDateTimeValue: () => '24 Jan, Sat • 14:00',
  clampDateTime: (value: Date) => value,
  formatTime: (hour: number, minute: number) =>
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  formatAbsoluteDateLabel: (value: string) => value,
  getSectionDateLabel: (value: string) => value,
  parseDateKey: () => new Date('2026-01-24T00:00:00.000Z'),
}));

jest.mock('@components/LocationPickerModal', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  const MockLocationPicker = ({
    visible,
    onSelect,
  }: {
    visible: boolean;
    onSelect: (place: {
      placeId: string;
      displayName: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
    }) => void;
  }) => {
    if (!visible) {
      return null;
    }

    return React.createElement(
      View,
      null,
      React.createElement(
        Pressable,
        {
          testID: 'select-mock-place',
          onPress: () =>
            onSelect({
              placeId: 'mock-place-id',
              displayName: 'Temple Bar',
              formattedAddress: 'Dublin, Ireland',
              latitude: 53.3458,
              longitude: -6.2642,
            }),
        },
        React.createElement(Text, null, 'Select Mock Place'),
      ),
    );
  };

  return {
    __esModule: true,
    default: MockLocationPicker,
    LocationPickerContent: MockLocationPicker,
  };
});

jest.mock('@constants/covers', () => ({
  DEFAULT_COVER_KEY: 'cover_01',
  resolveCoverUri: () => 'https://example.com/cover.png',
  COVER_OPTIONS: [
    { key: 'cover_01', label: 'Sunset Glow', source: { uri: 'mock-cover-1' } },
    { key: 'cover_02', label: 'Ocean Mist', source: { uri: 'mock-cover-2' } },
  ],
}));

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
  const selectMockLocation = async () => {
    fireEvent.press(screen.getByText('Select Location'));
    fireEvent.press(screen.getByTestId('select-mock-place'));

    await waitFor(() => {
      expect(screen.getByText('Temple Bar')).toBeTruthy();
    });
  };

  // Description is edited in its own sheet: tap the row, type, press Done (commit).
  const fillDescription = (text: string) => {
    fireEvent.press(screen.getByLabelText('Add details'));
    fireEvent.changeText(screen.getByPlaceholderText('Add details'), text);
    fireEvent.press(screen.getByLabelText('Done editing description'));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentRouteParams = {};
    editModeEvents = [...mockEvents];
    isGuestMode = false;
    mockIsPastDateTime = false;
    mockAddUserEvent.mockResolvedValue('event-123');
    mockUpdateUserEvent.mockResolvedValue(undefined);
  });

  it('renders core fields and current datetime value', () => {
    render(<CreateEventScreen />);

    expect(screen.getByPlaceholderText('Event name')).toBeTruthy();
    expect(screen.getByLabelText('Add details')).toBeTruthy();
    expect(screen.getByText('Select Location')).toBeTruthy();
    expect(screen.getByText('Date & time')).toBeTruthy();
    expect(screen.getByText('24 Jan, Sat • 14:00')).toBeTruthy();
    expect(screen.getByText('All genders')).toBeTruthy();
    expect(screen.getByText('All ages')).toBeTruthy();
  });

  it('opens datetime modal from Date & time row', () => {
    render(<CreateEventScreen />);

    fireEvent.press(screen.getByText('Date & time'));

    // Sheet title "Date & time" now matches the form-row label too, so both are present.
    expect(screen.getAllByText('Date & time').length).toBeGreaterThan(1);
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('uses the future-time copy in the datetime sheet without a full stop', async () => {
    mockIsPastDateTime = true;
    render(<CreateEventScreen />);

    fireEvent.press(screen.getByText('Date & time'));
    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => {
      expect(screen.getByText('Please choose a future time')).toBeTruthy();
    });
  });

  it('preserves typed text when opening a sheet field', () => {
    render(<CreateEventScreen />);

    const titleInput = screen.getByPlaceholderText('Event name');

    fireEvent.changeText(titleInput, 'Coffee Meetup');
    fillDescription('Casual chat');
    fireEvent.press(screen.getByText('Gender'));

    expect(screen.getByPlaceholderText('Event name').props.value).toBe('Coffee Meetup');
    // DescriptionPreview renders a hidden measure copy + the visible text.
    expect(screen.getAllByText('Casual chat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gender').length).toBeGreaterThan(0);
  });

  it('shows validation error for empty name and description', async () => {
    render(<CreateEventScreen />);

    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(screen.getByText('All fields are required')).toBeTruthy();
    });
  });

  it('uses Create as the signed-out CTA and validates before opening sign-in', async () => {
    isGuestMode = true;
    render(<CreateEventScreen />);

    expect(screen.getByText('Create')).toBeTruthy();
    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(screen.getByText('All fields are required')).toBeTruthy();
    });
    expect(mockQueueGuestEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('Continue with Google')).toBeNull();
  });

  it('submits create payload with derived schedule fields', async () => {
    render(<CreateEventScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Event name'), 'Coffee Meetup');
    fillDescription('Casual chat');
    await selectMockLocation();

    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(mockAddUserEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Coffee Meetup',
          description: 'Casual chat',
          location: 'Temple Bar, Dublin, Ireland',
          eventDate: '2026-01-24',
          time: expect.stringMatching(/^\d{2}:\d{2}$/),
          scheduledAt: expect.any(String),
          userId: mockUser.id,
          hostName: mockUser.name,
          placeId: 'mock-place-id',
          latitude: 53.3458,
          longitude: -6.2642,
        }),
      );
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Main', {
        screen: 'MyEvents',
        params: { showEventCreatedBadge: true },
      });
    });
  });

  it('treats null editEventId as create mode', async () => {
    currentRouteParams = { editEventId: null };
    render(<CreateEventScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Event name'), 'Create From Null');
    fillDescription('Casual chat');
    await selectMockLocation();
    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(mockAddUserEvent).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateUserEvent).not.toHaveBeenCalled();
  });

  it('queues guest draft and opens sign-in modal', async () => {
    isGuestMode = true;
    render(<CreateEventScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Event name'), 'Guest Event');
    fillDescription('Guest description');
    await selectMockLocation();
    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(mockQueueGuestEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Guest Event',
          eventDate: '2026-01-24',
          time: expect.stringMatching(/^\d{2}:\d{2}$/),
          scheduledAt: expect.any(String),
          placeId: 'mock-place-id',
          latitude: 53.3458,
          longitude: -6.2642,
        }),
      );
    });

    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith('Login');
  });

  it('does not show a Clear action in the description sheet', () => {
    render(<CreateEventScreen />);

    fireEvent.press(screen.getByLabelText('Add details'));

    expect(screen.queryByLabelText('Clear description')).toBeNull();
    expect(screen.getByLabelText('Done editing description')).toBeTruthy();
  });

  it('submits update payload in edit mode', async () => {
    currentRouteParams = { editEventId: mockEvents[0].id };
    editModeEvents = [
      {
        ...mockEvents[0],
        placeId: 'existing-place-id',
        latitude: 12.9716,
        longitude: 77.5946,
      },
    ];
    render(<CreateEventScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Event name'), 'Updated Name');
    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(mockUpdateUserEvent).toHaveBeenCalledWith(
        mockEvents[0].id,
        expect.objectContaining({
          title: 'Updated Name',
          eventDate: '2026-01-24',
          time: expect.stringMatching(/^\d{2}:\d{2}$/),
          scheduledAt: expect.any(String),
          placeId: 'existing-place-id',
          latitude: 12.9716,
          longitude: 77.5946,
        }),
      );
    });

    expect(mockNavigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'POP_TO',
        payload: expect.objectContaining({
          name: 'EventDetails',
          params: {
            eventId: mockEvents[0].id,
            origin: 'MyEvents',
            showEventUpdatedBadge: true,
          },
          merge: true,
        }),
      }),
    );
  });

  it('does not dispatch route param cleanup on unmount in edit mode', () => {
    currentRouteParams = { editEventId: mockEvents[0].id };
    const { unmount } = render(<CreateEventScreen />);

    unmount();

    expect(mockNavigation.setParams).not.toHaveBeenCalled();
  });

  it('blocks past datetime selection', async () => {
    mockIsPastDateTime = true;
    render(<CreateEventScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Event name'), 'Past Event');
    fillDescription('Past description');
    await selectMockLocation();
    fireEvent.press(screen.getByTestId('create-event-submit'));

    await waitFor(() => {
      expect(screen.getByText('Please choose a future time')).toBeTruthy();
    });

    expect(mockAddUserEvent).not.toHaveBeenCalled();
  });
});
