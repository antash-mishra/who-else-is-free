import React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import AgeRangeContent from '../AgeRangeContent';

jest.mock('react-native-fast-range-slider', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});

const setup = (extra: Partial<React.ComponentProps<typeof AgeRangeContent>> = {}) => {
  const onConfirm = jest.fn();
  const props = {
    visible: true,
    range: [18, 99] as [number, number],
    mode: 'range' as const,
    onConfirm,
    ...extra,
  };
  const view = render(<AgeRangeContent {...props} />);
  fireEvent(view.getByTestId('age-range-layout'), 'layout', {
    nativeEvent: { layout: { width: 320 } },
  });
  return { view, props, onConfirm };
};

it('keeps draft changes local until Done and resets canceled changes on reopening', () => {
  const { view, props, onConfirm } = setup();
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [20, 60]);
  expect(view.getByText('20 - 60')).toBeTruthy();
  expect(onConfirm).not.toHaveBeenCalled();
  view.rerender(<AgeRangeContent {...props} visible={false} />);
  view.rerender(<AgeRangeContent {...props} visible />);
  expect(view.getByText('All ages')).toBeTruthy();
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [40, 45]);
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).toHaveBeenCalledWith([40, 45]);
});

it('ignores late callbacks and invalid sub-five-year selections', () => {
  const { view, props } = setup();
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [40, 44]);
  expect(view.getByText('All ages')).toBeTruthy();
  view.rerender(<AgeRangeContent {...props} visible={false} />);
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [24, 99]);
  expect(view.getByText('All ages')).toBeTruthy();
});

it('requires deliberate replacement for legacy separated selections', () => {
  const { view, onConfirm } = setup({ mode: undefined, ids: ['20-25', '40+'], range: [20, 60] });
  expect(view.getByText(/Applying a range/)).toBeTruthy();
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [20, 61]);
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).toHaveBeenCalledWith([20, 61]);
});
