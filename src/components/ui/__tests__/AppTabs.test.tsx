import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import AppTabs from '../AppTabs';

describe('AppTabs', () => {
  const options = [
    { label: 'Requests', value: 'requests', count: 2 },
    { label: 'Members', value: 'members' },
  ];

  it('renders options with tab accessibility', () => {
    const { getByTestId, getByText } = render(
      <AppTabs options={options} value="requests" onChange={jest.fn()} />,
    );

    expect(getByText('Requests')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByTestId('tab-requests').props.accessibilityRole).toBe('tab');
    expect(getByTestId('tab-requests').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('calls onChange for selected tab values', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <AppTabs options={options} value="requests" onChange={onChange} />,
    );

    fireEvent.press(getByTestId('tab-members'));

    expect(onChange).toHaveBeenCalledWith('members');
  });

  it('supports underline variant', () => {
    const { getByTestId } = render(
      <AppTabs options={options} value="members" onChange={jest.fn()} variant="underline" />,
    );

    expect(getByTestId('tab-members').props.accessibilityState.selected).toBe(true);
  });
});
