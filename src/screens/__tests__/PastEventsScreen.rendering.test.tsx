import React from 'react';

import { Text, View } from 'react-native';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PastEventsScreen from '@screens/PastEventsScreen';

const mockAuthFetch = jest.fn();
const mockAuthValue = {
  user: { id: 1, name: 'Ava Test' },
  token: 'token',
  authFetch: mockAuthFetch,
};

jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@components/events', () => {
  const ReactModule = require('react');
  const { Text: MockText, View: MockView } = require('react-native');
  const { buildEventItemSections } = jest.requireActual('@components/events/eventListSections');

  return {
    buildEventItemSections,
    EventSectionList: ({ sections }: { sections: Array<{ title: string }> }) =>
      ReactModule.createElement(
        MockView,
        null,
        sections.map((section) =>
          ReactModule.createElement(MockText, { key: section.title }, section.title),
        ),
      ),
  };
});

jest.mock('@components/ScreenContainer', () => ({ children }: { children: React.ReactNode }) => (
  <View>{children}</View>
));

jest.mock('@components/ScreenHeader', () => ({ title }: { title: string }) => <Text>{title}</Text>);

jest.mock(
  '@components/FullPageEmptyState',
  () =>
    ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? <View>{children}</View> : null,
);

jest.mock('@components/EmptyState', () => ({ title }: { title: string }) => <Text>{title}</Text>);

const pastEvent = (id: number, eventDate: string) => ({
  id,
  title: `Plan ${id}`,
  location: 'Dublin',
  time: '18:00',
  gender: 'Any',
  min_age: 18,
  max_age: 60,
  event_date: eventDate,
  group_type: 'Group',
  user_id: 1,
  host_name: 'Ava Test',
});

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const absoluteListLabel = (date: Date) => {
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const weekday = date.toLocaleString('en-US', { weekday: 'short' });
  return `${day} ${month}, ${weekday}`;
};

describe('PastEventsScreen', () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
  });

  it('renders Yesterday and comma-separated absolute date headings', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const olderDate = new Date();
    olderDate.setDate(olderDate.getDate() - 7);
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [pastEvent(1, toDateKey(yesterday)), pastEvent(2, toDateKey(olderDate))],
      }),
    });

    const { getByText } = render(<PastEventsScreen />);

    await waitFor(() => {
      expect(getByText('Yesterday')).toBeTruthy();
      expect(getByText(absoluteListLabel(olderDate))).toBeTruthy();
    });
  });

  it('shows the safe error and revised retry copy', async () => {
    mockAuthFetch.mockRejectedValue(new Error('private upstream details'));

    const { getByText, queryByText } = render(<PastEventsScreen />);

    await waitFor(() => {
      expect(getByText("Couldn't load past plans.")).toBeTruthy();
      expect(getByText('Please try again')).toBeTruthy();
    });
    expect(queryByText('private upstream details')).toBeNull();

    fireEvent.press(getByText('Please try again'));
    expect(mockAuthFetch).toHaveBeenCalledTimes(2);
  });
});
