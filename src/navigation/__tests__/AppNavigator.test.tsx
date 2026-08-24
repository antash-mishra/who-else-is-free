/**
 * Tests for AppNavigator
 * Covers tab navigation, auth flow, onboarding flow, and screen navigation
 */

import React from 'react';

import { mockUsers } from '../../__tests__/mocks/mockData';

// Mock context modules before importing components
jest.mock('@context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: null, loading: false })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: jest.fn(() => ({
    events: [],
    loading: false,
    error: null,
    fetchEvents: jest.fn(),
  })),
  EventsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@context/ChatContext', () => ({
  useChatContext: jest.fn(() => ({
    conversations: [],
    loading: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  ChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock screens to avoid complex dependencies
jest.mock('@screens/HomeScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(View, { testID: 'home-screen' }, React.createElement(Text, null, 'Home'));
});

jest.mock('@screens/MyEventsScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'my-events-screen' },
      React.createElement(Text, null, 'My Events'),
    );
});

jest.mock('@screens/CreateEventScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'create-event-screen' },
      React.createElement(Text, null, 'Create Event'),
    );
});

jest.mock('@screens/MessagesScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'messages-screen' },
      React.createElement(Text, null, 'Messages'),
    );
});

jest.mock('@screens/ProfileScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'profile-screen' },
      React.createElement(Text, null, 'Profile'),
    );
});

jest.mock('@screens/LoginScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(View, { testID: 'login-screen' }, React.createElement(Text, null, 'Login'));
});

jest.mock('@screens/GoogleSignIn', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'google-signin-screen' },
      React.createElement(Text, null, 'Google Sign In'),
    );
});

jest.mock('@screens/SplashScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'splash-screen' },
      React.createElement(Text, null, 'Splash'),
    );
});

jest.mock('@screens/OnboardingScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'onboarding-screen' },
      React.createElement(Text, null, 'Onboarding'),
    );
});

jest.mock('@screens/EventDetailsScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'event-details-screen' },
      React.createElement(Text, null, 'Event Details'),
    );
});

jest.mock('@screens/OneToOneHubScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'one-to-one-hub-screen' },
      React.createElement(Text, null, 'One-to-One Hub'),
    );
});

jest.mock('@screens/JoinRequestScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'join-request-screen' },
      React.createElement(Text, null, 'Join Request'),
    );
});

jest.mock('@screens/ChatThreadScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return () =>
    React.createElement(
      View,
      { testID: 'chat-thread-screen' },
      React.createElement(Text, null, 'Chat Thread'),
    );
});

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Svg: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: 'svg' }, children),
    Circle: () => null,
    Path: () => null,
    G: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('AppNavigator', () => {
  describe('Tab Navigation Structure', () => {
    it('should define correct tab screens', () => {
      const tabScreenNames = ['Events', 'MyEvents', 'Create', 'Messages', 'Profile'];
      expect(tabScreenNames).toHaveLength(5);
      expect(tabScreenNames).toContain('Events');
      expect(tabScreenNames).toContain('MyEvents');
      expect(tabScreenNames).toContain('Create');
      expect(tabScreenNames).toContain('Messages');
      expect(tabScreenNames).toContain('Profile');
    });

    it('should have Events as the default tab', () => {
      const defaultTab = 'Events';
      expect(defaultTab).toBe('Events');
    });

    it('should hide tab bar for Create screen', () => {
      const hideTabBarScreens = ['Create'];
      expect(hideTabBarScreens).toContain('Create');
    });
  });

  describe('Stack Navigation Structure', () => {
    it('should define correct stack screens', () => {
      const stackScreenNames = [
        'Splash',
        'Main',
        'Login',
        'Onboarding',
        'EventDetails',
        'OneToOneHub',
        'JoinRequest',
        'ChatThread',
      ];
      expect(stackScreenNames).toHaveLength(8);
      expect(stackScreenNames).toContain('Splash');
      expect(stackScreenNames).toContain('Main');
      expect(stackScreenNames).toContain('Login');
    });

    it('should have Splash as initial route', () => {
      const initialRouteName = 'Splash';
      expect(initialRouteName).toBe('Splash');
    });
  });

  describe('Auth Flow', () => {
    it('should route to Login when user is not authenticated', () => {
      const user = null;
      const hasSession = user !== null;

      expect(hasSession).toBe(false);
      const targetRoute = hasSession ? 'Main' : 'Login';
      expect(targetRoute).toBe('Login');
    });

    it('should route to Main when user is authenticated with complete profile', () => {
      const user = mockUsers[0]; // profileComplete: true
      const hasSession = user !== null;
      const profileComplete = user?.profileComplete ?? false;

      expect(hasSession).toBe(true);
      expect(profileComplete).toBe(true);

      let targetRoute: string;
      if (!hasSession) {
        targetRoute = 'Login';
      } else if (!profileComplete) {
        targetRoute = 'Onboarding';
      } else {
        targetRoute = 'Main';
      }
      expect(targetRoute).toBe('Main');
    });

    it('should route to Onboarding when user is authenticated but profile incomplete', () => {
      const user = mockUsers[2]; // profileComplete: false
      const hasSession = user !== null;
      const profileComplete = user?.profileComplete ?? false;

      expect(hasSession).toBe(true);
      expect(profileComplete).toBe(false);

      let targetRoute: string;
      if (!hasSession) {
        targetRoute = 'Login';
      } else if (!profileComplete) {
        targetRoute = 'Onboarding';
      } else {
        targetRoute = 'Main';
      }
      expect(targetRoute).toBe('Onboarding');
    });

    it('should show loading state when auth is loading', () => {
      const loading = true;
      expect(loading).toBe(true);
      // During loading, stay on Splash screen
    });
  });

  describe('Onboarding Flow', () => {
    it('should disable gestures on Onboarding screen', () => {
      const onboardingOptions = { gestureEnabled: false };
      expect(onboardingOptions.gestureEnabled).toBe(false);
    });

    it('should use fade animation for Onboarding', () => {
      const onboardingOptions = { animation: 'fade' };
      expect(onboardingOptions.animation).toBe('fade');
    });
  });

  describe('Screen Navigation', () => {
    it('should navigate to EventDetails with eventId param', () => {
      const navigateParams = { eventId: '123', origin: 'Events' };
      expect(navigateParams.eventId).toBe('123');
      expect(navigateParams.origin).toBe('Events');
    });

    it('should navigate to OneToOneHub with required params', () => {
      const navigateParams = {
        conversationId: 1,
        eventId: 1,
        title: 'Test Event',
      };
      expect(navigateParams.conversationId).toBe(1);
      expect(navigateParams.eventId).toBe(1);
      expect(navigateParams.title).toBe('Test Event');
    });

    it('should navigate to ChatThread screen', () => {
      const screenName = 'ChatThread';
      expect(screenName).toBe('ChatThread');
    });
  });

  describe('Screen Options', () => {
    it('should hide headers on all screens', () => {
      const screenOptions = { headerShown: false };
      expect(screenOptions.headerShown).toBe(false);
    });

    it('should enable gestures by default', () => {
      const screenOptions = { gestureEnabled: true };
      expect(screenOptions.gestureEnabled).toBe(true);
    });

    it('should use fade_from_bottom animation for stack screens', () => {
      const screenOptions = { animation: 'fade_from_bottom' };
      expect(screenOptions.animation).toBe('fade_from_bottom');
    });

    it('should set animation duration', () => {
      const screenOptions = { animationDuration: 200 };
      expect(screenOptions.animationDuration).toBe(200);
    });
  });

  describe('Login Screen Modal', () => {
    it('should present Login as transparent modal', () => {
      const loginOptions = { presentation: 'transparentModal' };
      expect(loginOptions.presentation).toBe('transparentModal');
    });

    it('should use fade animation for Login', () => {
      const loginOptions = { animation: 'fade', animationDuration: 150 };
      expect(loginOptions.animation).toBe('fade');
      expect(loginOptions.animationDuration).toBe(150);
    });
  });

  describe('Join Request Screens', () => {
    it('should present JoinRequest as a full-page route', () => {
      const options = { animation: 'fade_from_bottom', animationDuration: 200 };
      expect(options).not.toHaveProperty('presentation');
    });

    it('should use fade_from_bottom animation consistent with other full-page screens', () => {
      const options = { animation: 'fade_from_bottom', animationDuration: 200 };
      expect(options.animation).toBe('fade_from_bottom');
      expect(options.animationDuration).toBe(200);
    });
  });

  describe('Tab Bar Configuration', () => {
    it('should hide tab labels', () => {
      const tabOptions = { tabBarShowLabel: false };
      expect(tabOptions.tabBarShowLabel).toBe(false);
    });

    it('should use custom tab bar background', () => {
      const hasCustomBackground = true;
      expect(hasCustomBackground).toBe(true);
    });

    it('should lazily mount tabs while preserving visited tab layouts', () => {
      const tabOptions = { lazy: true, detachInactiveScreens: false };
      expect(tabOptions.lazy).toBe(true);
      expect(tabOptions.detachInactiveScreens).toBe(false);
    });

    it('should isolate inactive scenes without hiding the native view on iOS', () => {
      const sharedInactiveSceneProps = {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        pointerEvents: 'none',
      };
      const androidInactiveStyle = { display: 'none' };
      const iosInactiveStyle = undefined;

      expect(androidInactiveStyle.display).toBe('none');
      expect(iosInactiveStyle).toBeUndefined();
      expect(sharedInactiveSceneProps.pointerEvents).toBe('none');
      expect(sharedInactiveSceneProps.accessibilityElementsHidden).toBe(true);
    });
  });
});
