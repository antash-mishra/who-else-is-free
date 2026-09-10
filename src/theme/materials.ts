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
 * image's detail sharp. Those surfaces pass `blur` instead, which drives a real
 * blur on both platforms. Android's Dimezis overlay tracks the iOS material
 * within about 5/255 there, so no per-platform compensation is needed.
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
