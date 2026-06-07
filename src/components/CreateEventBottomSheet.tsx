import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import CloseIcon from '@assets/ui/close.svg';
import { colors, componentTokens, layout, radii, shadows, spacing, typography } from '@theme/index';

type CreateEventBottomSheetProps = {
  visible: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  snapHeight?: number;
};

const OPEN_DURATION_MS = 260;
const CLOSE_DURATION_MS = 220;
const MIN_TOP_GUTTER = 96;
const BASE_PADDING_BOTTOM = 8;

const CreateEventBottomSheet = ({
  visible,
  title,
  children,
  onClose,
  snapHeight,
}: CreateEventBottomSheetProps) => {
  const { height: screenHeight } = useWindowDimensions();
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(visible);
  const isMountedRef = useRef(visible);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropOpacity = useSharedValue(0);
  const translateY = useSharedValue(screenHeight);
  const topGutter = Math.max(safeTop + 12, MIN_TOP_GUTTER);
  const sheetMaxHeight = Math.max(screenHeight - topGutter, screenHeight * 0.5);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (visible) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isMountedRef.current = true;
      setIsMounted(true);
      translateY.value = screenHeight;
      backdropOpacity.value = 0;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, {
          duration: OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        });
        backdropOpacity.value = withTiming(1, {
          duration: 140,
          easing: Easing.out(Easing.cubic),
        });
      });
      return;
    }

    if (!isMountedRef.current) {
      return;
    }

    translateY.value = withTiming(screenHeight, {
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
    });
    backdropOpacity.value = withTiming(0, {
      duration: 160,
      easing: Easing.in(Easing.ease),
    });
    closeTimerRef.current = setTimeout(() => {
      isMountedRef.current = false;
      setIsMounted(false);
      closeTimerRef.current = null;
    }, CLOSE_DURATION_MS);
  }, [backdropOpacity, screenHeight, translateY, visible]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isMounted) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable
        accessibilityRole="button"
        onPress={handleClose}
        style={StyleSheet.absoluteFill}
        testID="create-event-sheet-backdrop"
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          { maxHeight: sheetMaxHeight, paddingBottom: BASE_PADDING_BOTTOM + safeBottom },
          snapHeight ? { height: snapHeight } : null,
          sheetStyle,
        ]}
        testID="create-event-bottom-sheet"
      >
        {title !== undefined && (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              testID="create-event-sheet-close"
            >
              <CloseIcon
                width={componentTokens.iconButton.iconSm}
                height={componentTokens.iconButton.iconSm}
                color={colors.iconMuted}
              />
            </Pressable>
          </View>
        )}
        <View style={[styles.content, snapHeight ? styles.contentFill : null]}>{children}</View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: componentTokens.overlay.backdrop,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: 24,
    letterSpacing: -0.5,
  },
  closeButton: {
    width: componentTokens.iconButton.sm,
    height: componentTokens.iconButton.sm,
    borderRadius: radii.pill,
    backgroundColor: componentTokens.overlay.closeButtonBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexShrink: 1,
  },
  contentFill: {
    flex: 1,
  },
});

export default CreateEventBottomSheet;
