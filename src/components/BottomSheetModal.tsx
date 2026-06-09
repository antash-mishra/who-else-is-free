import React, { useEffect, useId, useMemo } from 'react';

import { BottomSheet, useOptionalBottomSheetHost } from '@components/sheets';

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
}: BottomSheetModalProps) => {
  const host = useOptionalBottomSheetHost();
  const ownerId = useId();
  const descriptor = useMemo(
    () => ({
      children,
      title,
      avoidKeyboard,
      snapHeight,
      onClose,
      testID: 'bottom-sheet-modal',
      backdropTestID: 'bottom-sheet-backdrop',
      closeTestID: 'bottom-sheet-close',
    }),
    [avoidKeyboard, children, onClose, snapHeight, title],
  );

  useEffect(() => {
    if (!host) {
      return;
    }

    if (visible) {
      host.present(ownerId, descriptor);
    } else {
      host.dismiss(ownerId);
    }
  }, [descriptor, host, ownerId, visible]);

  useEffect(() => {
    return () => {
      host?.dismiss(ownerId);
    };
  }, [host, ownerId]);

  if (host) {
    return null;
  }

  return (
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
};

export default BottomSheetModal;
