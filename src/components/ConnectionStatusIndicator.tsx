/* eslint-disable react-hooks/immutability -- Reanimated pulse mutates a shared value from an effect. */
import { useEffect } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, typography } from '@theme/index';

const PULSE_MIN = 0.35;
const PULSE_MAX = 1;
const PULSE_DURATION_MS = 900;

interface ConnectionStatusIndicatorProps {
  visible: boolean;
  label?: string;
  testID?: string;
}

/**
 * Subtle inline connection indicator shown in a chat header while the
 * WebSocket is (re)connecting. Renders a small pulsing dot with a label so
 * the event/member subtitle can stay visible instead of being replaced by a
 * bare "Connecting…" line.
 */
const ConnectionStatusIndicator = ({
  visible,
  label = 'Connecting',
  testID,
}: ConnectionStatusIndicatorProps) => {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(PULSE_MAX);

  useEffect(() => {
    if (!visible || reducedMotion) {
      opacity.value = PULSE_MAX;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(PULSE_MIN, {
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(PULSE_MAX, {
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion, visible]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!visible) {
    return null;
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={`Connection status: ${label}`}
      testID={testID}
    >
      <Animated.View style={[styles.dot, dotStyle]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.inputSurface,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.subText,
  },
  label: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: '400',
    letterSpacing: -0.2,
    color: colors.subText,
  },
});

export default ConnectionStatusIndicator;
