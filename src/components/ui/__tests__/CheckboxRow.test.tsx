import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { mockHaptics } from '../../../__tests__/mocks/mockModules';
import CheckboxRow from '../CheckboxRow';

describe('CheckboxRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders checked state and calls onPress', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <CheckboxRow label="I want a reply" checked onPress={onPress} testID="reply-row" />,
    );

    expect(getByText('I want a reply')).toBeTruthy();
    expect(getByTestId('reply-row').props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });

    fireEvent.press(getByTestId('reply-row'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockHaptics.selectionAsync).toHaveBeenCalledTimes(1);
  });
});
