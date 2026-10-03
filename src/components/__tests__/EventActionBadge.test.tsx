import React from 'react';

import { Platform, processColor, StyleSheet } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';
import * as Reanimated from 'react-native-reanimated';

import { colors, componentTokens } from '@theme/index';

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
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('keeps the existing Apple material on iOS', () => {
    Platform.OS = 'ios';
    holdBadgeOpen();
    const { UNSAFE_getByType, getByText, getByTestId } = render(
      <EventActionBadge visible label="Plan deleted" />,
    );
    const blur = UNSAFE_getByType(BlurView);
    expect(blur.props.tint).toBe('dark');
    expect(blur.props.intensity).toBe(65);
    expect(blur.props.experimentalBlurMethod).toBeUndefined();
    const label = getByText('Plan deleted');
    expect(StyleSheet.flatten(label.props.style).color).toBe(colors.selectedTextOnDark);
    const surface = getByTestId('action-toast-surface');
    expect(StyleSheet.flatten(surface.props.style).paddingVertical).toBe(12);
    const overlay = getByTestId('action-toast-overlay');
    expect(StyleSheet.flatten(overlay.props.style).backgroundColor).toBe(
      componentTokens.overlay.backdrop,
    );
  });

  it('puts the Android label inside the capture-excluded native material without a second scrim', () => {
    Platform.OS = 'android';
    holdBadgeOpen();
    const { getByTestId, UNSAFE_queryAllByType, getByText } = render(
      <EventActionBadge visible label="Plan deleted" />,
    );
    const surface = getByTestId('action-toast-surface');
    expect(surface.props.materialColor).toBe(processColor(colors.actionToastAndroidMaterial));
    expect(surface.props.blurSigmaDp).toBe(12.5);
    expect(surface.findAllByProps({ children: 'Plan deleted' })).toContain(
      getByText('Plan deleted'),
    );
    expect(UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    expect(
      surface.findAll(
        (node) =>
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
          componentTokens.overlay.backdrop,
      ),
    ).toHaveLength(0);
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
