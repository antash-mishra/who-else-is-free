import { memo } from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { getAvatarGradient } from "@utils/avatar";

// Bleed a couple px past the frame so the gradient extends *under* any border a
// consumer adds (e.g. ProfileScreen's 1px ring). Without this, the frame's solid
// fallback backgroundColor shows through the translucent border as a contrasting
// rim. The parent's overflow:hidden clips the overscan back to the circle.
const BLEED = -2;

interface AvatarBackgroundProps {
  seed?: number | string | null;
  name?: string | null;
}

/**
 * Gradient fill for a no-photo avatar. Absolutely fills a rounded,
 * overflow-hidden parent (UserAvatar frame or the profile placeholder) and
 * renders a diagonal (top-left → bottom-right) two-stop gradient chosen
 * deterministically from the seed.
 */
const AvatarBackground = ({ seed, name }: AvatarBackgroundProps) => {
  const colors = getAvatarGradient(seed, name);
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
      pointerEvents="none"
    />
  );
};

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: BLEED,
    left: BLEED,
    right: BLEED,
    bottom: BLEED,
  },
});

export default memo(AvatarBackground);
