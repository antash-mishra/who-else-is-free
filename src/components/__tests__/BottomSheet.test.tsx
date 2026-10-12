import React from 'react';

import { Dimensions, Keyboard, Modal, Platform, StyleSheet, Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { KeyboardController, useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import * as Reanimated from 'react-native-reanimated';

import BottomSheet from '../sheets/BottomSheet';

describe('BottomSheet', () => {
  const originalOS = Platform.OS;
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('keeps iOS on keyboardWillShow and keyboardWillHide', () => {
    Platform.OS = 'ios';
    const removeSubscriptions: jest.Mock[] = [];
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation(() => {
      const remove = jest.fn();
      removeSubscriptions.push(remove);

      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    });

    const { unmount } = render(
      <BottomSheet {...defaultProps}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).toHaveBeenCalledWith('keyboardWillShow', expect.any(Function));
    expect(addListenerSpy).toHaveBeenCalledWith('keyboardWillHide', expect.any(Function));

    unmount();

    expect(removeSubscriptions).toHaveLength(2);
    expect(removeSubscriptions[0]).toHaveBeenCalledTimes(1);
    expect(removeSubscriptions[1]).toHaveBeenCalledTimes(1);
    addListenerSpy.mockRestore();
  });

  it('does not wait for React Native keyboard events on Android (#190)', () => {
    Platform.OS = 'android';
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener');

    render(
      <BottomSheet {...defaultProps}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).not.toHaveBeenCalled();
    addListenerSpy.mockRestore();
  });

  it('does not subscribe to keyboard events when keyboard avoidance is disabled', () => {
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener');

    render(
      <BottomSheet {...defaultProps} avoidKeyboard={false}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).not.toHaveBeenCalled();
    addListenerSpy.mockRestore();
  });
});

describe('BottomSheet entry lifecycle', () => {
  it('waits for native modal onShow and opens only once', () => {
    const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const view = render(
      <BottomSheet visible onClose={jest.fn()}>
        <Text>Content</Text>
      </BottomSheet>,
    );
    expect(spring).not.toHaveBeenCalled();
    act(() => {
      view.UNSAFE_getByType(Modal).props.onShow();
    });
    expect(spring).toHaveBeenCalledTimes(1);
    act(() => {
      view.UNSAFE_getByType(Modal).props.onShow();
    });
    expect(spring).toHaveBeenCalledTimes(1);
    raf.mockRestore();
    spring.mockRestore();
  });
});

it('does not restart entry when an open sheet rerenders with new content', () => {
  const spring = jest.spyOn(Reanimated, 'withSpring');
  const view = render(
    <BottomSheet visible onClose={jest.fn()}>
      <Text>First</Text>
    </BottomSheet>,
  );
  act(() => {
    view.UNSAFE_getByType(Modal).props.onShow();
  });
  const entries = spring.mock.calls.length;
  view.rerender(
    <BottomSheet visible onClose={jest.fn()}>
      <Text>Updated</Text>
    </BottomSheet>,
  );
  act(() => {
    jest.advanceTimersByTime(20);
  });
  expect(spring).toHaveBeenCalledTimes(entries);
  spring.mockRestore();
});
it('cancels a pending close when reopened and permits a later close', () => {
  const closed = jest.fn();
  const view = render(
    <BottomSheet visible onClose={jest.fn()} onClosed={closed}>
      <Text>Content</Text>
    </BottomSheet>,
  );
  act(() => {
    view.UNSAFE_getByType(Modal).props.onShow();
  });
  view.rerender(
    <BottomSheet visible={false} onClose={jest.fn()} onClosed={closed}>
      <Text>Content</Text>
    </BottomSheet>,
  );
  act(() => {
    jest.advanceTimersByTime(100);
  });
  view.rerender(
    <BottomSheet visible onClose={jest.fn()} onClosed={closed}>
      <Text>Content</Text>
    </BottomSheet>,
  );
  act(() => {
    jest.advanceTimersByTime(350);
  });
  expect(closed).not.toHaveBeenCalled();
  expect(view.getByText('Content')).toBeTruthy();
  view.rerender(
    <BottomSheet visible={false} onClose={jest.fn()} onClosed={closed}>
      <Text>Content</Text>
    </BottomSheet>,
  );
  act(() => {
    jest.advanceTimersByTime(350);
  });
  expect(closed).toHaveBeenCalledTimes(1);
  expect(view.queryByText('Content')).toBeNull();
});

it('waits for a new native onShow when switching modal to inline and back', () => {
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0);
  const spring = jest.spyOn(Reanimated, 'withSpring');
  const view = render(
    <BottomSheet visible onClose={jest.fn()} presentation="modal" animation="spring">
      <Text>Content</Text>
    </BottomSheet>,
  );
  act(() => view.UNSAFE_getByType(Modal).props.onShow());
  expect(spring).toHaveBeenCalledTimes(1);
  view.rerender(
    <BottomSheet visible onClose={jest.fn()} presentation="inline" animation="spring">
      <Text>Content</Text>
    </BottomSheet>,
  );
  expect(raf).toHaveBeenCalledTimes(1);
  view.rerender(
    <BottomSheet visible onClose={jest.fn()} presentation="modal" animation="spring">
      <Text>Content</Text>
    </BottomSheet>,
  );
  expect(raf).toHaveBeenCalledTimes(1);
  act(() => view.UNSAFE_getByType(Modal).props.onShow());
  expect(spring).toHaveBeenCalledTimes(2);
  raf.mockRestore();
  spring.mockRestore();
});

it('keeps prepared inline layout mounted, starts entry without a frame wait, and never retains a hidden Modal', () => {
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame');
  const spring = jest.spyOn(Reanimated, 'withSpring');
  const props = { onClose: jest.fn(), keepMounted: true, animation: 'spring' as const };
  const view = render(
    <BottomSheet {...props} presentation="inline" visible={false}>
      <Text>Prepared</Text>
    </BottomSheet>,
  );
  expect(view.queryByText('Prepared')).toBeNull();
  const content = view.getByText('Prepared', { includeHiddenElements: true });
  const initialFrames = raf.mock.calls.length;
  const initialSprings = spring.mock.calls.length;
  view.rerender(
    <BottomSheet {...props} presentation="inline" visible>
      <Text>Prepared</Text>
    </BottomSheet>,
  );
  expect(spring.mock.calls.length).toBe(initialSprings + 1);
  expect(raf.mock.calls.length).toBe(initialFrames);
  expect(view.getByText('Prepared')).toBe(content);
  view.rerender(
    <BottomSheet {...props} presentation="inline" visible={false}>
      <Text>Prepared</Text>
    </BottomSheet>,
  );
  act(() => jest.advanceTimersByTime(300));
  expect(view.queryByText('Prepared')).toBeNull();
  expect(view.getByText('Prepared', { includeHiddenElements: true })).toBe(content);
  view.rerender(
    <BottomSheet {...props} presentation="modal" visible={false}>
      <Text>Prepared</Text>
    </BottomSheet>,
  );
  expect(view.UNSAFE_queryByType(Modal)).toBeNull();
  raf.mockRestore();
  spring.mockRestore();
});

type KeyboardFrameHandlers = Parameters<typeof useGenericKeyboardHandler>[0];

const keyboardFrame = (height: number) => ({
  height,
  progress: height > 0 ? 1 : 0,
  duration: 285,
  target: 1,
});

describe('BottomSheet follows Android keyboard frames (#190)', () => {
  const originalOS = Platform.OS;
  const screenHeight = Dimensions.get('window').height;
  const safeAreaMock = jest.requireMock('react-native-safe-area-context') as {
    useSafeAreaInsets: () => { top: number; bottom: number; left: number; right: number };
  };

  const sheet = (visible = true, avoidKeyboard = true) => (
    <BottomSheet visible={visible} avoidKeyboard={avoidKeyboard} onClose={jest.fn()}>
      <Text>Content</Text>
    </BottomSheet>
  );
  /** Handlers BottomSheet registered with react-native-keyboard-controller on its latest render. */
  const keyboardHandlers = (): KeyboardFrameHandlers => {
    const { calls } = jest.mocked(useGenericKeyboardHandler).mock;
    return calls[calls.length - 1][0];
  };
  const translateY = (view: ReturnType<typeof render>) => {
    const style = StyleSheet.flatten(view.getByTestId('bottom-sheet-modal').props.style) as {
      transform?: { translateY?: number }[];
    };
    return style.transform?.[0]?.translateY;
  };
  /** Delivers one keyboard frame, then re-renders: the Reanimated mock evaluates styles on render. */
  const deliver = (
    view: ReturnType<typeof render>,
    phase: 'onMove' | 'onEnd',
    height: number,
    visible = true,
    avoidKeyboard = true,
  ) => {
    act(() => {
      keyboardHandlers()[phase]?.(keyboardFrame(height));
    });
    view.rerender(sheet(visible, avoidKeyboard));
  };
  const openSheet = (avoidKeyboard = true) => {
    const view = render(sheet(true, avoidKeyboard));
    act(() => {
      view.UNSAFE_getByType(Modal).props.onShow();
    });
    return view;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    jest
      .spyOn(safeAreaMock, 'useSafeAreaInsets')
      .mockReturnValue({ top: 0, bottom: 48, left: 0, right: 0 });
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('rides each keyboard frame to the resting lift instead of jumping ahead', () => {
    const view = openSheet();

    deliver(view, 'onMove', 166);
    expect(translateY(view)).toBe(-118);

    // Inside the sheet's Modal window keyboard-controller reports the IME including the
    // 48dp navigation bar the sheet already pads for (332dp on WEIF_API_36; RN lifted 284).
    deliver(view, 'onEnd', 332);
    expect(translateY(view)).toBe(-284);
  });

  it('never changes the Android soft input mode', () => {
    const view = openSheet();
    view.unmount();

    expect(KeyboardController.setInputMode).not.toHaveBeenCalled();
    expect(KeyboardController.setDefaultMode).not.toHaveBeenCalled();
  });

  it('follows a keyboard that changes height while open', () => {
    const view = openSheet();
    deliver(view, 'onEnd', 332);

    deliver(view, 'onMove', 380);

    expect(translateY(view)).toBe(-332);
  });

  it('returns to rest when the keyboard is dismissed under an open sheet', () => {
    const view = openSheet();
    deliver(view, 'onEnd', 332);

    deliver(view, 'onMove', 120);
    expect(translateY(view)).toBe(-72);
    deliver(view, 'onEnd', 0);
    expect(translateY(view)).toBe(0);
  });

  it('ignores keyboard frames during entry and catches up once settled', () => {
    const view = render(sheet());

    // Entry waits for the native onShow; a keyboard moving now must not displace the sheet.
    deliver(view, 'onMove', 200);
    expect(translateY(view)).toBe(screenHeight);

    act(() => {
      view.UNSAFE_getByType(Modal).props.onShow();
    });
    view.rerender(sheet());

    expect(translateY(view)).toBe(-152);
  });

  it('leaves the offset to the close animation once the sheet starts closing', () => {
    const view = openSheet();
    deliver(view, 'onEnd', 332);

    view.rerender(sheet(false));
    deliver(view, 'onMove', 300, false);

    expect(translateY(view)).toBe(screenHeight);
  });

  it('ignores keyboard frames when keyboard avoidance is disabled', () => {
    const view = openSheet(false);

    deliver(view, 'onEnd', 332, true, false);

    expect(translateY(view)).toBe(0);
  });
});
