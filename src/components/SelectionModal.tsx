import React from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import BottomSheetModal from "./BottomSheetModal";
import styles from "./SelectionModal.styles";

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

function SelectionModal<T>({
    visible,
    title,
    options,
    selectedValue,
    onSelect,
    onConfirm,
    onClose,
    getLabel,
    getKey,
    isSelected,
}: SelectionModalProps<T>) {
    return (
        <BottomSheetModal visible={visible} onClose={onClose} title={title}>
            <View style={styles.chipsContainer}>
                {options.map((option) => {
                    const selected = isSelected(option, selectedValue);
                    return (
                        <Pressable
                            key={getKey(option)}
                            style={[styles.chip, selected && styles.chipSelected]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                onPress={onConfirm}
                testID="selection-modal-confirm"
                accessibilityRole="button"
            >
                <Text style={styles.selectButtonText}>Select</Text>
            </Pressable>
        </BottomSheetModal>
    );
}

export default SelectionModal;
