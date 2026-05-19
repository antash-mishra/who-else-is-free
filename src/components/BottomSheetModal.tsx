import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Keyboard,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    Easing,
} from "react-native-reanimated";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import CloseIcon from "@assets/ui/close.svg";
import * as Haptics from "expo-haptics";

import { Springs } from "@theme/springs";
import styles from "./BottomSheetModal.styles";

export type BottomSheetModalProps = {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Variant A: renders title + × header. Omit for Variant B (content-only). */
    title?: string;
};

const BASE_PADDING_BOTTOM = 8;
const MIN_TOP_GUTTER = 96;

// Bezier approximation of iOS UIViewAnimationCurveKeyboard
const IOS_KEYBOARD_EASING = Easing.bezier(0.36, 0.66, 0.04, 1);

const BottomSheetModal = ({ visible, onClose, children, title }: BottomSheetModalProps) => {
    const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const basePadding = BASE_PADDING_BOTTOM + safeBottom;
    const topGutter = Math.max(safeTop + 12, MIN_TOP_GUTTER);
    const sheetMaxHeight = Math.max(screenHeight - topGutter, screenHeight * 0.5);

    const slideAnim = useSharedValue(screenHeight);
    const backdropAnim = useSharedValue(0);
    const keyboardPaddingAnim = useSharedValue(basePadding);
    const [modalVisible, setModalVisible] = useState(false);
    const hasBeenVisible = useRef(false);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: slideAnim.value }],
    }));
    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropAnim.value,
    }));
    const keyboardStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboardPaddingAnim.value,
    }));

    const startOpenAnimation = useCallback(() => {
        slideAnim.value = screenHeight;
        backdropAnim.value = 0;
        keyboardPaddingAnim.value = basePadding;
        slideAnim.value = withSpring(0, Springs.bouncyUp);
        backdropAnim.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.cubic) });
    }, [basePadding, screenHeight]);

    useEffect(() => {
        if (visible) {
            if (dismissTimerRef.current) {
                clearTimeout(dismissTimerRef.current);
                dismissTimerRef.current = null;
            }
            hasBeenVisible.current = true;
            setModalVisible(true);
            // Animation starts in onShow, after the modal content is rendered
        } else if (hasBeenVisible.current) {
            slideAnim.value = withSpring(screenHeight, Springs.elegant);
            backdropAnim.value = withTiming(0, { duration: 120, easing: Easing.in(Easing.ease) });
            dismissTimerRef.current = setTimeout(() => setModalVisible(false), 400);
        }
    }, [visible, screenHeight]);

    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const showSub = Keyboard.addListener(showEvent, (event) => {
            keyboardPaddingAnim.value = withTiming(event.endCoordinates.height + 16, {
                duration: event.duration || 250,
                easing: IOS_KEYBOARD_EASING,
            });
        });

        const hideSub = Keyboard.addListener(hideEvent, (event) => {
            keyboardPaddingAnim.value = withTiming(basePadding, {
                duration: (event as any).duration || 250,
                easing: IOS_KEYBOARD_EASING,
            });
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [basePadding]);

    return (
        <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent onShow={startOpenAnimation}>
            {/* Full-screen Pressable handles backdrop dismiss */}
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                testID="bottom-sheet-backdrop"
                accessibilityRole="button"
            >
                {/* Dim overlay — visual only, no touch */}
                <Animated.View
                    style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
                    pointerEvents="none"
                />

                {/* Sheet is a child of the backdrop Pressable.
                    onStartShouldSetResponder claims all touches within the sheet,
                    preventing them from bubbling up to the backdrop Pressable.
                    Child buttons are deeper so they still claim touches first. */}
                <Animated.View
                    style={[styles.sheet, { maxHeight: sheetMaxHeight }, sheetStyle]}
                    testID="bottom-sheet-modal"
                    onStartShouldSetResponder={() => true}
                >
                    {/* Keyboard padding on a separate node since layout props
                        can't share the same Animated.View as transform. */}
                    <Animated.View style={[styles.keyboardContent, keyboardStyle]}>
                        {title !== undefined && (
                            <View style={styles.header}>
                                <Text style={styles.title}>{title}</Text>
                                <Pressable
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        onClose();
                                    }}
                                    style={styles.closeButton}
                                    accessibilityRole="button"
                                    testID="bottom-sheet-close"
                                >
                                    <CloseIcon width={18} height={18} color="#999999" />
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
