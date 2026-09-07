import React from 'react';
import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import CreateEventSubmitButton from '../CreateEventSubmitButton';

const props = {
  label: 'Create plan',
  submitError: null,
  isSubmitting: true,
  isEditing: false,
  bottomInset: 0,
  onPress: jest.fn(),
};

describe('submission shimmer lifetime', () => {
  afterEach(() => jest.restoreAllMocks());
  it('cancels the repeating animation when submission stops and on unmount', () => {
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
    const view = render(<CreateEventSubmitButton {...props} />);
    expect(repeat).toHaveBeenCalledTimes(1);
    cancel.mockClear();
    view.rerender(<CreateEventSubmitButton {...props} isSubmitting={false} />);
    expect(cancel).toHaveBeenCalled();
    expect(repeat).toHaveBeenCalledTimes(1);
    cancel.mockClear();
    view.unmount();
    expect(cancel).toHaveBeenCalled();
  });
  it('does not start a repeating shimmer under reduced motion', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    render(<CreateEventSubmitButton {...props} />);
    expect(repeat).not.toHaveBeenCalled();
  });
});
