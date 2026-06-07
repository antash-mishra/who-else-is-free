import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedKeyboard,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CloseIcon from '@assets/ui/close.svg';

import { triggerHaptic } from '@services/haptics';
import { Springs } from '@theme/springs';
import styles from './BottomSheetModal.styles';

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

const BottomSheetModal = ({
  visible,
  onClose,
  children,
  title,
  avoidKeyboard = true,
  snapHeight,
}: BottomSheetModalProps) => {
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
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
    slideAnim.value = screenHeight;
    backdropAnim.value = 0;
    slideAnim.value = withSpring(0, Springs.bouncyUp);
    backdropAnim.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.cubic) });
  }, [screenHeight]);

  useEffect(() => {
    if (visible) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      hasBeenVisible.current = true;
      if (modalVisibleRef.current) {
        startOpenAnimation();
      } else {
        shouldAnimateOnShowRef.current = true;
        modalVisibleRef.current = true;
        setModalVisible(true);
      }
    } else if (hasBeenVisible.current) {
      Keyboard.dismiss();
      slideAnim.value = withTiming(screenHeight, {
        duration: 280,
        easing: Easing.in(Easing.cubic),
      });
      backdropAnim.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
      dismissTimerRef.current = setTimeout(() => {
        modalVisibleRef.current = false;
        setModalVisible(false);
      }, 300);
    }
  }, [backdropAnim, screenHeight, slideAnim, startOpenAnimation, visible]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const handleShow = useCallback(() => {
    if (!shouldAnimateOnShowRef.current) {
      return;
    }
    shouldAnimateOnShowRef.current = false;
    startOpenAnimation();
  }, [startOpenAnimation]);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={handleShow}
    >
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
          style={[
            styles.sheet,
            { maxHeight: sheetMaxHeight },
            snapHeight ? { height: snapHeight } : null,
            sheetStyle,
          ]}
          testID="bottom-sheet-modal"
          onStartShouldSetResponder={() => true}
        >
          <Animated.View
            style={[styles.keyboardContent, keyboardStyle, snapHeight ? { flex: 1 } : null]}
          >
            {title !== undefined && (
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
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
