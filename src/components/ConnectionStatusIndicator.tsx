import { useEffect, useState } from 'react';

import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

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
  const [opacity] = useState(() => new Animated.Value(PULSE_MAX));

  useEffect(() => {
    if (!visible) {
      opacity.setValue(PULSE_MAX);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: PULSE_MIN,
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: PULSE_MAX,
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={`Connection status: ${label}`}
      testID={testID}
    >
      <Animated.View style={[styles.dot, { opacity }]} />
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
