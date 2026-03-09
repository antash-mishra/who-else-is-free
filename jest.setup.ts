/**
 * Jest setup file
 * Global configuration for all tests
 */

// Import module mocks
import './src/__tests__/mocks/mockModules';

// Setup fetch mock
import fetchMock from 'jest-fetch-mock';
fetchMock.enableMocks();

// Reset fetch mock before each test
beforeEach(() => {
  fetchMock.resetMocks();
});

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate connection after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send = jest.fn();

  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });

  // Helper to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Helper to simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

global.WebSocket = MockWebSocket as any;

// Mock console.warn and console.error to reduce noise in tests
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn((...args) => {
    const message = args[0]?.toString() || '';
    if (
      message.includes('Animated:') ||
      message.includes('componentWillReceiveProps') ||
      message.includes('componentWillMount') ||
      message.includes('NativeEventEmitter')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  });

  console.error = jest.fn((...args) => {
    const message = args[0]?.toString() || '';
    if (
      message.includes('Warning: An update to') ||
      message.includes('act(...)') ||
      message.includes('not wrapped in act')
    ) {
      return;
    }
    originalError.apply(console, args);
  });
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// Mock timers for animations
jest.useFakeTimers();

// Global test timeout
jest.setTimeout(10000);

// Mock LayoutAnimation - causes issues in tests
jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
  configureNext: jest.fn(),
  create: jest.fn(),
  easeInEaseOut: jest.fn(),
  linear: jest.fn(),
  spring: jest.fn(),
  Types: {
    easeIn: 'easeIn',
    easeInEaseOut: 'easeInEaseOut',
    easeOut: 'easeOut',
    linear: 'linear',
    spring: 'spring',
  },
  Properties: {
    opacity: 'opacity',
    scaleX: 'scaleX',
    scaleY: 'scaleY',
    scaleXY: 'scaleXY',
  },
  Presets: {
    easeInEaseOut: {},
    linear: {},
    spring: {},
  },
}));


// Mock @react-native-community/slider
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: React.forwardRef(({ testID, value, onValueChange, onSlidingComplete, ...props }: any, ref: any) => {
      return React.createElement(View, {
        testID: testID || 'slider-mock',
        ref,
        ...props,
        // Expose handlers for testing
        accessibilityValue: { now: value },
      });
    }),
  };
});

// Mock @react-native-community/datetimepicker
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MockDateTimePicker = ({ testID, ...props }: any) =>
    React.createElement(View, {
      testID: testID || 'datetime-picker-mock',
      ...props,
    });

  return {
    __esModule: true,
    default: MockDateTimePicker,
    DateTimePickerAndroid: {
      open: jest.fn(),
    },
  };
});

// Mock @ptomasroos/react-native-multi-slider
jest.mock('@ptomasroos/react-native-multi-slider', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: React.forwardRef(({ testID, values, onValuesChange, onValuesChangeFinish, ...props }: any, ref: any) => {
      return React.createElement(View, {
        testID: testID || 'multi-slider-mock',
        ref,
        ...props,
        // Expose values for testing
        accessibilityValue: { text: values?.join('-') },
      });
    }),
  };
});

// Mock expo-blur
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    BlurView: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    LinearGradient: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

// Mock react-native-keyboard-aware-scroll-view
jest.mock('react-native-keyboard-aware-scroll-view', () => {
  const React = require('react');
  const { ScrollView, View } = require('react-native');

  return {
    KeyboardAwareScrollView: React.forwardRef(({ children, testID, ...props }: any, ref: any) => {
      return React.createElement(ScrollView, {
        testID: testID || 'keyboard-aware-scroll-view-mock',
        ref,
        ...props,
      }, children);
    }),
    KeyboardAwareFlatList: React.forwardRef(({ children, testID, ...props }: any, ref: any) => {
      return React.createElement(View, {
        testID: testID || 'keyboard-aware-flat-list-mock',
        ref,
        ...props,
      }, children);
    }),
    KeyboardAwareSectionList: React.forwardRef(({ children, testID, ...props }: any, ref: any) => {
      return React.createElement(View, {
        testID: testID || 'keyboard-aware-section-list-mock',
        ref,
        ...props,
      }, children);
    }),
  };
});
