import React from 'react';
import { StyleSheet } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

import { colors } from '@theme/index';

import { mockHaptics } from '../../../__tests__/mocks/mockModules';
import AppButton from '../AppButton';

describe('AppButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the label and calls onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <AppButton label="Save" onPress={onPress} testID="save-button" />,
    );

    expect(getByText('Save')).toBeTruthy();
    fireEvent.press(getByTestId('save-button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses light haptics by default', () => {
    const { getByTestId } = render(
      <AppButton label="Continue" onPress={jest.fn()} testID="continue-button" />,
    );

    fireEvent.press(getByTestId('continue-button'));

    expect(mockHaptics.impactAsync).toHaveBeenCalledWith('Light');
  });

  it('uses destructive haptics for destructive buttons by default', () => {
    const { getByTestId } = render(
      <AppButton label="Delete" onPress={jest.fn()} variant="destructive" testID="delete-button" />,
    );

    fireEvent.press(getByTestId('delete-button'));

    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith('Warning');
  });

  it('marks disabled and loading states accessibly', () => {
    const { getByTestId, queryByText } = render(
      <AppButton label="Saving" onPress={jest.fn()} loading testID="saving-button" />,
    );

    expect(getByTestId('saving-button').props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(queryByText('Saving')).toBeNull();
  });

  it('swaps to the grey disabled surface by default', () => {
    const { getByTestId, getByText } = render(
      <AppButton label="Continue" onPress={jest.fn()} disabled testID="continue-button" />,
    );

    const style = StyleSheet.flatten(getByTestId('continue-button-content').props.style);
    expect(style.backgroundColor).toBe(colors.disabledButtonBackground);
    expect(style.opacity).not.toBe(0.6);
    expect(StyleSheet.flatten(getByText('Continue').props.style).color).toBe(
      colors.disabledButtonText,
    );
  });

  it('keeps the variant surface and dims it when disabledAppearance is dimmed', () => {
    const { getByTestId, getByText } = render(
      <AppButton
        label="Continue"
        onPress={jest.fn()}
        disabled
        disabledAppearance="dimmed"
        testID="continue-button"
      />,
    );

    const style = StyleSheet.flatten(getByTestId('continue-button-content').props.style);
    expect(style.backgroundColor).toBe(colors.primaryButtonBackground);
    expect(style.opacity).toBe(0.6);
    expect(StyleSheet.flatten(getByText('Continue').props.style).color).not.toBe(
      colors.disabledButtonText,
    );
  });
});
