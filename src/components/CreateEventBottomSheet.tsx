import React from 'react';

import BottomSheetModal from './BottomSheetModal';

import type { BottomSheetPresentation } from './sheets';

type CreateEventBottomSheetProps = {
  visible: boolean;
  presentation?: BottomSheetPresentation;
  keepMounted?: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  snapHeight?: number;
  /** Lift the sheet above the keyboard (for text-entry sheets like Description). */
  avoidKeyboard?: boolean;
  onOpened?: () => void;
  /** Names the content shown; changing it while open morphs the sheet (see BottomSheetModal). */
  contentKey?: string;
};

const CreateEventBottomSheet = ({
  visible,
  presentation,
  keepMounted,
  title,
  children,
  onClose,
  snapHeight,
  avoidKeyboard = false,
  onOpened,
  contentKey,
}: CreateEventBottomSheetProps) => (
  <BottomSheetModal
    visible={visible}
    presentation={presentation}
    keepMounted={keepMounted}
    onClose={onClose}
    title={title}
    snapHeight={snapHeight}
    avoidKeyboard={avoidKeyboard}
    onOpened={onOpened}
    contentKey={contentKey}
    testID="create-event-bottom-sheet"
    backdropTestID="create-event-sheet-backdrop"
    closeTestID="create-event-sheet-close"
  >
    {children}
  </BottomSheetModal>
);

export default CreateEventBottomSheet;
