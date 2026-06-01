import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Keyboard,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedKeyboard,
    withSpring,
    withTiming,
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
    /** Set to false to disable keyboard avoidance. Default: true. */
    avoidKeyboard?: boolean;
    /** Pin the sheet to an exact height instead of sizing to content. */
    snapHeight?: number;
};

const BASE_PADDING_BOTTOM = 8;
const MIN_TOP_GUTTER = 96;

const logBottomSheetDebug = (
    event: string,
    details: Record<string, unknown> = {},
) => {
    if (!__DEV__) return;
    console.log(`[BottomSheetModal] ${event}`, {
        timestamp: new Date().toISOString(),
        ...details,
    });
};

const BottomSheetModal = ({ visible, onClose, children, title, avoidKeyboard = true, snapHeight }: BottomSheetModalProps) => {
    const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const sheetName = title ?? "content-only";
    const basePadding = BASE_PADDING_BOTTOM + safeBottom;
    const topGutter = Math.max(safeTop + 12, MIN_TOP_GUTTER);
    const sheetMaxHeight = Math.max(screenHeight - topGutter, screenHeight * 0.5);

    const keyboard = useAnimatedKeyboard();
    const slideAnim = useSharedValue(screenHeight);
    const backdropAnim = useSharedValue(0);
    const [modalVisible, setModalVisible] = useState(false);
    const modalVisibleRef = useRef(false);
    const hasBeenVisible = useRef(false);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shouldAnimateOnShowRef = useRef(false);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: slideAnim.value }],
    }));
    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropAnim.value,
    }));
    const keyboardStyle = useAnimatedStyle(() => {
        if (!avoidKeyboard) return { paddingBottom: basePadding };
        const kbHeight = keyboard.height.value;
        return {
            paddingBottom: kbHeight > 0 ? kbHeight + 16 : basePadding,
        };
    });

    const startOpenAnimation = useCallback(() => {
        logBottomSheetDebug("start open animation", {
            sheetName,
            screenHeight,
            modalVisible: modalVisibleRef.current,
            avoidKeyboard,
            snapHeight,
        });
        slideAnim.value = screenHeight;
        backdropAnim.value = 0;
        slideAnim.value = withSpring(0, Springs.bouncyUp);
        backdropAnim.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.cubic) });
    }, [avoidKeyboard, screenHeight, sheetName, snapHeight]);

    useEffect(() => {
        logBottomSheetDebug("visible prop changed", {
            sheetName,
            visible,
            modalVisible: modalVisibleRef.current,
            hasBeenVisible: hasBeenVisible.current,
        });
        if (visible) {
            if (dismissTimerRef.current) {
                logBottomSheetDebug("clear dismiss timer on reopen", {
                    sheetName,
                });
                clearTimeout(dismissTimerRef.current);
                dismissTimerRef.current = null;
            }
            hasBeenVisible.current = true;
            if (modalVisibleRef.current) {
                logBottomSheetDebug("reopen while native modal is mounted", {
                    sheetName,
                });
                startOpenAnimation();
            } else {
                shouldAnimateOnShowRef.current = true;
                modalVisibleRef.current = true;
                logBottomSheetDebug("mount native modal", {
                    sheetName,
                });
                setModalVisible(true);
            }
        } else if (hasBeenVisible.current) {
            logBottomSheetDebug("begin close animation", {
                sheetName,
                screenHeight,
            });
            Keyboard.dismiss();
            slideAnim.value = withTiming(screenHeight, { duration: 280, easing: Easing.in(Easing.cubic) });
            backdropAnim.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
            dismissTimerRef.current = setTimeout(() => {
                logBottomSheetDebug("unmount native modal after close", {
                    sheetName,
                });
                modalVisibleRef.current = false;
                setModalVisible(false);
            }, 300);
        }
    }, [backdropAnim, screenHeight, sheetName, slideAnim, startOpenAnimation, visible]);

    useEffect(() => {
        return () => {
            if (dismissTimerRef.current) {
                clearTimeout(dismissTimerRef.current);
            }
        };
    }, []);

    const handleShow = useCallback(() => {
        logBottomSheetDebug("native modal onShow", {
            sheetName,
            shouldAnimate: shouldAnimateOnShowRef.current,
        });
        if (!shouldAnimateOnShowRef.current) {
            return;
        }
        shouldAnimateOnShowRef.current = false;
        startOpenAnimation();
    }, [sheetName, startOpenAnimation]);

    return (
        <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent onShow={handleShow}>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                testID="bottom-sheet-backdrop"
                accessibilityRole="button"
            >
                <Animated.View
                    style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
                    pointerEvents="none"
                />

                <Animated.View
                    style={[styles.sheet, { maxHeight: sheetMaxHeight }, snapHeight ? { height: snapHeight } : null, sheetStyle]}
                    testID="bottom-sheet-modal"
                    onStartShouldSetResponder={() => true}
                >
                    <Animated.View style={[styles.keyboardContent, keyboardStyle, snapHeight ? { flex: 1 } : null]}>
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
