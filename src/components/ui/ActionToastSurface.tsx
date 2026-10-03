import React from 'react';

import { Platform, processColor, StyleSheet, View, ViewProps } from 'react-native';

import { colors, componentTokens } from '@theme/index';

import FrostedSurface from './FrostedSurface';
import NativeToastBlur from './NativeToastBlur';

/** Preserves Apple's material; Android controls its capture, tint, and dp radius. */
const ActionToastSurface = ({ children, ...props }: ViewProps) => {
  if (Platform.OS === 'android') {
    const materialColor = processColor(colors.actionToastAndroidMaterial);
    if (typeof materialColor !== 'number') {
      throw new Error('The action toast material must be a static color.');
    }
    return (
      <NativeToastBlur
        {...props}
        blurSigmaDp={componentTokens.actionToast.androidBlurSigmaDp}
        materialColor={materialColor}
      >
        {children}
      </NativeToastBlur>
    );
  }

  return (
    <FrostedSurface
      {...props}
      blur
      tint="dark"
      intensity={componentTokens.actionToast.iosIntensity}
    >
      <View testID="action-toast-overlay" pointerEvents="none" style={styles.overlay} />
      {children}
    </FrostedSurface>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: componentTokens.overlay.backdrop,
  },
});

export default ActionToastSurface;
