import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Keyboard, Modal, Platform, Pressable } from "react-native";

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
    const keyboardAnim = useRef(new Animated.Value(0)).current;
    const [modalVisible, setModalVisible] = useState(false);
    const hasBeenVisible = useRef(false);

    useEffect(() => {
        if (visible) {
            hasBeenVisible.current = true;
            setModalVisible(true);
            slideAnim.setValue(SLIDE_DISTANCE);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start();
        } else if (hasBeenVisible.current) {
            Animated.timing(slideAnim, {
                toValue: SLIDE_DISTANCE,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start(() => {
                setModalVisible(false);
            });
        }
    }, [visible, slideAnim]);

    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const showSub = Keyboard.addListener(showEvent, (event) => {
            const windowHeight = Dimensions.get("window").height;
            const keyboardHeight = Math.max(0, windowHeight - (event.endCoordinates?.screenY ?? windowHeight));
            Animated.timing(keyboardAnim, {
                toValue: -keyboardHeight,
                duration: event.duration || SLIDE_DURATION,
                useNativeDriver: true,
            }).start();
        });

        const hideSub = Keyboard.addListener(hideEvent, () => {
            Animated.timing(keyboardAnim, {
                toValue: 0,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start();
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [keyboardAnim]);

    return (
        <Modal visible={modalVisible} transparent animationType="fade">
            <Pressable
                style={styles.backdrop}
                onPress={onClose}
                testID="bottom-sheet-backdrop"
                accessibilityRole="button"
            >
                <Animated.View style={{ transform: [{ translateY: keyboardAnim }] }}>
                    <Animated.View
                        style={[styles.content, { transform: [{ translateY: slideAnim }] }]}
                        testID="bottom-sheet-modal"
                    >
                        <Pressable onPress={(e) => e.stopPropagation()}>
                            {children}
                        </Pressable>
                    </Animated.View>
                </Animated.View>
            </Pressable>
        </Modal>
    );
};

export default BottomSheetModal;
