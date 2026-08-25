import React from 'react';

import { Text } from 'react-native';

import { render, waitFor } from '@testing-library/react-native';

import { requestJson } from '@api/client';
import { NotificationsProvider, useNotifications } from '@context/NotificationsContext';

jest.mock('@api/client', () => ({
  requestJson: jest.fn(),
}));

const mockUser = { id: 1, email: 'tester@example.com', name: 'Tester' };

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: 'token',
  }),
}));

jest.mock('@services/logger', () => ({
  logger: { warn: jest.fn() },
}));

const ErrorConsumer = () => {
  const { error } = useNotifications();
  return <Text testID="notification-error">{error ?? 'none'}</Text>;
};

describe('NotificationsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never exposes raw network error text to the notification screen', async () => {
    (requestJson as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { getByTestId } = render(
      <NotificationsProvider>
        <ErrorConsumer />
      </NotificationsProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('notification-error').props.children).toBe('Failed to load notifications');
    });
  });
});
