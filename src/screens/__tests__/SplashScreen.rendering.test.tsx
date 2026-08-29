/**
 * Rendering tests for SplashScreen
 * Tests the current image splash, native hide timing, bloom handoff, and routing.
 */

import React from 'react';

import { Animated, Image, Text } from 'react-native';

import { act, render, waitFor } from '@testing-library/react-native';

import SplashScreen, { SPLASH_VARIANTS, splashCaptionBottom } from '../SplashScreen';

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

const mockHideAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  get hideAsync() {
    return mockHideAsync;
  },
}));

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

jest.mock('@assets/weif/splash-logo.svg', () => {
  const React = require('react');
  const { View } = require('react-native');

  return ({ width, height }: { width: number; height: number }) => (
    <View testID="splash-logo" style={{ width, height }} />
  );
});

const mockBloom = jest.fn((onPeak: () => void) => onPeak());
const mockSignalReady = jest.fn();
jest.mock('@context/BloomContext', () => ({
  useBloom: () => ({
    bloom: mockBloom,
    signalReady: mockSignalReady,
  }),
}));

let mockUser: {
  id: number;
  name: string;
  email: string;
  profileComplete: boolean;
} | null = null;

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

const advanceTimers = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const renderReadySplash = async () => {
  const view = render(<SplashScreen />);
  const container = view.getByTestId('splash-container');

  await act(async () => {
    container.props.onLayout?.();
  });
  await advanceTimers(50);

  return { ...view, container };
};

describe('SplashScreen Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUser = null;
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Rendering', () => {
    it('renders the splash container, image, logo, tagline, and location', () => {
      const { getByTestId, getByText, UNSAFE_getByType, UNSAFE_getAllByType } = render(
        <SplashScreen />,
      );

      expect(getByTestId('splash-container')).toBeTruthy();
      expect(getByTestId('splash-logo')).toBeTruthy();
      expect(getByText('Who Else Is Free')).toBeTruthy();
      // One of the rotating venue captions is shown (chosen at random per launch).
      const texts = UNSAFE_getAllByType(Text);
      const locationText = texts.find((node) => node.props.testID === 'splash-location');
      expect(locationText).toBeTruthy();
      expect(
        SPLASH_VARIANTS.some((variant) => variant.location === locationText?.props.children),
      ).toBe(true);
      expect(UNSAFE_getByType(Image).props.resizeMode).toBe('cover');
    });

    it('exposes an accessibility label on the root and hides the venue caption', () => {
      const { getByTestId, UNSAFE_getAllByType } = render(<SplashScreen />);

      const container = getByTestId('splash-container');
      expect(container.props.accessibilityLabel).toBe('Who Else Is Free');
      expect(container.props.accessibilityRole).toBe('image');
      expect(container.props.accessible).toBe(true);

      const texts = UNSAFE_getAllByType(Text);
      const locationText = texts.find((node) => node.props.accessible === false);
      expect(locationText).toBeTruthy();
      expect(locationText?.props.importantForAccessibility).toBe('no-hide-descendants');
      // The tagline remains accessible (not marked decorative).
      const tagline = texts.find((node) => node.props.children === 'Who Else Is Free');
      expect(tagline?.props.accessible).not.toBe(false);
    });

    it('renders the logo with the current dimensions', () => {
      const { getByTestId } = render(<SplashScreen />);
      const logo = getByTestId('splash-logo');

      expect(logo.props.style).toEqual({ width: 184, height: 67 });
    });

    it('keeps the venue caption above the Android bottom safe area', () => {
      expect(splashCaptionBottom(24)).toBe(40);
      expect(splashCaptionBottom(0)).toBe(16);
    });
  });

  describe('Venue Rotation', () => {
    it('never shows the venue stored from the previous launch', async () => {
      // Stored index 0 = Vicar Street; the next launch must pick another venue.
      mockGetItemAsync.mockResolvedValue('0');

      const { UNSAFE_getAllByType } = await renderReadySplash();

      const texts = UNSAFE_getAllByType(Text);
      const locationText = texts.find((node) => node.props.testID === 'splash-location');
      expect(locationText?.props.children).not.toBe(SPLASH_VARIANTS[0].location);
    });

    it('persists the chosen index for the next launch', async () => {
      mockGetItemAsync.mockResolvedValue('0');

      await renderReadySplash();

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'whoelseisfree.splashIndex',
        expect.not.stringMatching(/^0$/),
      );
    });

    it('falls back to a random venue on first launch (no stored index)', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const { UNSAFE_getAllByType } = await renderReadySplash();

      const texts = UNSAFE_getAllByType(Text);
      const locationText = texts.find((node) => node.props.testID === 'splash-location');
      expect(locationText).toBeTruthy();
      expect(
        SPLASH_VARIANTS.some((variant) => variant.location === locationText?.props.children),
      ).toBe(true);
    });
  });

  describe('Hide Native Splash', () => {
    it('calls hideAsync after layout and the 50ms handoff delay', async () => {
      await renderReadySplash();

      await waitFor(() => {
        expect(mockHideAsync).toHaveBeenCalledTimes(1);
      });
    });

    it('only calls hideAsync once', async () => {
      const { container } = await renderReadySplash();

      await act(async () => {
        container.props.onLayout?.();
      });
      await advanceTimers(50);

      expect(mockHideAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation After Load', () => {
    it('resets to Main when there is no user', async () => {
      mockUser = null;
      await renderReadySplash();

      await advanceTimers(1600);
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    });

    it('resets to Main for a user with a complete profile', async () => {
      mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        profileComplete: true,
      };

      await renderReadySplash();
      await advanceTimers(1600);

      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    });

    it('resets to Onboarding for a user with an incomplete profile', async () => {
      mockUser = {
        id: 2,
        name: 'New User',
        email: 'new@example.com',
        profileComplete: false,
      };

      await renderReadySplash();
      await advanceTimers(1600);

      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Onboarding' }],
      });
    });
  });

  describe('Bloom Handoff', () => {
    it('starts the bloom with the logo transition', async () => {
      await renderReadySplash();

      // renderReadySplash already advances 50ms after the sequence timer starts.
      await advanceTimers(1549);
      expect(mockBloom).not.toHaveBeenCalled();

      await advanceTimers(1);
      expect(mockBloom).toHaveBeenCalledTimes(1);
      expect(mockBloom).toHaveBeenCalledWith(expect.any(Function));
    });

    it('signals ready for onboarding after navigation reset', async () => {
      mockUser = {
        id: 2,
        name: 'New User',
        email: 'new@example.com',
        profileComplete: false,
      };

      await renderReadySplash();
      await advanceTimers(1600);
      expect(mockSignalReady).toHaveBeenCalledTimes(1);
    });

    it('does not signal ready when routing to Main', async () => {
      await renderReadySplash();
      await advanceTimers(1600);

      expect(mockSignalReady).not.toHaveBeenCalled();
    });
  });

  describe('Logo Animation', () => {
    it('scales the logo during the transition', async () => {
      const animatedTimingSpy = jest.spyOn(Animated, 'timing');

      await renderReadySplash();
      await advanceTimers(1600);

      expect(animatedTimingSpy).toHaveBeenCalledWith(expect.any(Object), {
        toValue: 1.08,
        duration: 300,
        easing: expect.any(Function),
        useNativeDriver: true,
      });
      expect(animatedTimingSpy).toHaveBeenCalledWith(expect.any(Object), {
        toValue: 0,
        duration: 300,
        easing: expect.any(Function),
        useNativeDriver: true,
      });

      animatedTimingSpy.mockRestore();
    });
  });

  describe('Splash Duration', () => {
    it('waits 1600ms before starting navigation', async () => {
      await renderReadySplash();

      // renderReadySplash already advances 50ms after the sequence timer starts.
      await advanceTimers(1549);
      expect(mockReset).not.toHaveBeenCalled();

      await advanceTimers(1);
      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('Layout Not Ready', () => {
    it('does not start the splash sequence until layout is ready', async () => {
      render(<SplashScreen />);

      await advanceTimers(5000);

      expect(mockReset).not.toHaveBeenCalled();
      expect(mockHideAsync).not.toHaveBeenCalled();
    });
  });
});
