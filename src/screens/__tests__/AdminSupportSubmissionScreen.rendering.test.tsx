import React from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { getAdminHelpSubmission, updateAdminHelpSubmissionStatus } from '@api/adminHelp';
import AdminSupportSubmissionScreen from '@screens/AdminSupportSubmissionScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { submissionId: 7 } }),
}));

const mockAuthFetch = jest.fn();
jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ authFetch: mockAuthFetch }),
}));

jest.mock('@api/adminHelp', () => ({
  ...jest.requireActual('@api/adminHelp'),
  getAdminHelpSubmission: jest.fn(),
  updateAdminHelpSubmissionStatus: jest.fn(),
}));

const mockedGet = getAdminHelpSubmission as jest.Mock;
const mockedUpdate = updateAdminHelpSubmissionStatus as jest.Mock;

const submission = {
  id: 7,
  type: 'contact' as const,
  message: 'Full support message',
  urgentSafetyIssue: true,
  wantsReply: true,
  replyEmail: 'person@example.com',
  status: 'new' as const,
  createdAt: '2026-07-17T10:00:00.000Z',
  submitter: { id: 2, name: 'Person', email: 'person@example.com' },
};

describe('AdminSupportSubmissionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockResolvedValue(submission);
    mockedUpdate.mockResolvedValue({ ...submission, status: 'reviewed' });
  });

  it('shows the full message and contact details', async () => {
    const { getAllByText, getByText } = render(<AdminSupportSubmissionScreen />);

    await waitFor(() => expect(getByText('Full support message')).toBeTruthy());
    expect(getByText('Person')).toBeTruthy();
    expect(getAllByText('person@example.com')).toHaveLength(2);
    expect(getByText('Mark as reviewed')).toBeTruthy();
  });

  it('updates the status', async () => {
    const { getByText } = render(<AdminSupportSubmissionScreen />);
    await waitFor(() => expect(getByText('Mark as reviewed')).toBeTruthy());

    fireEvent.press(getByText('Mark as reviewed'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(mockAuthFetch, 7, 'reviewed');
      expect(getByText('Reviewed')).toBeTruthy();
    });
  });
});
