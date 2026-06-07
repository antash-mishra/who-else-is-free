import React from 'react';

import { BottomSheet } from '@components/sheets';

export type BottomSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Variant A: renders title + close header. Omit for Variant B (content-only). */
  title?: string;
  /** Set to false to disable keyboard avoidance. Default: true. */
  avoidKeyboard?: boolean;
  /** Pin the sheet to an exact height instead of sizing to content. */
  snapHeight?: number;
};

const BottomSheetModal = ({
  visible,
  onClose,
  children,
  title,
  avoidKeyboard = true,
  snapHeight,
}: BottomSheetModalProps) => (
  <BottomSheet
    visible={visible}
    onClose={onClose}
    title={title}
    avoidKeyboard={avoidKeyboard}
    snapHeight={snapHeight}
    presentation="modal"
    testID="bottom-sheet-modal"
    backdropTestID="bottom-sheet-backdrop"
    closeTestID="bottom-sheet-close"
  >
    {children}
  </BottomSheet>
);

export default BottomSheetModal;
