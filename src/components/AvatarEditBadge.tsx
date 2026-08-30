import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { BlurView } from 'expo-blur';

import CameraIcon from '@assets/onboarding/camera.svg';
import { colors } from '@theme/index';

interface AvatarEditBadgeProps {
  /** Overrides the default bottom-right position over the avatar. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Frosted camera badge pinned to the corner of an editable avatar. Shared by
 * Onboarding and Edit Profile so the clipping and blur behavior stay identical.
 *
 * The badge is layered as shadow wrapper -> clipped circular surface -> blur
 * fill: the elevation shadow lives on its own layer while the blur/tint layer
 * is clipped to the circle. Rendering the blur unclipped (or relying on
 * `overflow: 'hidden'` alone on Android) leaks a rounded-square outline behind
 * the circular badge.
 *
 * `experimentalBlurMethod` opts Android into real Dimezis blurring; without it
 * expo-blur only draws a flat translucent tint on Android.
 */
const AvatarEditBadge = ({ style }: AvatarEditBadgeProps) => (
  <View style={[styles.shadow, style]}>
    <View style={styles.surface}>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={15}
        tint="light"
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />
      <CameraIcon width={20} height={20} color={colors.iconColor} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: 4,
    right: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  surface: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.avatarEditBadgeSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AvatarEditBadge;
