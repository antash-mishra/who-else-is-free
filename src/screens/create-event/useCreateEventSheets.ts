import { useCallback, useEffect, useRef, useState } from 'react';

import { Keyboard, Platform } from 'react-native';

export type CreateEventSheet =
  | 'age'
  | 'gender'
  | 'groupType'
  | 'cover'
  | 'dateTime'
  | 'location'
  | 'signIn';

const SHEET_CLOSE_DURATION_MS = 320;
const KEYBOARD_SHEET_SETTLE_DELAY_MS = Platform.OS === 'ios' ? 90 : 140;
const KEYBOARD_SHEET_OPEN_FALLBACK_MS = Platform.OS === 'ios' ? 420 : 360;

/**
 * Create/Edit Event sheet routing state machine.
 *
 * `activeSheet` drives the bottom sheet open/close animation while
 * `renderedSheet` keeps the sheet content mounted during the close animation.
 * Opening a sheet while the keyboard is up is deferred until the keyboard has
 * settled (with a fallback timer) so the sheet and keyboard transitions do not
 * fight each other.
 */
export const useCreateEventSheets = () => {
  const [activeSheet, setActiveSheet] = useState<CreateEventSheet | null>(null);
  const [renderedSheet, setRenderedSheet] = useState<CreateEventSheet | null>(null);
  const renderedSheetRef = useRef<CreateEventSheet | null>(null);
  const keyboardVisibleRef = useRef(false);
  const pendingSheetRef = useRef<CreateEventSheet | null>(null);
  const pendingSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderedSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    renderedSheetRef.current = renderedSheet;
  }, [renderedSheet]);

  const clearPendingSheetOpen = useCallback(() => {
    if (pendingSheetTimerRef.current) {
      clearTimeout(pendingSheetTimerRef.current);
      pendingSheetTimerRef.current = null;
    }
    if (keyboardSettleTimerRef.current) {
      clearTimeout(keyboardSettleTimerRef.current);
      keyboardSettleTimerRef.current = null;
    }
    pendingSheetRef.current = null;
  }, []);

  const clearRenderedSheetClose = useCallback(() => {
    if (renderedSheetTimerRef.current) {
      clearTimeout(renderedSheetTimerRef.current);
      renderedSheetTimerRef.current = null;
    }
  }, []);

  const presentSheet = useCallback(
    (sheet: CreateEventSheet) => {
      clearRenderedSheetClose();
      setRenderedSheet(sheet);
      setActiveSheet(sheet);
    },
    [clearRenderedSheetClose],
  );

  const closeSheetImmediately = useCallback(() => {
    clearPendingSheetOpen();
    clearRenderedSheetClose();
    setActiveSheet(null);
    setRenderedSheet(null);
  }, [clearPendingSheetOpen, clearRenderedSheetClose]);

  const closeActiveSheet = useCallback(() => {
    clearPendingSheetOpen();
    Keyboard.dismiss();
    setActiveSheet(null);
    clearRenderedSheetClose();
    const sheetToUnmount = renderedSheetRef.current;
    renderedSheetTimerRef.current = setTimeout(() => {
      setRenderedSheet(null);
      if (renderedSheetRef.current === sheetToUnmount) {
        renderedSheetRef.current = null;
      }
      renderedSheetTimerRef.current = null;
    }, SHEET_CLOSE_DURATION_MS);
  }, [clearPendingSheetOpen, clearRenderedSheetClose]);

  const openSheet = useCallback(
    (sheet: CreateEventSheet) => {
      clearPendingSheetOpen();
      Keyboard.dismiss();

      if (keyboardVisibleRef.current) {
        pendingSheetRef.current = sheet;
        pendingSheetTimerRef.current = setTimeout(() => {
          if (pendingSheetRef.current !== sheet) {
            return;
          }
          pendingSheetRef.current = null;
          pendingSheetTimerRef.current = null;
          keyboardSettleTimerRef.current = setTimeout(() => {
            keyboardSettleTimerRef.current = null;
            presentSheet(sheet);
          }, KEYBOARD_SHEET_SETTLE_DELAY_MS);
        }, KEYBOARD_SHEET_OPEN_FALLBACK_MS);
        return;
      }

      presentSheet(sheet);
    },
    [clearPendingSheetOpen, presentSheet],
  );

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      const pendingSheet = pendingSheetRef.current;
      if (!pendingSheet) {
        return;
      }
      if (pendingSheetTimerRef.current) {
        clearTimeout(pendingSheetTimerRef.current);
        pendingSheetTimerRef.current = null;
      }
      pendingSheetRef.current = null;
      keyboardSettleTimerRef.current = setTimeout(() => {
        keyboardSettleTimerRef.current = null;
        presentSheet(pendingSheet);
      }, KEYBOARD_SHEET_SETTLE_DELAY_MS);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [clearPendingSheetOpen, presentSheet]);

  useEffect(() => {
    return () => {
      clearPendingSheetOpen();
      clearRenderedSheetClose();
    };
  }, [clearPendingSheetOpen, clearRenderedSheetClose]);

  return {
    activeSheet,
    renderedSheet,
    openSheet,
    closeActiveSheet,
    closeSheetImmediately,
  };
};

export default useCreateEventSheets;
