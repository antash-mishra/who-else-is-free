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
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
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
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
};
