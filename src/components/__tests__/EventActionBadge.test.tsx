import React from 'react';

import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import EventActionBadge from '../EventActionBadge';

/**
 * The Reanimated jest mock runs completion callbacks synchronously, so the
 * badge's hold-then-exit sequence would finish during render and unmount
 * itself. Drop the callbacks so the badge stays mounted for assertions; the
 * exit timing itself is covered on device, not here.
 */
const holdBadgeOpen = () => {
  jest.spyOn(Reanimated, 'withTiming').mockImplementation((toValue) => toValue as number);
};

describe('EventActionBadge', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders its label when visible', () => {
    holdBadgeOpen();
    const { getByText } = render(<EventActionBadge visible label="Plan deleted" />);
    expect(getByText('Plan deleted')).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(<EventActionBadge visible={false} label="Plan deleted" />);
    expect(queryByText('Plan deleted')).toBeNull();
  });

  it('animates its entry with a spring', () => {
    holdBadgeOpen();
    const spring = jest.spyOn(Reanimated, 'withSpring');
    render(<EventActionBadge visible label="Welcome" />);
    expect(spring).toHaveBeenCalled();
  });

  it('appears without a spring when reduce motion is on', () => {
    holdBadgeOpen();
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const { getByText } = render(<EventActionBadge visible label="Welcome" />);
    expect(getByText('Welcome')).toBeTruthy();
    expect(spring).not.toHaveBeenCalled();
  });
  it('starts the hold after entry and ignores a queued entry callback after unmount', () => {
    jest.useFakeTimers();
    let entered: ((finished?: boolean) => void) | undefined;
    jest.spyOn(Reanimated, 'withSpring').mockImplementation((value, _config, callback) => {
      entered = callback;
      return value as never;
    });
    holdBadgeOpen();
    const view = render(<EventActionBadge visible label="Created" />);
    const beforeEntry = jest.getTimerCount();
    act(() => entered?.(true));
    expect(jest.getTimerCount()).toBe(beforeEntry + 1);
    view.unmount();
    const afterUnmount = jest.getTimerCount();
    act(() => entered?.(true));
    expect(jest.getTimerCount()).toBe(afterUnmount);
    jest.useRealTimers();
  });
});
