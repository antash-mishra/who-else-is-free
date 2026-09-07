import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import ConfettiOverlay from '../ConfettiOverlay';

jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  return { Canvas: View, Circle: View, Group: View, Rect: View };
});

describe('Confetti resource lifetime', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does no particle or frame-loop setup while hidden and stops on dismissal', () => {
    const allocate = jest.spyOn(Reanimated, 'makeMutable');
    const setActive = jest.fn();
    const frames = jest.spyOn(Reanimated, 'useFrameCallback').mockReturnValue({
      setActive,
      isActive: false,
      callbackId: 1,
    });
    const { rerender } = render(<ConfettiOverlay active={false} />);
    expect(allocate).not.toHaveBeenCalled();
    expect(frames).not.toHaveBeenCalled();
    rerender(<ConfettiOverlay active />);
    expect(allocate).toHaveBeenCalledTimes(50);
    expect(setActive).toHaveBeenLastCalledWith(true);
    rerender(<ConfettiOverlay active={false} />);
    expect(setActive).toHaveBeenLastCalledWith(false);
    const count = allocate.mock.calls.length;
    rerender(<ConfettiOverlay active={false} variant="classic" />);
    expect(allocate).toHaveBeenCalledTimes(count);
  });

  it('does not start particle animation when reduced motion is enabled', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const allocate = jest.spyOn(Reanimated, 'makeMutable');
    render(<ConfettiOverlay active />);
    expect(allocate).not.toHaveBeenCalled();
  });
});
