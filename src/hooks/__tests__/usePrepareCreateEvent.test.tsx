import React from 'react';

import { InteractionManager } from 'react-native';

import { act, render } from '@testing-library/react-native';

import { usePrepareCreateEvent } from '../usePrepareCreateEvent';

let mockLoading = false;
let mockFocused = true;
let mockRoutes = [{ name: 'Main' }];
let mockPrepared: { name: string }[] = [];
let mockIdle: (() => void) | undefined;
const mockCancel = jest.fn();
const mockPreload = jest.fn();
const mockNavigation = {
  isFocused: () => mockFocused,
  getState: () => ({ routes: mockRoutes, preloadedRoutes: mockPrepared }),
  preload: mockPreload,
};

jest.mock('@context/CoversContext', () => ({ useCovers: () => ({ isLoading: mockLoading }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    React.useEffect(callback, [callback]);
  },
}));
const Harness = () => {
  usePrepareCreateEvent();
  return null;
};

describe('idle Create preparation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoading = false;
    mockFocused = true;
    mockRoutes = [{ name: 'Main' }];
    mockPrepared = [];
    mockIdle = undefined;
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      mockIdle = callback as () => void;
      return { cancel: mockCancel, then: jest.fn(), done: jest.fn() };
    });
  });

  it('waits for navigation interactions before preparing the form', () => {
    render(<Harness />);
    expect(mockPreload).not.toHaveBeenCalled();
    act(() => mockIdle?.());
    expect(mockPreload).toHaveBeenCalledWith('CreateEvent', { editEventId: null });
  });

  it('does not mount a fallback form while covers are loading', () => {
    mockLoading = true;
    render(<Harness />);
    expect(mockIdle).toBeUndefined();
    expect(mockPreload).not.toHaveBeenCalled();
  });

  it('ignores queued work after Main loses focus', () => {
    render(<Harness />);
    mockFocused = false;
    act(() => mockIdle?.());
    expect(mockPreload).not.toHaveBeenCalled();
  });

  it('does not replace a live Create/Edit draft', () => {
    render(<Harness />);
    mockRoutes.push({ name: 'CreateEvent' });
    act(() => mockIdle?.());
    expect(mockPreload).not.toHaveBeenCalled();
  });

  it('keeps an existing prepared form across other screen visits', () => {
    render(<Harness />);
    mockPrepared = [{ name: 'CreateEvent' }];
    act(() => mockIdle?.());
    expect(mockPreload).not.toHaveBeenCalled();
  });

  it('cancels pending idle work on cleanup', () => {
    const { unmount } = render(<Harness />);
    unmount();
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });
});
