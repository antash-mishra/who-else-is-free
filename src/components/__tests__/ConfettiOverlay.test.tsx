import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import ConfettiOverlay from '../ConfettiOverlay';

const mockCannons = jest.fn();

jest.mock('react-native-fast-confetti', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const CannonConfetti = (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    mockCannons(props);
    return ReactActual.createElement(View, { testID: 'cannon-confetti' }, props.children);
  };
  CannonConfetti.Origin = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    ReactActual.createElement(View, { testID: 'cannon-origin', ...props }, props.children);
  CannonConfetti.Flake = (props: Record<string, unknown>) =>
    ReactActual.createElement(View, { testID: 'cannon-flake', ...props });
  return { CannonConfetti };
});

describe('ConfettiOverlay', () => {
  beforeEach(() => mockCannons.mockClear());
  afterEach(() => jest.restoreAllMocks());

  it('mounts nothing while hidden and unmounts on dismissal', () => {
    const view = render(<ConfettiOverlay active={false} />);
    expect(view.queryByTestId('cannon-confetti')).toBeNull();
    expect(mockCannons).not.toHaveBeenCalled();

    view.rerender(<ConfettiOverlay active />);
    expect(view.getByTestId('cannon-confetti')).toBeTruthy();

    view.rerender(<ConfettiOverlay active={false} />);
    expect(view.queryByTestId('cannon-confetti')).toBeNull();
  });

  it('fires two corner cannons in flat brand colours, fading out, after a short start delay', () => {
    const view = render(<ConfettiOverlay active />);
    const props = mockCannons.mock.calls[0][0];

    expect(props).toEqual(
      expect.objectContaining({
        autoplay: true,
        fadeOutOnEnd: true,
        flakeStyle: 'solid',
        autoStartDelay: 120,
        sprayDuration: 500,
        gravity: 1.5,
      }),
    );
    expect(props.colors).toHaveLength(8);
    expect(view.getAllByTestId('cannon-origin').map((origin) => origin.props.position)).toEqual([
      'bottom-left',
      'bottom-right',
    ]);
    expect(view.getAllByTestId('cannon-flake')).toHaveLength(4);
    for (const origin of view.getAllByTestId('cannon-origin')) {
      expect(origin.props.count).toBe(150);
    }
  });

  it('reports when the animation has finished', () => {
    const onFinished = jest.fn();
    render(<ConfettiOverlay active onFinished={onFinished} />);
    mockCannons.mock.calls[0][0].onAnimationEnd();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('never blocks touches on the screen underneath', () => {
    const view = render(<ConfettiOverlay active />);
    expect(view.getByTestId('confetti-overlay').props.pointerEvents).toBe('none');
  });

  it('shows nothing when reduced motion is enabled', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const view = render(<ConfettiOverlay active />);
    expect(view.queryByTestId('cannon-confetti')).toBeNull();
    expect(mockCannons).not.toHaveBeenCalled();
  });
});
