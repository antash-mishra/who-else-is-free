import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";

import { Feather } from "@expo/vector-icons";

import { colors } from "@theme/index";
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

const SLIDE_DURATION = 250;
const SLIDE_DISTANCE = 300;

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
    const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;

    useEffect(() => {
        if (visible) {
            // Reset to off-screen position and animate in
            slideAnim.setValue(SLIDE_DISTANCE);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, slideAnim]);

    const handleClose = () => {
        // Animate out before closing
        Animated.timing(slideAnim, {
            toValue: SLIDE_DISTANCE,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    };

    const handleConfirm = () => {
        // Animate out before confirming
        Animated.timing(slideAnim, {
            toValue: SLIDE_DISTANCE,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
        }).start(() => {
            onConfirm();
        });
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Animated.View
                    style={[
                        styles.content,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View style={styles.header}>
                            <Text style={styles.title}>{title}</Text>
                            <Pressable onPress={handleClose} style={styles.closeButton}>
                                <Feather name="x" size={18} color="#999999" />
                            </Pressable>
                        </View>

                        <View style={styles.chipsContainer}>
                            {options.map((option) => {
                                const selected = isSelected(option, selectedValue);
                                return (
                                    <Pressable
                                        key={getKey(option)}
                                        style={[
                                            styles.chip,
                                            selected && styles.chipSelected,
                                        ]}
                                        onPress={() => onSelect(option)}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                selected && styles.chipTextSelected,
                                            ]}
                                        >
                                            {getLabel(option)}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Pressable style={styles.selectButton} onPress={handleConfirm}>
                            <Text style={styles.selectButtonText}>Select</Text>
                        </Pressable>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

export default SelectionModal;
