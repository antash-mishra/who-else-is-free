import React from 'react';

import { Platform, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import { BlurView } from 'expo-blur';

import { FrostedMaterialTint, frostedFill, frostedMaterialDefaultIntensity } from '@theme/index';

/** See `blurReductionFactor` on the BlurView below. */
const ANDROID_BLUR_REDUCTION = 2;

export interface FrostedSurfaceProps extends Omit<ViewProps, 'style'> {
  /** Material colour family: `dark` tints toward black, `light` toward white. */
  tint: FrostedMaterialTint;
  /** Tint strength on the 0-100 scale. Defaults to 50. */
  intensity?: number;
  /**
   * Blur the content behind the surface as well as tinting it.
   *
   * Set this when the surface sits over photography: a tint alone lets sharp
   * image detail read straight through, so the surface looks like a translucent
   * window rather than frosted glass. Measured on the Create Event cover chip,
   * the cover behind it varies by 46 (luminance sd); blurred that falls to 6,
   * tinted alone it stays at 34.
   *
   * Leave it off over backdrops that are already smooth — a gradient, a flat
   * surface, or an image that is itself blurred. There a blur is measurably
   * redundant (Event Details hero buttons: 9 behind, 5 blurred) and on Android
   * costs a live capture of the screen behind it on every frame.
   */
  blur?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Shared frosted-glass surface. Owns the material for every frosted element in
 * the app (cover chip, avatar edit badge, hero buttons, tab bar, badges) so
 * they render the same on iOS and Android.
 *
 * `expo-blur`'s `BlurView` could not do that on its own: iOS ran a real
 * `UIVisualEffectView`, while Android painted a flat scrim unless a surface
 * passed `experimentalBlurMethod`, and only some of ours did. The same
 * component therefore blurred on one platform and not the other. This component
 * makes the choice once per surface and applies it to both platforms —
 * including Android's opt-in — so the two never diverge again.
 *
 * Layout matches the `BlurView` it replaces: the material is an absolutely
 * positioned layer above the surface's own background and below its children,
 * so existing styles (including their `backgroundColor` and
 * `overflow: 'hidden'`) keep working unchanged.
 */
const FrostedSurface: React.FC<FrostedSurfaceProps> = ({
  tint,
  intensity = frostedMaterialDefaultIntensity,
  blur = false,
  style,
  children,
  ...rest
}) => (
  <View {...rest} style={style}>
    {blur ? (
      <BlurView
        pointerEvents="none"
        tint={tint}
        intensity={intensity}
        // Android renders a flat scrim without this; iOS blurs natively.
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        // Android-only, and the reason it exists: Android divides `intensity` by
        // this to get its blur radius, and at the stock 4 its blur lands much
        // weaker than the iOS material. Calibrated against the Create Event
        // cover chip so both platforms smooth the cover to a comparable degree.
        blurReductionFactor={ANDROID_BLUR_REDUCTION}
        style={StyleSheet.absoluteFill}
      />
    ) : (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: frostedFill(tint, intensity) }]}
      />
    )}
    {children}
  </View>
);

export default FrostedSurface;
