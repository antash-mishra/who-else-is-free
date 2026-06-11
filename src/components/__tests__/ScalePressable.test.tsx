import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import ScalePressable from '../ScalePressable';
import { mockHaptics } from '../../__tests__/mocks/mockModules';

describe('ScalePressable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <ScalePressable onPress={onPress} testID="pressable">
        <Text>Press me</Text>
      </ScalePressable>,
    );

    fireEvent.press(getByTestId('pressable'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('triggers semantic haptics when configured', () => {
    const { getByTestId } = render(
      <ScalePressable onPress={jest.fn()} haptic="submit" testID="pressable">
        <Text>Submit</Text>
      </ScalePressable>,
    );

    fireEvent.press(getByTestId('pressable'));

    expect(mockHaptics.impactAsync).toHaveBeenCalledWith('Medium');
  });

  it('passes accessibility label through to the pressable', () => {
    const { getByLabelText } = render(
      <ScalePressable onPress={jest.fn()} accessibilityLabel="Open menu">
        <Text>Menu</Text>
      </ScalePressable>,
    );

    expect(getByLabelText('Open menu')).toBeTruthy();
  });
});
