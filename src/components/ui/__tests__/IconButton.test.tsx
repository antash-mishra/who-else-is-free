import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import IconButton from '../IconButton';

describe('IconButton', () => {
  it('requires an accessible label and calls onPress', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <IconButton accessibilityLabel="Go back" icon={<Text>Icon</Text>} onPress={onPress} />,
    );

    fireEvent.press(getByLabelText('Go back'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('marks disabled state accessibly', () => {
    const { getByTestId } = render(
      <IconButton
        accessibilityLabel="Close"
        icon={<Text>Icon</Text>}
        onPress={jest.fn()}
        disabled
        testID="close-button"
      />,
    );

    expect(getByTestId('close-button').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('allows compact buttons to preserve a larger touch target', () => {
    const { getByTestId } = render(
      <IconButton
        accessibilityLabel="Notifications"
        icon={<Text>Icon</Text>}
        onPress={jest.fn()}
        size="sm"
        hitSlop={18}
        testID="notifications-button"
      />,
    );

    expect(getByTestId('notifications-button').props.hitSlop).toBe(18);
  });
});
