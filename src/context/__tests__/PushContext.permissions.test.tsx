import React from 'react';

import { PermissionsAndroid, Platform } from 'react-native';

import { act, render } from '@testing-library/react-native';

import { PushProvider, usePush } from '../PushContext';

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null }),
}));
jest.mock('@context/ChatContext', () => ({
  useChat: () => ({ activeConversationId: null, setActiveConversation: jest.fn() }),
}));
jest.mock('@context/NotificationsContext', () => ({
  useNotifications: () => ({ refreshUnreadCount: jest.fn().mockResolvedValue(undefined) }),
}));

describe('PushContext notification permission', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  let requestPushPermission: (() => Promise<boolean>) | undefined;

  const CapturePermissionAction = () => {
    requestPushPermission = usePush().requestPushPermission;
    return null;
  };

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: 36 });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: originalVersion });
    requestPushPermission = undefined;
  });

  it('remembers an Android denial instead of showing the system prompt again', async () => {
    render(
      <PushProvider>
        <CapturePermissionAction />
      </PushProvider>,
    );

    await act(async () => {
      await requestPushPermission?.();
      await requestPushPermission?.();
    });

    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
  });
});
