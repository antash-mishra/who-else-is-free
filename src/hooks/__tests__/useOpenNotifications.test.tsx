import React from 'react';

import { Pressable, Text } from 'react-native';

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useOpenNotifications } from '@hooks/useOpenNotifications';

const mockSetActiveConversation = jest.fn();
const mockApplyActionResolution = jest.fn();
const mockResolveNotificationAction = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ token: 'auth-token' }),
}));

jest.mock('@context/ChatContext', () => ({
  useChat: () => ({ setActiveConversation: mockSetActiveConversation }),
}));

jest.mock('@context/NotificationsContext', () => ({
  useNotifications: () => ({ applyActionResolution: mockApplyActionResolution }),
}));

jest.mock('@api/notifications', () => ({
  ...jest.requireActual('@api/notifications'),
  resolveNotificationAction: (...args: unknown[]) => mockResolveNotificationAction(...args),
}));

jest.mock('@navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

jest.mock('@services/logger', () => ({
  logger: { warn: jest.fn() },
}));

const Harness = ({ ids }: { ids: number[] }) => {
  const { openNotificationIDs, resolvingIDs, openError, clearOpenError } = useOpenNotifications();
  return (
    <>
      <Pressable testID="open" onPress={() => openNotificationIDs(ids).catch(() => undefined)} />
      <Pressable testID="clear" onPress={clearOpenError} />
      <Text testID="resolving">{[...resolvingIDs].join(',')}</Text>
      <Text testID="error">{openError ? 'error' : 'ok'}</Text>
    </>
  );
};

describe('useOpenNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves through the server boundary, navigates, and mirrors the resolution', async () => {
    mockResolveNotificationAction.mockResolvedValue({
      status: 'active',
      destination: 'chat',
      conversation_id: 10,
    });
    const { getByTestId } = render(<Harness ids={[5]} />);

    await act(async () => {
      fireEvent.press(getByTestId('open'));
    });

    expect(mockResolveNotificationAction).toHaveBeenCalledWith('auth-token', {
      notification_ids: [5],
      mark_handled: true,
    });
    expect(mockSetActiveConversation).toHaveBeenCalledWith(10);
    expect(mockNavigate).toHaveBeenCalledWith('ChatThread');
    expect(mockApplyActionResolution).toHaveBeenCalledWith([5], {
      status: 'active',
      destination: 'chat',
      conversation_id: 10,
    });
    await waitFor(() => {
      expect(getByTestId('resolving').props.children).toBe('');
    });
    expect(getByTestId('error').props.children).toBe('ok');
  });

  it('surfaces an error flag when resolution fails and lets callers clear it', async () => {
    mockResolveNotificationAction.mockRejectedValue(new Error('boom'));
    const { getByTestId } = render(<Harness ids={[5]} />);

    await act(async () => {
      fireEvent.press(getByTestId('open'));
    });

    expect(mockApplyActionResolution).not.toHaveBeenCalled();
    expect(getByTestId('error').props.children).toBe('error');

    act(() => {
      fireEvent.press(getByTestId('clear'));
    });
    expect(getByTestId('error').props.children).toBe('ok');
  });

  it('ignores empty id lists', async () => {
    const { getByTestId } = render(<Harness ids={[]} />);
    await act(async () => {
      fireEvent.press(getByTestId('open'));
    });
    expect(mockResolveNotificationAction).not.toHaveBeenCalled();
  });
});
