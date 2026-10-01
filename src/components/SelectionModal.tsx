import React from 'react';

import { Pressable, Text, View } from 'react-native';

import { triggerHaptic } from '@services/haptics';

import BottomSheetModal from './BottomSheetModal';
import styles from './SelectionModal.styles';

export type SelectionModalProps<T, Selection = T> = {
  visible: boolean;
  title: string;
  options: readonly T[];
  selectedValue: Selection;
  onSelect: (value: T) => void;
  onConfirm: () => void;
  onClose: () => void;
  getLabel: (option: T) => string;
  getKey: (option: T) => string;
  isSelected: (option: T, selected: Selection) => boolean;
  confirmDisabled?: boolean;
  helperText?: string;
};

type SelectionModalContentProps<T, Selection = T> = Omit<
  SelectionModalProps<T, Selection>,
  'visible' | 'title' | 'onClose'
>;

export function SelectionModalContent<T, Selection = T>({
  options,
  selectedValue,
  onSelect,
  onConfirm,
  getLabel,
  getKey,
  isSelected,
  confirmDisabled = false,
  helperText,
}: SelectionModalContentProps<T, Selection>) {
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
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`option-${getKey(option)}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {getLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {helperText && <Text style={[styles.chipText, styles.helperText]}>{helperText}</Text>}
      <Pressable
        style={[styles.selectButton, confirmDisabled && styles.selectButtonDisabled]}
        disabled={confirmDisabled}
        accessibilityState={{ disabled: confirmDisabled }}
        onPress={() => {
          triggerHaptic('light');
          onConfirm();
        }}
        testID="selection-modal-confirm"
        accessibilityRole="button"
      >
        <Text style={[styles.selectButtonText, confirmDisabled && styles.selectButtonTextDisabled]}>
          Done
        </Text>
      </Pressable>
    </>
  );
}

function SelectionModal<T, Selection = T>({
  visible,
  title,
  onClose,
  ...contentProps
}: SelectionModalProps<T, Selection>) {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={title}>
      <SelectionModalContent {...contentProps} />
    </BottomSheetModal>
  );
}

export default SelectionModal;
