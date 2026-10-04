import React from 'react';

import BottomSheetModal from './BottomSheetModal';

import type { BottomSheetPresentation } from './sheets';

type CreateEventBottomSheetProps = {
  visible: boolean;
  presentation?: BottomSheetPresentation;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  snapHeight?: number;
  /** Lift the sheet above the keyboard (for text-entry sheets like Description). */
  avoidKeyboard?: boolean;
  onOpened?: () => void;
};

const CreateEventBottomSheet = ({
  visible,
  presentation,
  title,
  children,
  onClose,
  snapHeight,
  avoidKeyboard = false,
  onOpened,
}: CreateEventBottomSheetProps) => (
  <BottomSheetModal
    visible={visible}
    presentation={presentation}
    onClose={onClose}
    title={title}
    snapHeight={snapHeight}
    avoidKeyboard={avoidKeyboard}
    onOpened={onOpened}
    testID="create-event-bottom-sheet"
    backdropTestID="create-event-sheet-backdrop"
    closeTestID="create-event-sheet-close"
  >
    {children}
  </BottomSheetModal>
);

export default CreateEventBottomSheet;
