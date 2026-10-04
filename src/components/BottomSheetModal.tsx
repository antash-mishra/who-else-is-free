import React, { useEffect, useId, useLayoutEffect, useMemo } from 'react';

import { StyleProp, ViewStyle } from 'react-native';

import {
  BottomSheet,
  BottomSheetPresentation,
  useOptionalBottomSheetHost,
} from '@components/sheets';

export type BottomSheetModalProps = {
  visible: boolean;
  /** Inline overlays require the shared host; standalone usage stays a native modal. */
  presentation?: BottomSheetPresentation;
  /** Prepare/retain an inline sheet through the host for this owner's lifetime. */
  keepMounted?: boolean;
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
  /** Fired after the shared sheet has completed its entry transition. */
  onOpened?: () => void;
};

const BottomSheetModal = ({
  visible,
  presentation = 'modal',
  keepMounted = false,
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
  onOpened,
}: BottomSheetModalProps) => {
  const host = useOptionalBottomSheetHost();
  const ownerId = useId();
  const prepareInline = keepMounted && presentation === 'inline';
  const descriptor = useMemo(
    () => ({
      children,
      presentation,
      keepMounted: prepareInline,
      title,
      avoidKeyboard,
      snapHeight,
      onClose,
      testID,
      backdropTestID,
      closeTestID,
      contentTestID,
      contentStyle,
      onOpened,
    }),
    [
      avoidKeyboard,
      presentation,
      prepareInline,
      backdropTestID,
      children,
      closeTestID,
      contentStyle,
      contentTestID,
      onOpened,
      onClose,
      snapHeight,
      testID,
      title,
    ],
  );

  useLayoutEffect(() => {
    if (!host) {
      return;
    }

    if (prepareInline) host.prepare(ownerId, descriptor);
    if (visible) {
      host.present(ownerId, descriptor);
    } else {
      host.dismiss(ownerId);
    }
  }, [descriptor, host, ownerId, prepareInline, visible]);

  useEffect(() => {
    return () => {
      host?.dismiss(ownerId);
    };
  }, [host, ownerId]);

  useEffect(() => {
    if (!prepareInline) return undefined;
    return () => host?.release(ownerId);
  }, [host, ownerId, prepareInline]);

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
      onOpened={onOpened}
    >
      {children}
    </BottomSheet>
  );
};

export default BottomSheetModal;
