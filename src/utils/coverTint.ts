/**
 * Create plan sheet tint: a near-white surface carrying a hint of the plan cover's
 * colour, so its sheets feel part of the cover-lit screen instead of a plain white
 * cut-out. Pure so the colour maths can be tested and tuned without decoding images.
 */

/** How light the tinted sheet is (HSL lightness, 0-1). Higher is closer to white. */
export const SHEET_TINT_LIGHTNESS = 0.94;
/** Cap on the tint's saturation (0-1), so vivid covers stay a hint, never a colour. */
export const SHEET_TINT_MAX_SATURATION = 0.28;
/** Below this source saturation the cover counts as neutral and the sheet stays grey-white. */
export const SHEET_TINT_NEUTRAL_SATURATION = 0.1;

type Rgb = { r: number; g: number; b: number };

const rgbToHsl = ({ r, g, b }: Rgb) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
};

const hslToHex = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`.toUpperCase();
};

/**
 * The cover's representative colour from RGBA pixels (a small downsample). Each pixel is
 * weighted by its saturation, so the colourful parts of a photo set the hue rather than
 * its shadows and highlights, which would average out to a muddy grey.
 */
export const representativeColor = (pixels: ArrayLike<number>): Rgb | null => {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 8) continue;
    const pixel = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    const { s, l } = rgbToHsl(pixel);
    // Near-black and near-white pixels carry little hue even when "saturated".
    const weight = 0.05 + s * s * (1 - Math.abs(2 * l - 1));
    r += pixel.r * weight;
    g += pixel.g * weight;
    b += pixel.b * weight;
    total += weight;
  }
  if (total === 0) return null;
  return { r: r / total, g: g / total, b: b / total };
};

/** The tinted sheet colour for a cover's representative colour. */
export const sheetTintFromColor = (color: Rgb): string => {
  const { h, s } = rgbToHsl(color);
  if (s < SHEET_TINT_NEUTRAL_SATURATION) return hslToHex(0, 0, SHEET_TINT_LIGHTNESS);
  return hslToHex(h, Math.min(s, SHEET_TINT_MAX_SATURATION), SHEET_TINT_LIGHTNESS);
};
