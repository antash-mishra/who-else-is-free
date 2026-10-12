import React from 'react';

import { PixelRatio, Platform, StyleSheet, View } from 'react-native';

import { render } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';

import { androidBlurReductionFactor, tabBarAndroidMaterial } from '@theme/materials';

import { TabBarBackground } from '../TabBarBackground';

describe('TabBarBackground', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  const renderBackground = (os: 'ios' | 'android') => {
    Platform.OS = os;
    const view = render(<TabBarBackground />);
    const views = view.UNSAFE_getAllByType(View);
    const overlay = views.find(
      (candidate) =>
        StyleSheet.flatten(candidate.props.style)?.backgroundColor === 'rgba(251, 251, 251, 0.6)',
    );
    return { blur: view.UNSAFE_getByType(BlurView), views, overlay };
  };

  it('keeps the 60% overlay over a light blur on iOS', () => {
    const { blur, views, overlay } = renderBackground('ios');

    expect(blur.props.tint).toBe('light');
    expect(overlay).toBeDefined();
    expect(StyleSheet.flatten(overlay?.props.style)).toMatchObject(StyleSheet.absoluteFillObject);
    expect(StyleSheet.flatten(views[0].props.style)).toMatchObject({
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    });
  });

  it('carries the overlay in the Android blur tint, not a view the blur would capture (#190)', () => {
    const { blur, views, overlay } = renderBackground('android');

    // Dimezis captures every view drawn above the blur, so an overlay sibling was blurred into
    // the material and then drawn over it again. The tint is applied after the blur; its LIGHT
    // alpha (0.78 x intensity / 100) must cover the 60% overlay plus a 10% material:
    // 1 - (1 - 0.6) x (1 - 0.1) = 0.64.
    expect(overlay).toBeUndefined();
    expect(blur.props.tint).toBe('light');
    expect((0.78 * blur.props.intensity) / 100).toBeGreaterThanOrEqual(0.64);
    expect(StyleSheet.flatten(views[0].props.style)).toMatchObject({
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    });
  });

  it('keeps the iOS material at intensity 54', () => {
    const { blur } = renderBackground('ios');

    expect(blur.props.intensity).toBe(54);
    expect(blur.props.experimentalBlurMethod).toBeUndefined();
  });

  it('uses the calibrated Android material so covers show through (#190)', () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2.75);
    const { blur } = renderBackground('android');

    expect(blur.props.experimentalBlurMethod).toBe('dimezisBlurView');
    expect(blur.props.intensity).toBe(tabBarAndroidMaterial.intensity);
    expect(blur.props.blurReductionFactor).toBeCloseTo(
      androidBlurReductionFactor(tabBarAndroidMaterial, 2.75),
      6,
    );
  });
});
