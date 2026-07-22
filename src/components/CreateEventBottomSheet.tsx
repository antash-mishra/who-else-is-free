import React from 'react';

import BottomSheetModal from './BottomSheetModal';

type CreateEventBottomSheetProps = {
  visible: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  snapHeight?: number;
  /** Lift the sheet above the keyboard (for text-entry sheets like Description). */
  avoidKeyboard?: boolean;
};

const CreateEventBottomSheet = ({
  visible,
  title,
  children,
  onClose,
  snapHeight,
  avoidKeyboard = false,
}: CreateEventBottomSheetProps) => (
  <BottomSheetModal
    visible={visible}
    onClose={onClose}
    title={title}
    snapHeight={snapHeight}
    avoidKeyboard={avoidKeyboard}
    testID="create-event-bottom-sheet"
    backdropTestID="create-event-sheet-backdrop"
    closeTestID="create-event-sheet-close"
  >
    {children}
  </BottomSheetModal>
);

export default CreateEventBottomSheet;
