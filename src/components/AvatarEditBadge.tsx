import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import CameraIcon from '@assets/onboarding/camera.svg';
import { FrostedSurface } from '@components/ui';
import { colors } from '@theme/index';

interface AvatarEditBadgeProps {
  /** Overrides the default bottom-right position over the avatar. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Frosted camera badge pinned to the corner of an editable avatar. Shared by
 * Onboarding and Edit Profile so the clipping and material stay identical.
 *
 * The badge is layered as shadow wrapper -> clipped circular surface -> material:
 * the shadow lives on its own layer while the material is clipped to the circle.
 * Rendering it unclipped (or relying on `overflow: 'hidden'` alone on Android)
 * leaks a rounded-square outline behind the circular badge.
 *
 * The material blurs. The badge straddles the avatar's edge, so a flat tint
 * leaves that hard boundary running through it; the blur mixes the page behind
 * the avatar into the badge, which is what iOS has always done here.
 *
 * The surface is deliberately translucent, so it carries no Android `elevation`.
 * Android tessellates an elevation shadow into a polygon and draws it behind the
 * caster, which shows straight through a 60%-opaque badge as an octagon. It went
 * unnoticed while a `BlurView` painted the badge interior opaquely. iOS keeps its
 * shadow: a soft 0.1-opacity gradient with no tessellation, and no artifact.
 */
const AvatarEditBadge = ({ style }: AvatarEditBadgeProps) => (
  <View style={[styles.shadow, style]}>
    <View style={styles.surface}>
      <FrostedSurface style={StyleSheet.absoluteFill} tint="light" intensity={15} blur />
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
    // Android cannot use `elevation` here: it tessellates its shadow into a
    // polygon drawn behind the caster, which shows straight through this
    // translucent badge as an octagon (visible even at elevation 1, and masked
    // before only because a BlurView painted the badge interior opaquely).
    // `boxShadow` is a real Gaussian shadow, so it matches the iOS material.
    // iOS keeps its original shadow props unchanged.
    ...Platform.select({
      ios: {
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)' },
    }),
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
