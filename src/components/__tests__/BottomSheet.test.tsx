import React from 'react';

import { Keyboard, Platform, Text } from 'react-native';

import { render } from '@testing-library/react-native';

import BottomSheet, { getKeyboardTranslation } from '../sheets/BottomSheet';

describe('getKeyboardTranslation', () => {
  it('places only the safe-area inset behind the iOS keyboard', () => {
    expect(getKeyboardTranslation(336, 34, 'ios')).toBe(302);
  });

  it('never produces a negative iOS translation', () => {
    expect(getKeyboardTranslation(30, 34, 'ios')).toBe(0);
  });

  it('preserves the existing Android keyboard translation', () => {
    expect(getKeyboardTranslation(336, 8, 'android')).toBe(336);
  });
});

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
