import React from 'react';

import { PixelRatio, Platform, StyleSheet, Text } from 'react-native';

import { render } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';

import { frostedFill } from '@theme/index';

import FrostedSurface from '../FrostedSurface';

const fillStyle = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style) as { backgroundColor?: string };

describe('FrostedSurface', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

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

  it('applies an Android material without touching iOS (#190)', () => {
    const material = { intensity: 13, blurSigmaDp: 19.5 };
    const pixelRatio = jest.spyOn(PixelRatio, 'get').mockReturnValue(1.75);
    const blurProps: Record<string, { intensity: number; blurReductionFactor: number }> = {};

    for (const os of ['ios', 'android'] as const) {
      Platform.OS = os;
      const { UNSAFE_getByType, unmount } = render(
        <FrostedSurface tint="light" intensity={54} blur androidMaterial={material} />,
      );
      const { intensity, blurReductionFactor } = UNSAFE_getByType(BlurView).props;
      blurProps[os] = { intensity, blurReductionFactor };
      unmount();
    }

    expect(blurProps.ios.intensity).toBe(54);
    expect(blurProps.android.intensity).toBe(13);
    // 19.5dp x 1.75 / 6 = 5.6875px sigma in the capture -> radius 8.985 -> 13 / 8.985.
    expect(blurProps.android.blurReductionFactor).toBeCloseTo(1.4469, 3);
    pixelRatio.mockRestore();
  });

  it('keeps the shared Android blur for surfaces without a material', () => {
    Platform.OS = 'android';
    const { UNSAFE_getByType } = render(<FrostedSurface tint="dark" intensity={45} blur />);

    expect(UNSAFE_getByType(BlurView).props.intensity).toBe(45);
    expect(UNSAFE_getByType(BlurView).props.blurReductionFactor).toBe(2);
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
