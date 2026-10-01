import React, { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import AgeGroupsContent from '../AgeGroupsContent';

it('allows multiple selections, excludes All ages, and blocks an empty selection', () => {
  const confirm = jest.fn();
  const Harness = () => {
    const [ids, setIds] = useState(['all']);
    return (
      <AgeGroupsContent ids={ids} legacyRange={[18, 60]} onChange={setIds} onConfirm={confirm} />
    );
  };
  render(<Harness />);
  fireEvent.press(screen.getByTestId('age-group-20-25'));
  fireEvent.press(screen.getByTestId('age-group-40+'));
  expect(screen.getByTestId('age-group-all').props.accessibilityState.checked).toBe(false);
  expect(screen.getByTestId('age-group-20-25').props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId('age-group-40+').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByTestId('age-group-20-25'));
  fireEvent.press(screen.getByTestId('age-group-40+'));
  expect(screen.getByTestId('selection-modal-confirm').props.accessibilityState.disabled).toBe(
    true,
  );
  fireEvent.press(screen.getByTestId('selection-modal-confirm'));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('age-group-all'));
  fireEvent.press(screen.getByTestId('selection-modal-confirm'));
  expect(confirm).toHaveBeenCalledTimes(1);
});
