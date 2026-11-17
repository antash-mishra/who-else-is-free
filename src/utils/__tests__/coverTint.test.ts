import {
  SHEET_TINT_LIGHTNESS,
  SHEET_TINT_MAX_SATURATION,
  representativeColor,
  sheetTintFromColor,
} from '../coverTint';

const hexToHsl = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
};

const pixels = (...colors: [number, number, number][]) =>
  colors.flatMap(([r, g, b]) => [r, g, b, 255]);

describe('sheetTintFromColor', () => {
  it('keeps the sheet near-white with only a hint of colour', () => {
    const tint = sheetTintFromColor({ r: 220, g: 30, b: 60 });
    const { s, l } = hexToHsl(tint);

    expect(l).toBeCloseTo(SHEET_TINT_LIGHTNESS, 2);
    expect(s).toBeLessThanOrEqual(SHEET_TINT_MAX_SATURATION + 0.03);
    // Still reads as pink rather than grey.
    const n = parseInt(tint.slice(1), 16);
    expect((n >> 16) & 255).toBeGreaterThan(n & 255);
  });

  it('gives a neutral grey-white for a black and white cover', () => {
    expect(sheetTintFromColor({ r: 90, g: 90, b: 92 })).toMatch(/^#(F[0-9A-F]){3}$/);
    const tint = sheetTintFromColor({ r: 90, g: 90, b: 92 });
    expect(tint.slice(1, 3)).toBe(tint.slice(3, 5));
    expect(tint.slice(3, 5)).toBe(tint.slice(5, 7));
  });
});

describe('representativeColor', () => {
  it('lets the colourful parts of a photo set the hue over its dark shadows', () => {
    const color = representativeColor(
      pixels([10, 10, 10], [10, 10, 10], [10, 10, 10], [20, 160, 60]),
    );

    expect(color).not.toBeNull();
    expect(color!.g).toBeGreaterThan(color!.r);
    expect(color!.g).toBeGreaterThan(color!.b);
  });

  it('ignores transparent pixels and returns null when nothing is left', () => {
    expect(representativeColor([255, 0, 0, 0])).toBeNull();
  });
});
