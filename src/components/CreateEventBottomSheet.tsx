import React from 'react';

import { BottomSheet } from '@components/sheets';

type CreateEventBottomSheetProps = {
  visible: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  snapHeight?: number;
};

const CreateEventBottomSheet = ({
  visible,
  title,
  children,
  onClose,
  snapHeight,
}: CreateEventBottomSheetProps) => (
  <BottomSheet
    visible={visible}
    onClose={onClose}
    title={title}
    snapHeight={snapHeight}
    avoidKeyboard={false}
    presentation="inline"
    animation="timing"
    testID="create-event-bottom-sheet"
    backdropTestID="create-event-sheet-backdrop"
    closeTestID="create-event-sheet-close"
  >
    {children}
  </BottomSheet>
);

export default CreateEventBottomSheet;
