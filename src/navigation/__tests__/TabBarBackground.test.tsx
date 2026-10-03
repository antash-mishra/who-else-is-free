import React from 'react';

import { Platform, StyleSheet, View } from 'react-native';

import { render } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';

import { TabBarBackground } from '../TabBarBackground';

describe('TabBarBackground', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it.each(['ios', 'android'] as const)(
    'restores the January frosted background on %s with a 60%% overlay',
    (os) => {
      Platform.OS = os;
      const { UNSAFE_getByType, UNSAFE_getAllByType } = render(<TabBarBackground />);

      const blur = UNSAFE_getByType(BlurView);
      expect(blur.props.tint).toBe('light');
      expect(blur.props.intensity).toBe(54);
      expect(blur.props.experimentalBlurMethod).toBe(
        os === 'android' ? 'dimezisBlurView' : undefined,
      );

      const views = UNSAFE_getAllByType(View);
      const overlay = views.find(
        (view) =>
          StyleSheet.flatten(view.props.style)?.backgroundColor === 'rgba(251, 251, 251, 0.6)',
      );
      expect(overlay).toBeDefined();
      expect(StyleSheet.flatten(overlay?.props.style)).toMatchObject(StyleSheet.absoluteFillObject);
      expect(StyleSheet.flatten(views[0].props.style)).toMatchObject({
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
      });
    },
  );
});
