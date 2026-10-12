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

  it.each(['ios', 'android'] as const)('keeps the 60%% overlay over a light blur on %s', (os) => {
    const { blur, views, overlay } = renderBackground(os);

    expect(blur.props.tint).toBe('light');
    expect(overlay).toBeDefined();
    expect(StyleSheet.flatten(overlay?.props.style)).toMatchObject(StyleSheet.absoluteFillObject);
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
