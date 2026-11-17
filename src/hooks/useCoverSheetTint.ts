import { useEffect, useState } from 'react';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

import { logger } from '@services/logger';
import { representativeColor, sheetTintFromColor } from '@utils/coverTint';

/** Side of the square the cover is shrunk to before sampling; enough for a colour. */
const SAMPLE_SIZE = 16;

// Covers repeat across sessions (catalog) and opens of the same draft, so remember them.
const tintCache = new Map<string, string>();

const sampleCoverTint = async (uri: string): Promise<string | null> => {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) return null;
  const surface = Skia.Surface.Make(SAMPLE_SIZE, SAMPLE_SIZE);
  if (!surface) return null;
  const paint = Skia.Paint();
  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE),
      paint,
    );
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: SAMPLE_SIZE,
    height: SAMPLE_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels || pixels instanceof Float32Array) return null;
  const color = representativeColor(pixels);
  return color ? sheetTintFromColor(color) : null;
};

/**
 * Near-white sheet colour carrying a hint of the cover's colour (see coverTint.ts).
 * Undefined until a cover has been sampled, and if sampling fails, so callers fall back
 * to the normal white sheet. While a newly chosen cover is sampled it keeps the previous
 * cover's tint, so an open sheet never flashes white.
 */
export function useCoverSheetTint(uri: string | null | undefined): string | undefined {
  const [latest, setLatest] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!uri || tintCache.has(uri)) return undefined;
    let active = true;
    sampleCoverTint(uri)
      .then((next) => {
        if (!next) return;
        tintCache.set(uri, next);
        if (active) setLatest(next);
      })
      .catch((error) => {
        logger.warn('Create plan sheet tint: could not sample the cover', error);
      });
    return () => {
      active = false;
    };
  }, [uri]);

  if (!uri) return undefined;
  return tintCache.get(uri) ?? latest;
}
