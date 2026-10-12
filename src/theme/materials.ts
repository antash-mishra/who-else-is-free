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

/** A surface's own Android blur: expo-blur tint strength plus an on-screen blur width. */
export type AndroidBlurMaterial = {
  /** expo-blur `intensity` on Android; it sets the tint alpha (LIGHT: 0.78 x intensity / 100). */
  intensity: number;
  /** Gaussian sigma of the blur on screen, in dp. */
  blurSigmaDp: number;
};

/**
 * Android tab bar material (#190), fitted on WEIF_API_36 against the iOS tab bar
 * over the same Discover covers.
 *
 * The shared Android blur (intensity 54, blurReductionFactor 2) left the bar flat
 * white: expo-blur painted its LIGHT tint at 42% beneath the 60% overlay, and the
 * Dimezis radius of 27 on a 6x-downsampled capture spread each cover across the
 * whole bar. 3.4% of a cover's contrast reached the bar (iOS 23.4%) and the edge
 * contrast under the bar was 7.3 (iOS 24.4). A 10% tint with a 19.5dp sigma
 * raised them to 9.9% and 23.5 at the same scroll position.
 */
export const tabBarAndroidMaterial: AndroidBlurMaterial = {
  intensity: 13,
  blurSigmaDp: 19.5,
};

/** Dimezis BlurView (expo-blur's Android blur) blurs a capture downsampled by this factor. */
const DIMEZIS_SCALE_FACTOR = 6;
/** Android's RenderEffect turns a blur radius r into a Gaussian sigma of 0.57735 r + 0.5. */
const RADIUS_TO_SIGMA = 0.57735;

/**
 * The expo-blur `blurReductionFactor` that gives `material.blurSigmaDp` on a screen
 * of `pixelRatio`. expo-blur sets the Dimezis radius to intensity / blurReductionFactor
 * in pixels of the downsampled capture, so one fixed factor blurs about 1.6x wider
 * (in dp) on a 1.75x screen than on a 2.75x phone.
 */
export const androidBlurReductionFactor = (
  material: AndroidBlurMaterial,
  pixelRatio: number,
): number => {
  const sigmaInCapture = (material.blurSigmaDp * pixelRatio) / DIMEZIS_SCALE_FACTOR;
  const radius = Math.max(1, (sigmaInCapture - 0.5) / RADIUS_TO_SIGMA);
  return material.intensity / radius;
};
