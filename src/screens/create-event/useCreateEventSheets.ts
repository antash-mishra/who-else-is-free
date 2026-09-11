import { useCallback, useEffect, useRef, useState } from 'react';

import { Keyboard, Platform } from 'react-native';

import { KeyboardEvents } from 'react-native-keyboard-controller';

export type CreateEventSheet =
  | 'age'
  | 'gender'
  | 'groupType'
  | 'cover'
  | 'dateTime'
  | 'location'
  | 'description'
  | 'signIn';

const SHEET_CLOSE_DURATION_MS = 320;
/**
 * Safety net only. `keyboardWillHide` drives the normal path; this fires the
 * sheet anyway if the event never arrives (an OEM keyboard that reports no
 * animation, a hardware keyboard being detached, and so on).
 */
const KEYBOARD_SHEET_OPEN_FALLBACK_MS = Platform.OS === 'ios' ? 420 : 360;

/**
 * Create/Edit Event sheet routing state machine.
 *
 * `activeSheet` drives the bottom sheet open/close animation while
 * `renderedSheet` keeps the sheet content mounted during the close animation.
 * Opening a sheet while the keyboard is up waits for `keyboardWillHide`, which
 * fires as the dismissal *starts*, so the sheet rises while the keyboard falls
 * instead of after it. `keyboardDidHide` (React Native's own event, and the
 * previous trigger) only fires once the keyboard has finished animating, which
 * forced the two transitions to run back to back.
 *
 * `KeyboardEvents` comes from react-native-keyboard-controller because React
 * Native's `Keyboard` module emits the will-events on iOS only; this gives the
 * same start-of-animation signal on Android.
 */
export const useCreateEventSheets = () => {
  const [activeSheet, setActiveSheet] = useState<CreateEventSheet | null>(null);
  const [renderedSheet, setRenderedSheet] = useState<CreateEventSheet | null>(null);
  const renderedSheetRef = useRef<CreateEventSheet | null>(null);
  const keyboardVisibleRef = useRef(false);
  const pendingSheetRef = useRef<CreateEventSheet | null>(null);
  const pendingSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderedSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    renderedSheetRef.current = renderedSheet;
  }, [renderedSheet]);

  const clearPendingSheetOpen = useCallback(() => {
    if (pendingSheetTimerRef.current) {
      clearTimeout(pendingSheetTimerRef.current);
      pendingSheetTimerRef.current = null;
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

      if (!keyboardVisibleRef.current) {
        presentSheet(sheet);
        return;
      }

      // Arm the pending sheet *before* dismissing: `keyboardWillHide` can be
      // delivered inside the `dismiss()` call itself, and the listener needs
      // something to open when it arrives.
      pendingSheetRef.current = sheet;
      pendingSheetTimerRef.current = setTimeout(() => {
        pendingSheetTimerRef.current = null;
        if (pendingSheetRef.current !== sheet) {
          return;
        }
        pendingSheetRef.current = null;
        presentSheet(sheet);
      }, KEYBOARD_SHEET_OPEN_FALLBACK_MS);

      Keyboard.dismiss();
    },
    [clearPendingSheetOpen, presentSheet],
  );

  useEffect(() => {
    const showSubscription = KeyboardEvents.addListener('keyboardWillShow', () => {
      keyboardVisibleRef.current = true;
    });
    const hideSubscription = KeyboardEvents.addListener('keyboardWillHide', () => {
      // Fires as the dismissal begins, so the keyboard is on its way out.
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
      // No settle delay: presenting now lets the sheet's entry overlap the
      // keyboard's exit, which is the whole point of using the will-event.
      presentSheet(pendingSheet);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [presentSheet]);

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
