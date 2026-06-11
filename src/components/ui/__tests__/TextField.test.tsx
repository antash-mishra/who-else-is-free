import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import TextField from '../TextField';

describe('TextField', () => {
  it('renders and updates text input value', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <TextField placeholder="Your name" value="" onChangeText={onChangeText} />,
    );

    fireEvent.changeText(getByPlaceholderText('Your name'), 'Ava');

    expect(onChangeText).toHaveBeenCalledWith('Ava');
  });

  it('renders optional error text', () => {
    const { getByText } = render(
      <TextField value="" onChangeText={jest.fn()} errorText="Required" />,
    );

    expect(getByText('Required')).toBeTruthy();
  });
});
