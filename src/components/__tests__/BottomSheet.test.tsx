import React from 'react';

import { Keyboard, Platform, Text, Modal } from 'react-native';

import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import BottomSheet from '../sheets/BottomSheet';

describe('BottomSheet', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to keyboard events when keyboard avoidance is enabled', () => {
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

    const expectedShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const expectedHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    expect(addListenerSpy).toHaveBeenCalledWith(expectedShowEvent, expect.any(Function));
    expect(addListenerSpy).toHaveBeenCalledWith(expectedHideEvent, expect.any(Function));

    unmount();

    expect(removeSubscriptions).toHaveLength(2);
    expect(removeSubscriptions[0]).toHaveBeenCalledTimes(1);
    expect(removeSubscriptions[1]).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to keyboard events when keyboard avoidance is disabled', () => {
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener');

    render(
      <BottomSheet {...defaultProps} avoidKeyboard={false}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).not.toHaveBeenCalled();
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
