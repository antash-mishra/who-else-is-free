import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { triggerHaptic } from '@services/haptics';

import BottomSheetModal from './BottomSheetModal';
import styles from './SelectionModal.styles';

export type SelectionModalProps<T> = {
  visible: boolean;
  title: string;
  options: readonly T[];
  selectedValue: T;
  onSelect: (value: T) => void;
  onConfirm: () => void;
  onClose: () => void;
  getLabel: (option: T) => string;
  getKey: (option: T) => string;
  isSelected: (option: T, selected: T) => boolean;
};

type SelectionModalContentProps<T> = Omit<SelectionModalProps<T>, 'visible' | 'title' | 'onClose'>;

export function SelectionModalContent<T>({
  options,
  selectedValue,
  onSelect,
  onConfirm,
  getLabel,
  getKey,
  isSelected,
}: SelectionModalContentProps<T>) {
  return (
    <>
      <View style={styles.chipsContainer}>
        {options.map((option) => {
          const selected = isSelected(option, selectedValue);
          return (
            <Pressable
              key={getKey(option)}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => {
                triggerHaptic('selection');
                onSelect(option);
              }}
              testID={`option-${getKey(option)}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {getLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={styles.selectButton}
        onPress={() => {
          triggerHaptic('light');
          onConfirm();
        }}
        testID="selection-modal-confirm"
        accessibilityRole="button"
      >
        <Text style={styles.selectButtonText}>Select</Text>
      </Pressable>
    </>
  );
}

function SelectionModal<T>({ visible, title, onClose, ...contentProps }: SelectionModalProps<T>) {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={title}>
      <SelectionModalContent {...contentProps} />
    </BottomSheetModal>
  );
}

export default SelectionModal;
