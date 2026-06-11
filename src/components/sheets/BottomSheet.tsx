/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect -- Reanimated sheet transitions mutate shared values and mount state around animations. */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';

import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, componentTokens, layout, radii, shadows, spacing } from '@theme/index';
import { Springs } from '@theme/springs';

import SheetHeader from './SheetHeader';

export type BottomSheetPresentation = 'modal' | 'inline';
export type BottomSheetAnimation = 'spring' | 'timing';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  avoidKeyboard?: boolean;
  snapHeight?: number;
  presentation?: BottomSheetPresentation;
  animation?: BottomSheetAnimation;
  testID?: string;
  backdropTestID?: string;
  closeTestID?: string;
  contentTestID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  onClosed?: () => void;
};

const BASE_PADDING_BOTTOM = 8;
const MIN_TOP_GUTTER = 96;
const MODAL_CLOSE_DURATION_MS = 300;
const INLINE_CLOSE_DURATION_MS = 220;

const BottomSheet = ({
  visible,
  onClose,
  children,
  title,
  avoidKeyboard = true,
  snapHeight,
  presentation = 'modal',
  animation = presentation === 'modal' ? 'spring' : 'timing',
  testID = 'bottom-sheet-modal',
  backdropTestID = 'bottom-sheet-backdrop',
  closeTestID = 'bottom-sheet-close',
  contentTestID,
  contentStyle,
  onClosed,
}: BottomSheetProps) => {
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(visible);
  const isMountedRef = useRef(visible);
  const hasBeenVisible = useRef(visible);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClosedRef = useRef(onClosed);
  const shouldAnimateOnShowRef = useRef(false);
  const slideY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);
  const keyboardOffset = useSharedValue(0);
  const topGutter = Math.max(safeTop + 12, MIN_TOP_GUTTER);
  const sheetMaxHeight = Math.max(screenHeight - topGutter, screenHeight * 0.5);
  const closeDuration =
    presentation === 'modal' ? MODAL_CLOSE_DURATION_MS : INLINE_CLOSE_DURATION_MS;

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value - (avoidKeyboard ? keyboardOffset.value : 0) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  const keyboardContentStyle = { paddingBottom: BASE_PADDING_BOTTOM + safeBottom };

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    if (!avoidKeyboard) {
      keyboardOffset.value = withTiming(0, {
        duration: 160,
        easing: Easing.out(Easing.cubic),
      });
      return undefined;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const updateKeyboardOffset = (event: KeyboardEvent) => {
      const heightFromScreen = Math.max(0, screenHeight - event.endCoordinates.screenY);
      const keyboardHeight = Math.max(heightFromScreen, event.endCoordinates.height ?? 0);
      keyboardOffset.value = withTiming(keyboardHeight, {
        duration: event.duration ?? 220,
        easing: Easing.out(Easing.cubic),
      });
    };
    const resetKeyboardOffset = (event?: KeyboardEvent) => {
      keyboardOffset.value = withTiming(0, {
        duration: event?.duration ?? 180,
        easing: Easing.out(Easing.cubic),
      });
    };
    const showSubscription = Keyboard.addListener(showEvent, updateKeyboardOffset);
    const hideSubscription = Keyboard.addListener(hideEvent, resetKeyboardOffset);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [avoidKeyboard, keyboardOffset, screenHeight]);

  const startOpenAnimation = useCallback(() => {
    slideY.value = screenHeight;
    backdropOpacity.value = 0;
    if (animation === 'spring') {
      slideY.value = withSpring(0, Springs.bouncyUp);
    } else {
      slideY.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    }
    backdropOpacity.value = withTiming(1, {
      duration: animation === 'spring' ? 100 : 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [animation, backdropOpacity, screenHeight, slideY]);

  const startCloseAnimation = useCallback(() => {
    Keyboard.dismiss();
    keyboardOffset.value = withTiming(0, {
      duration: Math.min(180, closeDuration),
      easing: Easing.out(Easing.cubic),
    });
    slideY.value = withTiming(screenHeight, {
      duration: closeDuration,
      easing: Easing.in(Easing.cubic),
    });
    backdropOpacity.value = withTiming(0, {
      duration: Math.min(200, closeDuration),
      easing: Easing.in(Easing.ease),
    });
  }, [backdropOpacity, closeDuration, keyboardOffset, screenHeight, slideY]);

  useEffect(() => {
    if (visible) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      hasBeenVisible.current = true;
      isMountedRef.current = true;
      if (presentation === 'modal' && !isMounted) {
        shouldAnimateOnShowRef.current = true;
        setIsMounted(true);
      } else {
        setIsMounted(true);
        requestAnimationFrame(startOpenAnimation);
      }
      return;
    }

    if (!hasBeenVisible.current || !isMountedRef.current) {
      return;
    }

    startCloseAnimation();
    closeTimerRef.current = setTimeout(() => {
      isMountedRef.current = false;
      setIsMounted(false);
      closeTimerRef.current = null;
      onClosedRef.current?.();
    }, closeDuration);
  }, [closeDuration, isMounted, presentation, startCloseAnimation, startOpenAnimation, visible]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleModalShow = useCallback(() => {
    if (!shouldAnimateOnShowRef.current) {
      return;
    }
    shouldAnimateOnShowRef.current = false;
    startOpenAnimation();
  }, [startOpenAnimation]);

  if (!isMounted) {
    return null;
  }

  const sheet = (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onClose}
      testID={backdropTestID}
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
        testID={testID}
        onStartShouldSetResponder={() => true}
      >
        <Animated.View
          style={[
            styles.keyboardContent,
            keyboardContentStyle,
            snapHeight ? styles.contentFill : null,
          ]}
          testID={contentTestID}
        >
          {title !== undefined ? (
            <View style={styles.header}>
              <SheetHeader title={title} onClose={onClose} closeTestID={closeTestID} />
            </View>
          ) : null}
          <View style={[styles.content, snapHeight ? styles.contentFill : null, contentStyle]}>
            {children}
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );

  if (presentation === 'inline') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
        {sheet}
      </View>
    );
  }

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={handleModalShow}
    >
      {sheet}
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: componentTokens.overlay.backdrop,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: layout.sheetZIndex,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    ...shadows.sheet,
    overflow: 'hidden',
  },
  keyboardContent: {
    flexShrink: 1,
  },
  content: {
    flexShrink: 1,
  },
  contentFill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});

export default BottomSheet;
