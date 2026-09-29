import React from 'react';

import { SectionList, Text, View } from 'react-native';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PastEventsScreen from '@screens/PastEventsScreen';

const mockAuthFetch = jest.fn();
const mockNavigate = jest.fn();
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
  useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
    mockNavigate.mockReset();
  });

  it.each([
    { group_type: 'Group', gender: 'Any', min_age: 18, max_age: 60, expected: 'Group' },
    { group_type: 'Single', gender: 'Any', min_age: 18, max_age: 60, expected: '1:1' },
    {
      group_type: 'Group',
      gender: 'Female',
      min_age: 25,
      max_age: 35,
      expected: 'Group · Female · 25-35',
    },
    {
      group_type: 'Single',
      gender: 'Male',
      min_age: 30,
      max_age: 30,
      expected: '1:1 · Male · 30',
    },
    {
      group_type: undefined,
      gender: 'Any',
      min_age: 20,
      max_age: 29,
      expected: '1:1 · 20-29',
    },
  ])('renders Discover-compatible metadata: $expected', async ({ expected, ...audience }) => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ ...pastEvent(1, '2026-01-15'), ...audience }] }),
    });

    const { getByText, queryByText } = render(<PastEventsScreen />);

    await waitFor(() => expect(getByText(expected)).toBeTruthy());
    expect(queryByText(/All genders|All ages|years/)).toBeNull();
    expect(getByText('Hosting')).toBeTruthy();

    fireEvent.press(getByText('Plan 1'));
    expect(mockNavigate).toHaveBeenCalledWith('EventDetails', { eventId: '1', readOnly: true });
  });

  it('preserves the Joined badge with compact metadata for another host', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ ...pastEvent(1, '2026-01-15'), user_id: 2 }] }),
    });

    const { getByText } = render(<PastEventsScreen />);

    await waitFor(() => expect(getByText('Joined')).toBeTruthy());
    expect(getByText('Group')).toBeTruthy();
  });

  it('loads the next page near the end and merges the same date section', async () => {
    mockAuthFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [pastEvent(1, '2020-01-01')], next_cursor: 'next' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [pastEvent(2, '2020-01-01')], next_cursor: null }),
      });
    const { getByText, UNSAFE_getByType } = render(<PastEventsScreen />);
    await waitFor(() => expect(getByText('Plan 1')).toBeTruthy());
    fireEvent(UNSAFE_getByType(SectionList), 'endReached');
    await waitFor(() => expect(getByText('Plan 2')).toBeTruthy());
    expect(UNSAFE_getByType(SectionList).props.sections).toHaveLength(1);
    expect(mockAuthFetch.mock.calls[1][0]).toContain('limit=25&cursor=next');
  });

  it('shows a page retry without replacing loaded rows with a full-page error', async () => {
    mockAuthFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [pastEvent(1, '2020-01-01')], next_cursor: 'next' }),
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [pastEvent(2, '2020-01-01')], next_cursor: null }),
      });
    const { getByText, UNSAFE_getByType } = render(<PastEventsScreen />);
    await waitFor(() => expect(getByText('Plan 1')).toBeTruthy());
    fireEvent(UNSAFE_getByType(SectionList), 'endReached');
    await waitFor(() => expect(getByText("Couldn't load more past plans.")).toBeTruthy());
    expect(getByText('Plan 1')).toBeTruthy();
    fireEvent.press(getByText('Try again'));
    await waitFor(() => expect(getByText('Plan 2')).toBeTruthy());
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
