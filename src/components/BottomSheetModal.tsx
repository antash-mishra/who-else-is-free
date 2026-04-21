import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
    Easing,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import styles from "./BottomSheetModal.styles";

export type BottomSheetModalProps = {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Variant A: renders title + × header. Omit for Variant B (content-only). */
    title?: string;
};

const SLIDE_DISTANCE = 500;
const BASE_PADDING_BOTTOM = 8;

const BottomSheetModal = ({ visible, onClose, children, title }: BottomSheetModalProps) => {
    const { bottom: safeBottom } = useSafeAreaInsets();
    const basePadding = BASE_PADDING_BOTTOM + safeBottom;

    const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;
    // Controls sheet's paddingBottom — grows to push content above the keyboard
    // while the sheet itself stays anchored to the screen bottom (hidden behind keyboard)
    const keyboardPaddingAnim = useRef(new Animated.Value(basePadding)).current;
    const [modalVisible, setModalVisible] = useState(false);
    const hasBeenVisible = useRef(false);

    useEffect(() => {
        if (visible) {
            hasBeenVisible.current = true;
            setModalVisible(true);
            slideAnim.setValue(SLIDE_DISTANCE);
            backdropAnim.setValue(0);
            keyboardPaddingAnim.setValue(basePadding);

            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 280,
                    friction: 26,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 320,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]).start();
        } else if (hasBeenVisible.current) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: SLIDE_DISTANCE,
                    duration: 260,
                    easing: Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 0,
                    duration: 220,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
            ]).start(() => setModalVisible(false));
        }
    }, [visible, slideAnim, backdropAnim, keyboardPaddingAnim]);

    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        // Bezier approximation of iOS UIViewAnimationCurveKeyboard:
        // fast initial velocity, very short settle — matches the system keyboard spring.
        const IOS_KEYBOARD_CURVE = Easing.bezier(0.36, 0.66, 0.04, 1);

        const showSub = Keyboard.addListener(showEvent, (event) => {
            Animated.timing(keyboardPaddingAnim, {
                toValue: event.endCoordinates.height + 16,
                duration: event.duration || 250,
                easing: IOS_KEYBOARD_CURVE,
                useNativeDriver: false,
            }).start();
        });

        const hideSub = Keyboard.addListener(hideEvent, (event) => {
            Animated.timing(keyboardPaddingAnim, {
                toValue: basePadding,
                duration: (event as any).duration || 250,
                easing: IOS_KEYBOARD_CURVE,
                useNativeDriver: false,
            }).start();
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [keyboardPaddingAnim]);

    return (
        <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent>
            {/* Full-screen Pressable handles backdrop dismiss */}
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                testID="bottom-sheet-backdrop"
                accessibilityRole="button"
            >
                {/* Dim overlay — visual only, no touch */}
                <Animated.View
                    style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropAnim }]}
                    pointerEvents="none"
                />

                {/* Sheet is a child of the backdrop Pressable.
                    onStartShouldSetResponder claims all touches within the sheet,
                    preventing them from bubbling up to the backdrop Pressable.
                    Child buttons are deeper so they still claim touches first. */}
                <Animated.View
                    style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
                    testID="bottom-sheet-modal"
                    onStartShouldSetResponder={() => true}
                >
                    {/* JS-driver paddingBottom must be a separate node from native-driver transform */}
                    <Animated.View style={{ paddingBottom: keyboardPaddingAnim }}>
                        {title !== undefined && (
                            <View style={styles.header}>
                                <Text style={styles.title}>{title}</Text>
                                <Pressable
                                    onPress={onClose}
                                    style={styles.closeButton}
                                    accessibilityRole="button"
                                    testID="bottom-sheet-close"
                                >
                                    <Feather name="x" size={18} color="#999999" />
                                </Pressable>
                            </View>
                        )}
                        {children}
                    </Animated.View>
                </Animated.View>
            </Pressable>
        </Modal>
    );
};


export default BottomSheetModal;
