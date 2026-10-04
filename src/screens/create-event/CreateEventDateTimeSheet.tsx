import { memo, useCallback, useState } from 'react';

import { InteractionManager } from 'react-native';

import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import CreateEventBottomSheet from '@components/CreateEventBottomSheet';
import { EventDateTimePickerContent } from '@components/EventDateTimeModal';

interface CreateEventDateTimeSheetProps {
  visible: boolean;
  value: Date;
  minDate: Date;
  maxDate: Date;
  onClose: () => void;
  onConfirm: (value: Date) => void;
}

/** Android only: pay native wheel mounting after navigation settles, outside the tap path. */
const CreateEventDateTimeSheet = (props: CreateEventDateTimeSheetProps) => {
  const focused = useIsFocused();
  const [prepared, setPrepared] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => setPrepared(true));
      return () => {
        task.cancel();
        setPrepared(false);
      };
    }, []),
  );

  // An early tap takes the normal immediate path, even if preparation has not run yet.
  // Blur unmounts the adapter, releasing the retained native content from the shared host.
  if (!focused || (!prepared && !props.visible)) return null;

  return (
    <CreateEventBottomSheet
      visible={props.visible}
      presentation="inline"
      keepMounted
      title="Date & time"
      onClose={props.onClose}
    >
      <EventDateTimePickerContent {...props} prepareWhileHidden />
    </CreateEventBottomSheet>
  );
};

// Form typing must not rebuild the retained picker or update its host descriptor.
export default memo(CreateEventDateTimeSheet);
