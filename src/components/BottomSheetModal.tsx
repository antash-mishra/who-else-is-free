import React, { useEffect, useId, useMemo } from 'react';

import { StyleProp, ViewStyle } from 'react-native';

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
  testID?: string;
  backdropTestID?: string;
  closeTestID?: string;
  contentTestID?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

const BottomSheetModal = ({
  visible,
  onClose,
  children,
  title,
  avoidKeyboard = true,
  snapHeight,
  testID = 'bottom-sheet-modal',
  backdropTestID = 'bottom-sheet-backdrop',
  closeTestID = 'bottom-sheet-close',
  contentTestID,
  contentStyle,
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
      testID,
      backdropTestID,
      closeTestID,
      contentTestID,
      contentStyle,
    }),
    [
      avoidKeyboard,
      backdropTestID,
      children,
      closeTestID,
      contentStyle,
      contentTestID,
      onClose,
      snapHeight,
      testID,
      title,
    ],
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
      testID={testID}
      backdropTestID={backdropTestID}
      closeTestID={closeTestID}
      contentTestID={contentTestID}
      contentStyle={contentStyle}
    >
      {children}
    </BottomSheet>
  );
};

export default BottomSheetModal;
