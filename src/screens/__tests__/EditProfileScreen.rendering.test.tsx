import React from 'react';

import { Alert, View } from 'react-native';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockUpdateProfile = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockLoggerWarn = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@services/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockLoggerWarn(...args) },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: mockRequestMediaLibraryPermissionsAsync,
  launchImageLibraryAsync: mockLaunchImageLibraryAsync,
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
}));

jest.mock('@components/ScreenContainer', () => ({ children }: { children: React.ReactNode }) => (
  <View>{children}</View>
));

jest.mock('@components/ScreenHeader', () => () => null);
jest.mock('@components/AvatarBackground', () => () => null);
jest.mock('@components/UserAvatar', () => () => <View />);

import EditProfileScreen from '@screens/EditProfileScreen';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const user = {
  id: 1,
  name: 'Ava Test',
  email: 'ava@example.test',
  gender: 'Female' as const,
  age: 30,
  profileComplete: true,
};

describe('EditProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user, updateProfile: mockUpdateProfile });
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true });
  });

  it('labels the avatar action as Add photo or Change photo based on avatar state', () => {
    const withoutAvatar = render(<EditProfileScreen />);
    expect(withoutAvatar.getByLabelText('Add photo')).toBeTruthy();
    withoutAvatar.unmount();

    mockUseAuth.mockReturnValue({
      user: { ...user, avatar: 'avatar-data' },
      updateProfile: mockUpdateProfile,
    });
    const withAvatar = render(<EditProfileScreen />);
    expect(withAvatar.getByLabelText('Change photo')).toBeTruthy();
  });

  it('shows the revised photo permission copy', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    const { getByLabelText } = render(<EditProfileScreen />);

    fireEvent.press(getByLabelText('Add photo'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Photo access needed',
        'Allow photo access to add a profile picture.',
      );
    });
  });

  it('logs save failures and hides the raw error from users', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('private profile failure'));
    const { getByPlaceholderText, getByText, queryByText } = render(<EditProfileScreen />);

    fireEvent.changeText(getByPlaceholderText('Your name'), 'Ava Updated');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't save your changes",
        'Something went wrong on our end. Please try again.',
      );
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Profile update failed:',
      'private profile failure',
    );
    expect(queryByText('private profile failure')).toBeNull();
  });
});
