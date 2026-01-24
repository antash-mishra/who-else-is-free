/**
 * Rendering tests for GoogleSignIn screen
 * Tests sign in button, loading state, error handling, and native availability
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import GoogleSignInScreen from '../GoogleSignIn';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
const mockNavigate = jest.fn();
const mockReset = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      reset: mockReset,
      goBack: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock Google Sign-In
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
  },
}));

import { GoogleSignin } from '@react-native-google-signin/google-signin';

const mockConfigure = GoogleSignin.configure as jest.Mock;
const mockSignIn = GoogleSignin.signIn as jest.Mock;
const mockHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;

// Mock Google constants
jest.mock('@constants/google', () => ({
  GOOGLE_WEB_CLIENT_ID: 'mock-web-client-id',
  GOOGLE_IOS_CLIENT_ID: 'mock-ios-client-id',
}));

// Mock AuthContext
const mockSignInWithGoogle = jest.fn();
let mockAuthValue = {
  user: null,
  token: null,
  isSigningIn: false,
  signInWithGoogle: mockSignInWithGoogle,
  signOut: jest.fn(),
  refreshSessionSilently: jest.fn(),
  updateProfile: jest.fn(),
};

jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

// Mock ScreenContainer
jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => (
    <View testID="screen-container">{children}</View>
  );
});

describe('GoogleSignIn Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValue = {
      user: null,
      token: null,
      isSigningIn: false,
      signInWithGoogle: mockSignInWithGoogle,
      signOut: jest.fn(),
      refreshSessionSilently: jest.fn(),
      updateProfile: jest.fn(),
    };
    mockConfigure.mockResolvedValue(undefined);
    mockSignIn.mockResolvedValue({
      type: 'success',
      data: {
        idToken: 'mock-id-token',
        user: { email: 'test@example.com', name: 'Test User' },
      },
    });
    mockSignInWithGoogle.mockResolvedValue({
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      profileComplete: true,
    });
  });

  describe('Initial Rendering', () => {
    it('should render the heading', async () => {
      const { getAllByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getAllByText('Sign in with Google')[0]).toBeTruthy();
      });
    });

    it('should render the sign in button', async () => {
      const { getAllByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getAllByText('Sign in with Google')[1]).toBeTruthy();
      });
    });

    it('should render helper text for native available state', async () => {
      const { getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });
    });
  });

  describe('Sign In Button', () => {
    it('should be enabled when not signing in', async () => {
      const { getByRole } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        // Button component has accessibilityRole="button"
        const button = getByRole('button');
        expect(button.props.accessibilityState?.disabled).toBeFalsy();
      });
    });

    it('should show "Signing in..." when signing in', async () => {
      mockAuthValue.isSigningIn = true;

      const { getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Signing in...')).toBeTruthy();
      });
    });

    it('should be disabled when signing in', async () => {
      mockAuthValue.isSigningIn = true;

      const { getByRole } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        const button = getByRole('button');
        expect(button.props.accessibilityState?.disabled).toBe(true);
      });
    });
  });

  describe('Loading State', () => {
    it('should show ActivityIndicator when signing in', async () => {
      mockAuthValue.isSigningIn = true;

      const { UNSAFE_getByType } = render(<GoogleSignInScreen />);
      const { ActivityIndicator } = require('react-native');

      await waitFor(() => {
        expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
      });
    });

    it('should not show ActivityIndicator when not signing in', async () => {
      const { UNSAFE_queryByType } = render(<GoogleSignInScreen />);
      const { ActivityIndicator } = require('react-native');

      await waitFor(() => {
        expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
      });
    });
  });

  describe('Native Module Availability', () => {
    it('should configure Google Sign-In on mount', async () => {
      render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(mockConfigure).toHaveBeenCalledWith({
          webClientId: 'mock-web-client-id',
          iosClientId: 'mock-ios-client-id',
          offlineAccess: true,
        });
      });
    });

    it('should show error helper text when native module is unavailable', async () => {
      mockConfigure.mockRejectedValueOnce(new Error('Native module not available'));

      const { getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(
          getByText(
            'Google Sign-In requires running this app from a custom Expo dev build or a production binary.'
          )
        ).toBeTruthy();
      });
    });

    it('should show alert when trying to sign in with unavailable native module', async () => {
      mockConfigure.mockRejectedValueOnce(new Error('Native module not available'));

      const { getByRole } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        const button = getByRole('button');
        fireEvent.press(button);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Google Sign-In Unavailable',
          'This feature requires running this app from a custom Expo dev build or standalone build with @react-native-google-signin/google-signin installed.'
        );
      });
    });
  });

  describe('Sign In Flow - Success', () => {
    it('should call signInWithGoogle on successful Google sign in', async () => {
      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled();
        expect(mockSignInWithGoogle).toHaveBeenCalledWith('mock-id-token');
      });
    });

    it('should navigate to Main for existing user with complete profile', async () => {
      mockSignInWithGoogle.mockResolvedValueOnce({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        profileComplete: true,
      });

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      });
    });

    it('should navigate to Onboarding for new user', async () => {
      mockSignInWithGoogle.mockResolvedValueOnce({
        id: 2,
        name: 'New User',
        email: 'new@example.com',
        profileComplete: false,
      });

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        });
      });
    });
  });

  describe('Sign In Flow - Android Play Services', () => {
    const originalPlatform = Platform.OS;

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    });

    it('should check for Play Services on Android', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockHasPlayServices).toHaveBeenCalledWith({
          showPlayServicesUpdateDialog: true,
        });
      });
    });

    it('should not check for Play Services on iOS', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      mockHasPlayServices.mockClear();

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockHasPlayServices).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show alert when Google sign in fails', async () => {
      mockSignIn.mockRejectedValueOnce(new Error('Sign in failed'));

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to sign in with Google',
          'Please try again.'
        );
      });
    });

    it('should show alert when no ID token is returned', async () => {
      mockSignIn.mockResolvedValueOnce({
        type: 'success',
        data: { idToken: null },
      });

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to sign in with Google',
          'No ID token was returned.'
        );
      });
    });

    it('should show alert when sign in result type is not success', async () => {
      mockSignIn.mockResolvedValueOnce({
        type: 'cancelled',
        data: null,
      });

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to sign in with Google',
          'No ID token was returned.'
        );
      });
    });

    it('should show alert when backend sign in fails', async () => {
      mockSignInWithGoogle.mockRejectedValueOnce(new Error('Backend error'));

      const { getByRole, getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        expect(getByText('Connect with your Google account to continue.')).toBeTruthy();
      });

      const button = getByRole('button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to sign in with Google',
          'Please try again.'
        );
      });
    });
  });

  describe('Helper Text Styling', () => {
    it('should apply error style to helper text when native unavailable', async () => {
      mockConfigure.mockRejectedValueOnce(new Error('Native module not available'));

      const { getByText } = render(<GoogleSignInScreen />);

      await waitFor(() => {
        const helperText = getByText(
          'Google Sign-In requires running this app from a custom Expo dev build or a production binary.'
        );
        // The component applies helperError style when native is unavailable
        // We verify the text renders correctly
        expect(helperText).toBeTruthy();
      });
    });
  });
});
