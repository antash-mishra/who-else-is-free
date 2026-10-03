/**
 * Frosted-material tint fills, used by `FrostedSurface` for surfaces that tint
 * without blurring (see its `blur` prop for when each path applies).
 *
 * The multipliers were fitted to the iOS rendering of `expo-blur`'s material,
 * sampled from the simulator across four surfaces, both tints, intensities
 * 15-60 and backdrops from rgb(39) to rgb(162). A fill of
 *
 *   alpha = (intensity / 100) * multiplier
 *
 * composited over the surface's own background reproduced every sampled channel
 * within 2.4/255 (<1%). So over a backdrop that is already smooth, this fill
 * and the real blur are indistinguishable, and both platforms can use it.
 *
 * Over photography they are not interchangeable: the tint alone leaves the
 * image's detail sharp. Native `blur` uses different capture/tint implementations
 * per platform, so historical measurements on a cover patch do not guarantee
 * parity for other callers. The avatar badge supplies an explicit Android source
 * and uses its independently calibrated `avatarBadgeMaterial` below.
 *
 * `intensity` keeps the 0-100 scale the blur uses so each surface retains its
 * own calibrated weight; it is a tint strength here, not a blur radius.
 */
export const frostedMaterials = {
  dark: { rgb: '0, 0, 0', multiplier: 0.52 },
  light: { rgb: '255, 255, 255', multiplier: 0.18 },
} as const;

export type FrostedMaterialTint = keyof typeof frostedMaterials;

/** Default tint strength, matching `BlurView`'s own default intensity. */
export const frostedMaterialDefaultIntensity = 50;

/**
 * Flat fill approximating a frosted material of `tint` at `intensity` (0-100).
 * Composite it over the surface's existing background rather than replacing it.
 */
export const frostedFill = (
  tint: FrostedMaterialTint,
  intensity: number = frostedMaterialDefaultIntensity,
): string => {
  const { rgb, multiplier } = frostedMaterials[tint];
  const clamped = Math.min(100, Math.max(0, intensity));
  const alpha = Math.round((clamped / 100) * multiplier * 1000) / 1000;
  return `rgba(${rgb}, ${alpha})`;
};

/** Android avatar material fitted to the unchanged iOS light badge at intensity 15.
 * Explicit radius and tint are independent of native Expo intensity semantics. */
export const avatarBadgeMaterial = {
  blurRadius: 4.5,
  tint: 'rgba(255, 255, 255, 0.62)',
  saturation: 1.1,
} as const;
