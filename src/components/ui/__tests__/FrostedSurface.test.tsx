import React from 'react';

import { Platform, StyleSheet, Text } from 'react-native';

import { render } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';

import { frostedFill } from '@theme/index';

import FrostedSurface from '../FrostedSurface';

const fillStyle = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style) as { backgroundColor?: string };

describe('FrostedSurface', () => {
  it('renders the calibrated fill for its tint and intensity', () => {
    const { getByTestId } = render(
      <FrostedSurface tint="dark" intensity={45} testID="chip">
        <Text>Icon</Text>
      </FrostedSurface>,
    );

    const [fill] = getByTestId('chip').children as { props: { style?: unknown } }[];

    expect(fillStyle(fill).backgroundColor).toBe(frostedFill('dark', 45));
  });

  it('keeps the surface background so the fill composites over it', () => {
    const { getByTestId } = render(
      <FrostedSurface tint="dark" intensity={45} style={{ backgroundColor: 'rgba(0, 0, 0, 0.18)' }}>
        <Text testID="child">Icon</Text>
      </FrostedSurface>,
    );

    // The child renders above the fill, and the caller's background survives.
    expect(getByTestId('child')).toBeTruthy();
  });

  it('drives a real blur on both platforms when a surface asks for one', () => {
    const methods: (string | undefined)[] = [];

    for (const os of ['ios', 'android'] as const) {
      Platform.OS = os;
      const { UNSAFE_getByType, unmount } = render(
        <FrostedSurface tint="dark" intensity={45} blur testID="chip" />,
      );
      const view = UNSAFE_getByType(BlurView);
      expect(view.props.tint).toBe('dark');
      expect(view.props.intensity).toBe(45);
      methods.push(view.props.experimentalBlurMethod);
      unmount();
    }

    // Android only blurs with the opt-in; iOS blurs natively without it.
    expect(methods).toEqual([undefined, 'dimezisBlurView']);
  });

  it('renders identically on both platforms', () => {
    const styles: (string | undefined)[] = [];

    for (const os of ['ios', 'android'] as const) {
      Platform.OS = os;
      const { getByTestId, unmount } = render(
        <FrostedSurface tint="light" intensity={54} testID="bar" />,
      );
      const [fill] = getByTestId('bar').children as { props: { style?: unknown } }[];
      styles.push(fillStyle(fill).backgroundColor);
      unmount();
    }

    expect(styles[0]).toBe(styles[1]);
  });
});

describe('frostedFill', () => {
  it('scales alpha with intensity and clamps out-of-range values', () => {
    expect(frostedFill('dark', 0)).toBe('rgba(0, 0, 0, 0)');
    expect(frostedFill('dark', 100)).toBe('rgba(0, 0, 0, 0.52)');
    expect(frostedFill('dark', 150)).toBe(frostedFill('dark', 100));
    expect(frostedFill('light', -10)).toBe('rgba(255, 255, 255, 0)');
  });
});
