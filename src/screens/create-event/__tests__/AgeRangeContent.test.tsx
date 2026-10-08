import React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { mockHaptics } from '../../../__tests__/mocks/mockModules';
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

const thumbLabels = (view: ReturnType<typeof render>) => [
  view.getByTestId('age-range-min-label').props.children,
  view.getByTestId('age-range-max-label').props.children,
];

it('keeps draft changes local until Done and resets canceled changes on reopening', () => {
  const { view, props, onConfirm } = setup();
  expect(thumbLabels(view)).toEqual(['18', '50+']);
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [20, 40]);
  expect(thumbLabels(view)).toEqual(['20', '40']);
  expect(onConfirm).not.toHaveBeenCalled();
  view.rerender(<AgeRangeContent {...props} visible={false} />);
  view.rerender(<AgeRangeContent {...props} visible />);
  expect(thumbLabels(view)).toEqual(['18', '50+']);
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [40, 45]);
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).toHaveBeenCalledWith([40, 45]);
});

it('runs the slider to 50 and saves its end stop as no upper limit', () => {
  const { view, onConfirm } = setup();
  const slider = view.getByTestId('age-range-slider');
  expect(slider.props.min).toBe(18);
  expect(slider.props.max).toBe(50);
  fireEvent(slider, 'valuesChange', [25, 50]);
  expect(thumbLabels(view)).toEqual(['25', '50+']);
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).toHaveBeenCalledWith([25, 99]);
});

it('keeps a saved range above 50 unless a handle moves', () => {
  const { view, onConfirm } = setup({ range: [35, 80] });
  const slider = view.getByTestId('age-range-slider');
  expect([slider.props.initialMinValue, slider.props.initialMaxValue]).toEqual([35, 50]);
  expect(thumbLabels(view)).toEqual(['35', '50+']);
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).toHaveBeenCalledWith([35, 80]);
});

it('ignores late callbacks and invalid sub-five-year selections', () => {
  const { view, props } = setup();
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [40, 44]);
  expect(thumbLabels(view)).toEqual(['18', '50+']);
  view.rerender(<AgeRangeContent {...props} visible={false} />);
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [24, 30]);
  expect(thumbLabels(view)).toEqual(['18', '50+']);
});

it('requires deliberate replacement for legacy separated selections', () => {
  const { view, onConfirm } = setup({ mode: undefined, ids: ['20-25', '40+'], range: [20, 60] });
  expect(view.getByText(/Applying a range/)).toBeTruthy();
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent(view.getByTestId('age-range-slider'), 'valuesChange', [20, 45]);
  fireEvent.press(view.getByTestId('age-range-done'));
  expect(onConfirm).toHaveBeenCalledWith([20, 45]);
});

it('ticks a selection haptic once per age change, not on every gesture frame', () => {
  const { view } = setup();
  mockHaptics.selectionAsync.mockClear();
  const slider = view.getByTestId('age-range-slider');
  fireEvent(slider, 'valuesChange', [20, 50]);
  fireEvent(slider, 'valuesChange', [20, 50]);
  expect(mockHaptics.selectionAsync).toHaveBeenCalledTimes(1);
  fireEvent(slider, 'valuesChange', [21, 50]);
  expect(mockHaptics.selectionAsync).toHaveBeenCalledTimes(2);
});
