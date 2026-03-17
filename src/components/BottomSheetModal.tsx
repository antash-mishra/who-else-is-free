import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable } from "react-native";

import styles from "./BottomSheetModal.styles";

export type BottomSheetModalProps = {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
};

const SLIDE_DURATION = 250;
const SLIDE_DISTANCE = 300;

const BottomSheetModal = ({ visible, onClose, children }: BottomSheetModalProps) => {
    const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;

    useEffect(() => {
        if (visible) {
            slideAnim.setValue(SLIDE_DISTANCE);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, slideAnim]);

    const handleClose = () => {
        Animated.timing(slideAnim, {
            toValue: SLIDE_DISTANCE,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable
                style={styles.backdrop}
                onPress={handleClose}
                testID="bottom-sheet-backdrop"
                accessibilityRole="button"
            >
                <Animated.View
                    style={[
                        styles.content,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                    testID="bottom-sheet-modal"
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        {children}
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
};

export default BottomSheetModal;
