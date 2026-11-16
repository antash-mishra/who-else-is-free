import { createContext, useContext } from 'react';

/**
 * True inside the copy of a sheet's previous content that fades out while the sheet
 * morphs to new content. That copy is a fresh mount, so content uses this to skip
 * mount-time side effects such as `autoFocus`, which would otherwise pull focus and
 * the keyboard away from the content fading in.
 */
export const OutgoingSheetLayerContext = createContext(false);

export const useIsOutgoingSheetLayer = () => useContext(OutgoingSheetLayerContext);
