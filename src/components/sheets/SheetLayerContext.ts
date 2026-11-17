import { createContext, useContext } from 'react';

import { colors } from '@theme/index';

/**
 * True inside the copy of a sheet's previous content that fades out while the sheet
 * morphs to new content. That copy is a fresh mount, so content uses this to skip
 * mount-time side effects such as `autoFocus`, which would otherwise pull focus and
 * the keyboard away from the content fading in.
 */
export const OutgoingSheetLayerContext = createContext(false);

export const useIsOutgoingSheetLayer = () => useContext(OutgoingSheetLayerContext);

/**
 * The sheet's background colour: white, or the `surfaceColor` it was given (Create plan
 * tints its sheets from the cover). Content that paints the sheet colour itself (fades
 * over a list, gaps around tiles) reads it here so it never shows as a white band.
 */
export const SheetSurfaceColorContext = createContext<string>(colors.background);

export const useSheetSurfaceColor = () => useContext(SheetSurfaceColorContext);
