/**
 * Module mocks for Jest tests
 */

// Mock expo-secure-store
const secureStoreStorage = new Map<string, string>();

const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
  return secureStoreStorage.get(key) ?? null;
});

const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  secureStoreStorage.set(key, value);
});

const deleteItemAsync = jest.fn(async (key: string): Promise<void> => {
  secureStoreStorage.delete(key);
});

export const mockSecureStore = {
  storage: secureStoreStorage,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  reset: (): void => {
    secureStoreStorage.clear();
    getItemAsync.mockClear();
    setItemAsync.mockClear();
    deleteItemAsync.mockClear();
  },
};

jest.mock('expo-secure-store', () => mockSecureStore);

// Mock @react-native-google-signin/google-signin
export const mockGoogleSignIn = {
  GoogleSignin: {
    configure: jest.fn(),
    signIn: jest.fn(),
    signInSilently: jest.fn(),
    signOut: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn().mockReturnValue(null),
    isSignedIn: jest.fn().mockResolvedValue(false),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
};

jest.mock('@react-native-google-signin/google-signin', () => mockGoogleSignIn);

// Mock Skia canvas components used by animation-only overlays
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');

  const SkiaView = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);

  return {
    Canvas: SkiaView,
    Circle: SkiaView,
    Group: SkiaView,
    Rect: SkiaView,
  };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');

  const makeGesture = () => {
    const gesture: Record<string, jest.Mock> = {};
    const chain = () => gesture;

    [
      'activeOffsetX',
      'activeOffsetY',
      'enabled',
      'failOffsetX',
      'failOffsetY',
      'maxPointers',
      'minDistance',
      'onBegin',
      'onChange',
      'onEnd',
      'onFinalize',
      'onStart',
      'onUpdate',
      'runOnJS',
      'simultaneousWithExternalGesture',
    ].forEach((method) => {
      gesture[method] = jest.fn(chain);
    });

    return gesture;
  };

  return {
    Directions: {},
    FlingGestureHandler: View,
    Gesture: {
      Fling: jest.fn(makeGesture),
      LongPress: jest.fn(makeGesture),
      Manual: jest.fn(makeGesture),
      Native: jest.fn(makeGesture),
      Pan: jest.fn(makeGesture),
      Pinch: jest.fn(makeGesture),
      Race: jest.fn((...gestures: unknown[]) => gestures[0] ?? makeGesture()),
      Simultaneous: jest.fn((...gestures: unknown[]) => gestures[0] ?? makeGesture()),
      Tap: jest.fn(makeGesture),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    PanGestureHandler: View,
    State: {},
    Swipeable: View,
    TouchableOpacity: View,
  };
});

// Mock expo-apple-authentication
export const mockAppleAuthentication = {
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: {
    FULL_NAME: 'FULL_NAME',
    EMAIL: 'EMAIL',
  },
};

jest.mock('expo-apple-authentication', () => mockAppleAuthentication, { virtual: true });

// Mock expo-haptics
export const mockHaptics = {
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Warning: 'Warning',
    Error: 'Error',
  },
};

jest.mock('expo-haptics', () => mockHaptics);

// Mock Firebase Analytics
export const mockFirebaseAnalytics = {
  logEvent: jest.fn().mockResolvedValue(undefined),
  setDefaultEventParameters: jest.fn().mockResolvedValue(undefined),
};

export const mockFirebaseAnalyticsModule = {
  getAnalytics: jest.fn(() => mockFirebaseAnalytics),
  logEvent: jest.fn(
    (
      analyticsInstance: typeof mockFirebaseAnalytics,
      eventName: string,
      params?: Record<string, unknown>,
    ) => analyticsInstance.logEvent(eventName, params),
  ),
  setDefaultEventParameters: jest.fn(
    (
      analyticsInstance: typeof mockFirebaseAnalytics,
      params?: Record<string, unknown>,
    ) => analyticsInstance.setDefaultEventParameters(params),
  ),
};

jest.mock('@react-native-firebase/analytics', () => {
  const analytics = jest.fn(() => mockFirebaseAnalytics);
  return {
    __esModule: true,
    ...mockFirebaseAnalyticsModule,
    default: analytics,
  };
});

// Mock Firebase Messaging
export const mockFirebaseMessaging = {
  getInitialNotification: jest.fn().mockResolvedValue(null),
  getToken: jest.fn().mockResolvedValue('mock-fcm-token'),
  hasPermission: jest.fn().mockResolvedValue(1),
  isDeviceRegisteredForRemoteMessages: true,
  onMessage: jest.fn((_listener: (remoteMessage: unknown) => unknown) => jest.fn()),
  onNotificationOpenedApp: jest.fn(
    (_listener: (remoteMessage: unknown) => unknown) => jest.fn(),
  ),
  onTokenRefresh: jest.fn((_listener: (token: string) => unknown) => jest.fn()),
  registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(undefined),
  requestPermission: jest.fn().mockResolvedValue(1),
  setBadgeCount: jest.fn().mockResolvedValue(undefined),
};

export const mockFirebaseMessagingModule = {
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  },
  getInitialNotification: jest.fn((messagingInstance: typeof mockFirebaseMessaging) =>
    messagingInstance.getInitialNotification(),
  ),
  getMessaging: jest.fn(() => mockFirebaseMessaging),
  getToken: jest.fn((messagingInstance: typeof mockFirebaseMessaging) =>
    messagingInstance.getToken(),
  ),
  hasPermission: jest.fn((messagingInstance: typeof mockFirebaseMessaging) =>
    messagingInstance.hasPermission(),
  ),
  isDeviceRegisteredForRemoteMessages: jest.fn(
    (messagingInstance: typeof mockFirebaseMessaging) =>
      messagingInstance.isDeviceRegisteredForRemoteMessages,
  ),
  onMessage: jest.fn(
    (
      messagingInstance: typeof mockFirebaseMessaging,
      listener: (remoteMessage: unknown) => unknown,
    ) => messagingInstance.onMessage(listener),
  ),
  onNotificationOpenedApp: jest.fn(
    (
      messagingInstance: typeof mockFirebaseMessaging,
      listener: (remoteMessage: unknown) => unknown,
    ) => messagingInstance.onNotificationOpenedApp(listener),
  ),
  onTokenRefresh: jest.fn(
    (
      messagingInstance: typeof mockFirebaseMessaging,
      listener: (token: string) => unknown,
    ) => messagingInstance.onTokenRefresh(listener),
  ),
  registerDeviceForRemoteMessages: jest.fn(
    (messagingInstance: typeof mockFirebaseMessaging) =>
      messagingInstance.registerDeviceForRemoteMessages(),
  ),
  requestPermission: jest.fn((messagingInstance: typeof mockFirebaseMessaging) =>
    messagingInstance.requestPermission(),
  ),
};

jest.mock('@react-native-firebase/messaging', () => {
  const messaging = jest.fn(() => mockFirebaseMessaging);
  return {
    __esModule: true,
    ...mockFirebaseMessagingModule,
    default: messaging,
  };
});

// Mock @expo/vector-icons (avoid loading font files in Jest)
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }: { name?: string }) =>
    React.createElement(Text, props, name ?? 'icon');
  return { Feather: Icon };
});

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: { hostUri: 'localhost:19000' },
  manifest2: { extra: { expoClientHost: 'localhost:19000' } },
  manifest: { debuggerHost: 'localhost:19000' },
}));

jest.mock('expo-updates', () => ({
  channel: 'test',
}));

// Mock SVG components
export const MockSvgComponent = ({ testID, ...props }: { testID?: string; [key: string]: any }) => {
  const React = require('react');
  const { View } = require('react-native');
  return React.createElement(View, { testID: testID || 'svg-mock', ...props });
};

// Mock react-navigation
export const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  getParent: jest.fn(() => null),
  getState: jest.fn(() => ({ routes: [], index: 0 })),
  dispatch: jest.fn(),
  setParams: jest.fn(),
};

export const mockRoute = {
  key: 'test-key',
  name: 'TestScreen',
  params: {},
};

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => mockNavigation,
    useRoute: () => mockRoute,
    useFocusEffect: jest.fn((callback) => {
      callback();
    }),
    useIsFocused: jest.fn(() => true),
  };
});

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView } = require('react-native');
  const createAnimatedComponent = (Component: React.ComponentType<any>) => Component;
  const runAnimation = (value: unknown, callback?: (finished?: boolean) => void) => {
    callback?.(true);
    return value;
  };
  // Layout-animation builders are chainable: every method returns the builder.
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    [
      'delay',
      'duration',
      'springify',
      'damping',
      'stiffness',
      'easing',
      'withInitialValues',
      'randomDelay',
      'reduceMotion',
      'build',
    ].forEach((method) => {
      builder[method] = () => builder;
    });
    return builder;
  };

  return {
    __esModule: true,
    default: {
      View,
      Text,
      ScrollView,
      createAnimatedComponent,
      call: jest.fn(),
    },
    View,
    Text,
    ScrollView,
    createAnimatedComponent,
    makeMutable: (value: unknown) => ({ value }),
    useSharedValue: (value: unknown) => ({ value }),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useAnimatedStyle: (factory: () => object) => factory(),
    useAnimatedKeyboard: () => ({ height: { value: 0 } }),
    useAnimatedProps: (factory: () => object) => factory(),
    useAnimatedReaction: jest.fn(),
    useAnimatedScrollHandler: jest.fn(() => jest.fn()),
    useFrameCallback: jest.fn(),
    withSpring: (value: unknown, _config?: unknown, callback?: (finished?: boolean) => void) =>
      runAnimation(value, callback),
    withTiming: (value: unknown, _config?: unknown, callback?: (finished?: boolean) => void) =>
      runAnimation(value, callback),
    withRepeat: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    cancelAnimation: jest.fn(),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    interpolate: (value: number, input: number[], output: number[]) => {
      const last = input.length - 1;
      if (value <= input[0]) return output[0];
      if (value >= input[last]) return output[last];
      let i = 0;
      while (i < last && value > input[i + 1]) i += 1;
      const span = input[i + 1] - input[i];
      const ratio = span === 0 ? 0 : (value - input[i]) / span;
      return output[i] + (output[i + 1] - output[i]) * ratio;
    },
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[0],
    Extrapolation: {
      CLAMP: 'clamp',
      EXTEND: 'extend',
      IDENTITY: 'identity',
    },
    useReducedMotion: () => false,
    FadeIn: makeBuilder(),
    FadeOut: makeBuilder(),
    FadeInDown: makeBuilder(),
    FadeInUp: makeBuilder(),
    FadeOutUp: makeBuilder(),
    FadeOutDown: makeBuilder(),
    Layout: makeBuilder(),
    LinearTransition: makeBuilder(),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      bezier: jest.fn(() => jest.fn()),
      in: jest.fn((value) => value),
      out: jest.fn((value) => value),
      inOut: jest.fn((value) => value),
    },
  };
});

// Mock expo-font
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
}));

// Mock expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

// Reset all mocks helper
export const resetAllMocks = () => {
  mockSecureStore.reset();
  mockGoogleSignIn.GoogleSignin.configure.mockClear();
  mockGoogleSignIn.GoogleSignin.signIn.mockClear();
  mockGoogleSignIn.GoogleSignin.signInSilently.mockClear();
  mockGoogleSignIn.GoogleSignin.signOut.mockClear();
  mockAppleAuthentication.isAvailableAsync.mockClear();
  mockAppleAuthentication.signInAsync.mockClear();
  mockHaptics.impactAsync.mockClear();
  mockHaptics.notificationAsync.mockClear();
  mockHaptics.selectionAsync.mockClear();
  mockFirebaseAnalytics.logEvent.mockClear();
  mockFirebaseAnalytics.setDefaultEventParameters.mockClear();
  mockFirebaseAnalyticsModule.getAnalytics.mockClear();
  mockFirebaseAnalyticsModule.logEvent.mockClear();
  mockFirebaseAnalyticsModule.setDefaultEventParameters.mockClear();
  mockFirebaseMessaging.getInitialNotification.mockClear();
  mockFirebaseMessaging.getToken.mockClear();
  mockFirebaseMessaging.hasPermission.mockClear();
  mockFirebaseMessaging.onMessage.mockClear();
  mockFirebaseMessaging.onNotificationOpenedApp.mockClear();
  mockFirebaseMessaging.onTokenRefresh.mockClear();
  mockFirebaseMessaging.registerDeviceForRemoteMessages.mockClear();
  mockFirebaseMessaging.requestPermission.mockClear();
  mockFirebaseMessaging.setBadgeCount.mockClear();
  mockFirebaseMessagingModule.getInitialNotification.mockClear();
  mockFirebaseMessagingModule.getMessaging.mockClear();
  mockFirebaseMessagingModule.getToken.mockClear();
  mockFirebaseMessagingModule.hasPermission.mockClear();
  mockFirebaseMessagingModule.isDeviceRegisteredForRemoteMessages.mockClear();
  mockFirebaseMessagingModule.onMessage.mockClear();
  mockFirebaseMessagingModule.onNotificationOpenedApp.mockClear();
  mockFirebaseMessagingModule.onTokenRefresh.mockClear();
  mockFirebaseMessagingModule.registerDeviceForRemoteMessages.mockClear();
  mockFirebaseMessagingModule.requestPermission.mockClear();
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
};
