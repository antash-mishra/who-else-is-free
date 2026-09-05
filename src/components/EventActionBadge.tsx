/* eslint-disable react-hooks/immutability -- Reanimated badge animation mutates shared values from effects and gesture handlers. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { typography, Springs } from '@theme/index';

const BADGE_HOLD_MS = 3000;
const FADE_MS = 180;

type EventActionBadgeProps = {
  visible: boolean;
  label: string;
  topOffset?: number;
  onHidden?: () => void;
};

const EventActionBadge = ({ visible, label, topOffset = 59, onHidden }: EventActionBadgeProps) => {
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const [isRendered, setIsRendered] = useState(false);
  const onHiddenRef = useRef<EventActionBadgeProps['onHidden']>(onHidden);

  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);

  const finish = useCallback(() => {
    setIsRendered(false);
    onHiddenRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    cancelAnimation(translateY);
    cancelAnimation(opacity);
    opacity.value = withTiming(0, { duration: FADE_MS });
    translateY.value = withTiming(-80, { duration: FADE_MS }, (completed) => {
      if (completed) {
        runOnJS(finish)();
      }
    });
  }, [finish, opacity, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy < -8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20 || gestureState.vy < -0.5) {
          dismiss();
        }
      },
    }),
  ).current;

  useEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(opacity);

    if (!visible) {
      setIsRendered(false);
      translateY.value = -80;
      opacity.value = 0;
      return;
    }

    setIsRendered(true);
    translateY.value = -80;
    opacity.value = 0;

    if (reducedMotion) {
      // No travel: fade in, hold, fade out.
      translateY.value = 0;
      opacity.value = withSequence(
        withTiming(1, { duration: FADE_MS }),
        withDelay(
          BADGE_HOLD_MS,
          withTiming(0, { duration: FADE_MS }, (completed) => {
            if (completed) {
              runOnJS(finish)();
            }
          }),
        ),
      );
      return;
    }

    opacity.value = withSequence(
      withTiming(1, { duration: FADE_MS }),
      withDelay(BADGE_HOLD_MS, withTiming(0, { duration: FADE_MS })),
    );
    translateY.value = withSequence(
      withSpring(0, Springs.bouncyUp),
      withDelay(
        BADGE_HOLD_MS,
        withTiming(-80, { duration: FADE_MS }, (completed) => {
          if (completed) {
            runOnJS(finish)();
          }
        }),
      ),
    );

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(opacity);
    };
  }, [finish, opacity, reducedMotion, translateY, visible]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!isRendered) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.badge, { top: topOffset }, badgeStyle]}
      {...panResponder.panHandlers}
    >
      <BlurView intensity={65} tint="dark" style={[StyleSheet.absoluteFill, styles.blurClip]} />
      <View style={styles.badgeOverlay} />
      <Text style={styles.badgeText}>{label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 20,
    maxWidth: '92%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
  },
  blurClip: {
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  badgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000066',
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
});

export default EventActionBadge;
