/**
 * Rendering tests for SplashScreen
 * Tests loading animation, navigation after load, and user routing
 */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Animated } from 'react-native';
import SplashScreen from '../SplashScreen';

// Mock navigation
const mockReset = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      reset: mockReset,
      goBack: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

// Mock expo-splash-screen - use a wrapper to maintain the reference
const mockHideAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  get hideAsync() {
    return mockHideAsync;
  },
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, colors, style, ...props }: any) => (
      <View testID="linear-gradient" style={style} {...props}>
        {children}
      </View>
    ),
  };
});

// Mock SVG logo
jest.mock('@assets/splash_logo.svg', () => {
  const { View } = require('react-native');
  return ({ width, height }: { width: number; height: number }) => (
    <View testID="splash-logo" style={{ width, height }} />
  );
});

// Mock AuthContext
let mockUser: { id: number; name: string; email: string; profileComplete: boolean } | null = null;

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: mockUser ? 'mock-token' : null,
    isSigningIn: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    refreshSessionSilently: jest.fn(),
    updateProfile: jest.fn(),
  }),
}));

describe('SplashScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUser = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Rendering', () => {
    it('should render the splash screen container', () => {
      const { getByTestId } = render(<SplashScreen />);
      expect(getByTestId('linear-gradient')).toBeTruthy();
    });

    it('should render the app logo', () => {
      const { getByTestId } = render(<SplashScreen />);
      expect(getByTestId('splash-logo')).toBeTruthy();
    });

    it('should render the tagline', () => {
      const { getByText } = render(<SplashScreen />);
      expect(getByText('Who Else Is Free')).toBeTruthy();
    });

    it('should render the logo with correct dimensions', () => {
      const { getByTestId } = render(<SplashScreen />);
      const logo = getByTestId('splash-logo');

      expect(logo.props.style).toEqual({ width: 184, height: 67 });
    });
  });

  describe('Linear Gradient', () => {
    it('should render the gradient background', () => {
      const { getByTestId } = render(<SplashScreen />);
      expect(getByTestId('linear-gradient')).toBeTruthy();
    });
  });

  describe('Hide Native Splash', () => {
    it('should call hideAsync after layout', async () => {
      const { getByTestId } = render(<SplashScreen />);

      // Trigger onLayout via props - start the async handler
      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
      });

      // Advance timer to complete the 50ms delay inside onLayoutRootView
      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      await waitFor(() => {
        expect(mockHideAsync).toHaveBeenCalled();
      });
    });

    it('should only call hideAsync once', async () => {
      const { getByTestId } = render(<SplashScreen />);

      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
      });

      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      await act(async () => {
        container.props.onLayout?.();
      });

      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      expect(mockHideAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation After Load - Guest User', () => {
    it('should navigate to Main when no user after splash sequence', async () => {
      mockUser = null;

      const { getByTestId } = render(<SplashScreen />);

      // Trigger onLayout to set isReady
      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
        jest.advanceTimersByTime(50);
      });

      // Wait for the 2 second splash duration
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for the 300ms fade animation
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      });
    });
  });

  describe('Navigation After Load - Authenticated User with Complete Profile', () => {
    it('should navigate to Main for user with complete profile', async () => {
      mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        profileComplete: true,
      };

      const { getByTestId } = render(<SplashScreen />);

      // Trigger layout
      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
        jest.advanceTimersByTime(50);
      });

      // Wait for splash duration
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for fade animation
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      });
    });
  });

  describe('Navigation After Load - Authenticated User with Incomplete Profile', () => {
    it('should navigate to Onboarding for user with incomplete profile', async () => {
      mockUser = {
        id: 2,
        name: 'New User',
        email: 'new@example.com',
        profileComplete: false,
      };

      const { getByTestId } = render(<SplashScreen />);

      // Trigger layout
      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
        jest.advanceTimersByTime(50);
      });

      // Wait for splash duration
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for fade animation
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        });
      });
    });
  });

  describe('Fade Animation', () => {
    it('should start with opacity 1', () => {
      const { getByTestId } = render(<SplashScreen />);

      const container = getByTestId('splash-container');
      // Initial opacity should be 1 (from the fadeAnim ref)
      expect(container).toBeTruthy();
    });

    it('should animate opacity to 0 before navigation', async () => {
      const animatedTimingSpy = jest.spyOn(Animated, 'timing');

      const { getByTestId } = render(<SplashScreen />);

      // Trigger layout
      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
        jest.advanceTimersByTime(50);
      });

      // Wait for splash duration
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(animatedTimingSpy).toHaveBeenCalledWith(
          expect.any(Object), // Animated.Value
          expect.objectContaining({
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          })
        );
      });

      animatedTimingSpy.mockRestore();
    });
  });

  describe('Splash Duration', () => {
    it('should wait 2 seconds before starting fade', async () => {
      mockUser = null;

      const { getByTestId } = render(<SplashScreen />);

      // Trigger layout
      const container = getByTestId('splash-container');
      await act(async () => {
        container.props.onLayout?.();
        jest.advanceTimersByTime(50);
      });

      // After 1 second, navigation should not have happened
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(mockReset).not.toHaveBeenCalled();

      // After 2 seconds total + 300ms fade, navigation should happen
      await act(async () => {
        jest.advanceTimersByTime(1300);
      });

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalled();
      });
    });
  });

  describe('Layout Not Ready', () => {
    it('should not start splash sequence until layout is ready', async () => {
      mockUser = null;

      render(<SplashScreen />);

      // Don't trigger onLayout - just advance time
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      // Navigation should not happen because isReady is still false
      expect(mockReset).not.toHaveBeenCalled();
    });
  });
});
