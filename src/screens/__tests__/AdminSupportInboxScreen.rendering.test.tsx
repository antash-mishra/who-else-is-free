import React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { AdminHelpSubmission } from '@api/adminHelp';
import AdminSupportInboxScreen from '@screens/AdminSupportInboxScreen';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
  useFocusEffect: jest.fn(),
}));

const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockLoadMore = jest.fn().mockResolvedValue(undefined);
const mockUseAdminHelpSubmissions = jest.fn();
jest.mock('@hooks/useAdminHelpSubmissions', () => ({
  useAdminHelpSubmissions: (filters: unknown) => mockUseAdminHelpSubmissions(filters),
}));

const submission: AdminHelpSubmission = {
  id: 7,
  type: 'contact',
  message: 'I need help with an urgent safety concern.',
  urgentSafetyIssue: true,
  wantsReply: true,
  replyEmail: 'person@example.com',
  status: 'new',
  createdAt: '2026-07-17T10:00:00.000Z',
  submitter: { id: 2, name: 'Person', email: 'person@example.com' },
};

const state = (overrides: Record<string, unknown> = {}) => ({
  submissions: [submission],
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  refresh: mockRefresh,
  loadMore: mockLoadMore,
  ...overrides,
});

describe('AdminSupportInboxScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAdminHelpSubmissions.mockReturnValue(state());
  });

  it('renders support metadata and opens a submission', () => {
    const { getByText } = render(<AdminSupportInboxScreen />);

    expect(getByText('Urgent safety')).toBeTruthy();
    expect(getByText('I need help with an urgent safety concern.')).toBeTruthy();
    expect(getByText('Person')).toBeTruthy();

    fireEvent.press(getByText('I need help with an urgent safety concern.'));
    expect(mockNavigate).toHaveBeenCalledWith('AdminSupportSubmission', { submissionId: 7 });
  });

  it('changes type and status filters', () => {
    const { getByTestId, getByText } = render(<AdminSupportInboxScreen />);

    expect(getByText('MESSAGE TYPE')).toBeTruthy();
    expect(getByText('STATUS')).toBeTruthy();
    expect(getByText('Any')).toBeTruthy();

    fireEvent.press(getByTestId('segment-feedback'));
    fireEvent.press(getByTestId('segment-closed'));

    expect(mockUseAdminHelpSubmissions).toHaveBeenCalledWith({
      type: 'feedback',
      status: 'closed',
    });
  });

  it('renders the empty state', () => {
    mockUseAdminHelpSubmissions.mockReturnValue(state({ submissions: [] }));
    const { getByText } = render(<AdminSupportInboxScreen />);

    expect(getByText('No support messages')).toBeTruthy();
  });
});
