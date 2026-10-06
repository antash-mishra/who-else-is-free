import React from 'react';

import { fireEvent, render } from '@testing-library/react-native';
import RangeSlider from 'react-native-fast-range-slider';

it('supports accessible single-year adjustments and keeps a five-year gap', () => {
  const onValuesChange = jest.fn();
  const view = render(
    <RangeSlider
      min={18}
      max={99}
      step={1}
      width={331}
      minimumDistance={(331 * 5) / 81}
      initialMinValue={40}
      initialMaxValue={45}
      onValuesChange={onValuesChange}
      leftThumbAccessibilityLabel="Minimum age"
      rightThumbAccessibilityLabel="Maximum age"
    />,
  );
  const adjust = (label: string, actionName: string) =>
    fireEvent(view.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName } });
  adjust('Minimum age', 'increment');
  expect(onValuesChange).toHaveBeenLastCalledWith([40, 45]);
  adjust('Maximum age', 'decrement');
  expect(onValuesChange).toHaveBeenLastCalledWith([40, 45]);
  adjust('Minimum age', 'decrement');
  expect(onValuesChange).toHaveBeenLastCalledWith([39, 45]);
  expect(view.getByLabelText('Minimum age').props.accessibilityValue.now).toBe(39);
  adjust('Maximum age', 'decrement');
  expect(onValuesChange).toHaveBeenLastCalledWith([39, 44]);
});
