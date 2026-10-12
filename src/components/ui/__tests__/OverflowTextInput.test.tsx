import React from 'react';

import { TextInput } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

import OverflowTextInput from '../OverflowTextInput';

describe('OverflowTextInput', () => {
  it('reveals the full editable value on focus and restores the preview on blur', () => {
    const value = 'A long synthetic name with many words '.repeat(10);
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const onChangeText = jest.fn();
    const view = render(
      <OverflowTextInput
        value={value}
        placeholder="Name"
        onFocus={onFocus}
        onBlur={onBlur}
        onChangeText={onChangeText}
      />,
    );
    const input = view.getByPlaceholderText('Name');
    expect(view.getAllByText(value, { includeHiddenElements: true })[0].props.numberOfLines).toBe(
      1,
    );
    fireEvent(input, 'focus', { nativeEvent: {} });
    expect(view.queryByText(value, { includeHiddenElements: true })).toBeNull();
    expect(view.UNSAFE_getByType(TextInput).props.value).toBe(value);
    fireEvent.changeText(input, value + ' more');
    expect(onChangeText).toHaveBeenCalledWith(value + ' more');
    fireEvent(input, 'blur', { nativeEvent: {} });
    expect(view.getAllByText(value, { includeHiddenElements: true })[0].props.ellipsizeMode).toBe(
      'tail',
    );
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('ellipsizes the full value at the end of the field without changing the editable value', () => {
    const value = 'A long synthetic name continues beyond the field';
    const view = render(<OverflowTextInput value={value} />);
    const preview = view.getAllByText(value, { includeHiddenElements: true });
    expect(preview).toHaveLength(1);
    expect(preview[0].props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' });
    expect(view.UNSAFE_getByType(TextInput).props.value).toBe(value);
  });

  it('rewinds the hidden Android editor so focusing does not jump to the end', () => {
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    // React Native's Jest TextInput mock omits setSelection, so provide one for this test.
    const prototype = TextInput.prototype as Partial<TextInput>;
    const setSelection = jest.fn();
    prototype.setSelection = setSelection;
    try {
      const view = render(<OverflowTextInput value="Long name" placeholder="Name" />);
      expect(setSelection).toHaveBeenLastCalledWith(0, 0);
      const input = view.getByPlaceholderText('Name');
      fireEvent(input, 'focus', { nativeEvent: {} });
      setSelection.mockClear();
      fireEvent.changeText(input, 'Long name edited');
      view.rerender(<OverflowTextInput value="Long name edited" placeholder="Name" />);
      expect(setSelection).not.toHaveBeenCalled();
      fireEvent(input, 'blur', { nativeEvent: {} });
      expect(setSelection).toHaveBeenLastCalledWith(0, 0);
    } finally {
      delete prototype.setSelection;
      Platform.OS = originalOS;
    }
  });

  it('keeps empty and auto-focused fields visible without duplicate accessible text', () => {
    const view = render(<OverflowTextInput value="" placeholder="Name" />);
    expect(view.getByPlaceholderText('Name')).toBeTruthy();
    view.rerender(<OverflowTextInput value="Long name" placeholder="Name" />);
    expect(
      view.getAllByText('Long name', { includeHiddenElements: true })[0].props.accessible,
    ).toBe(false);
    const auto = render(<OverflowTextInput value="Long name" autoFocus />);
    expect(auto.queryByText('Long name')).toBeNull();
  });
});
