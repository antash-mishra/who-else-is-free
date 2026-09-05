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
  it('does not rotate by default', () => {
    const { getByTestId } = render(
      <ScalePressable onPress={jest.fn()} testID="plain">
        <Text>Tap</Text>
      </ScalePressable>,
    );

    fireEvent(getByTestId('plain'), 'pressIn');

    const style = getByTestId('plain-content').props.style;
    expect(JSON.stringify(style)).not.toContain('rotate');
  });

  it('rotates on press when tilt is enabled', () => {
    const { getByTestId } = render(
      <ScalePressable onPress={jest.fn()} tilt tiltSeed="card-1" testID="tilted">
        <Text>Tap</Text>
      </ScalePressable>,
    );

    fireEvent(getByTestId('tilted'), 'pressIn');

    const style = getByTestId('tilted-content').props.style;
    expect(JSON.stringify(style)).toContain('rotate');
  });
});
