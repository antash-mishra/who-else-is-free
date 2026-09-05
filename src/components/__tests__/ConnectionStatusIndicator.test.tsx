import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import ConnectionStatusIndicator from '../ConnectionStatusIndicator';

describe('ConnectionStatusIndicator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(<ConnectionStatusIndicator visible={false} />);
    expect(queryByText('Connecting')).toBeNull();
  });

  it('pulses when motion is allowed', () => {
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    render(<ConnectionStatusIndicator visible />);
    expect(repeat).toHaveBeenCalled();
  });

  it('does not pulse when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const { getByText } = render(<ConnectionStatusIndicator visible />);
    expect(getByText('Connecting')).toBeTruthy();
    expect(repeat).not.toHaveBeenCalled();
  });
});
