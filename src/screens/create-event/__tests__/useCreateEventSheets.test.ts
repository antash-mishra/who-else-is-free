import { Keyboard } from 'react-native';

import { act, renderHook } from '@testing-library/react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';

import { useCreateEventSheets } from '../useCreateEventSheets';

type KeyboardHandler = () => void;

const listeners: Record<string, KeyboardHandler> = {};

const emit = (event: 'keyboardWillShow' | 'keyboardWillHide') => {
  listeners[event]?.();
};

beforeEach(() => {
  jest.useFakeTimers();
  Object.keys(listeners).forEach((key) => delete listeners[key]);
  (KeyboardEvents.addListener as jest.Mock).mockImplementation(
    (event: string, handler: KeyboardHandler) => {
      listeners[event] = handler;
      return {
        remove: () => {
          delete listeners[event];
        },
      };
    },
  );
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useCreateEventSheets', () => {
  it('opens immediately when no keyboard is up', () => {
    const { result } = renderHook(() => useCreateEventSheets());

    act(() => {
      result.current.openSheet('cover');
    });

    expect(result.current.activeSheet).toBe('cover');
    expect(result.current.renderedSheet).toBe('cover');
  });

  it('subscribes to the will-events, not the did-events', () => {
    renderHook(() => useCreateEventSheets());

    // `keyboardDidHide` only fires once the keyboard has finished animating,
    // which is what forced the sheet to wait for it to land.
    expect(Object.keys(listeners).sort()).toEqual(['keyboardWillHide', 'keyboardWillShow']);
  });

  it('defers the sheet while the keyboard is up, then opens on keyboardWillHide', () => {
    const { result } = renderHook(() => useCreateEventSheets());

    act(() => {
      emit('keyboardWillShow');
    });

    act(() => {
      result.current.openSheet('dateTime');
    });

    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(result.current.activeSheet).toBeNull();

    act(() => {
      emit('keyboardWillHide');
    });

    // Opens on the event itself: no settle timer stands between the keyboard
    // starting to leave and the sheet starting to rise.
    expect(result.current.activeSheet).toBe('dateTime');
  });

  it('opens via the fallback timer when keyboardWillHide never arrives', () => {
    const { result } = renderHook(() => useCreateEventSheets());

    act(() => {
      emit('keyboardWillShow');
    });

    act(() => {
      result.current.openSheet('location');
    });

    expect(result.current.activeSheet).toBeNull();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.activeSheet).toBe('location');
  });

  it('does not reopen a deferred sheet that was cancelled before the keyboard left', () => {
    const { result } = renderHook(() => useCreateEventSheets());

    act(() => {
      emit('keyboardWillShow');
    });

    act(() => {
      result.current.openSheet('gender');
    });

    act(() => {
      result.current.closeSheetImmediately();
    });

    act(() => {
      emit('keyboardWillHide');
      jest.advanceTimersByTime(500);
    });

    expect(result.current.activeSheet).toBeNull();
    expect(result.current.renderedSheet).toBeNull();
  });

  it('keeps content mounted through the close animation', () => {
    const { result } = renderHook(() => useCreateEventSheets());

    act(() => {
      result.current.openSheet('age');
    });
    act(() => {
      result.current.closeActiveSheet();
    });

    expect(result.current.activeSheet).toBeNull();
    expect(result.current.renderedSheet).toBe('age');

    act(() => {
      jest.advanceTimersByTime(320);
    });

    expect(result.current.renderedSheet).toBeNull();
  });
});
