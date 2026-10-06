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

  it('marks overflow at a whole-word boundary without changing the editable value', () => {
    const value = 'A long synthetic name continues beyond the field';
    const view = render(<OverflowTextInput value={value} />);
    const measured = view.getAllByText(value, { includeHiddenElements: true })[1];
    fireEvent(measured, 'textLayout', {
      nativeEvent: {
        lines: [{ text: 'A long synthetic name ' }, { text: 'continues beyond the field' }],
      },
    });
    expect(view.getByText('A long synthetic…', { includeHiddenElements: true })).toBeTruthy();
    expect(view.UNSAFE_getByType(TextInput).props.value).toBe(value);
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
