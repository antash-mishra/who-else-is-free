/* eslint-disable react-hooks/immutability -- Reanimated press feedback mutates shared values from press handlers. */
import { useMemo, useRef } from 'react';
import {
  AccessibilityRole,
  AccessibilityState,
  Insets,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';

import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { HapticFeedback, triggerHaptic } from '@services/haptics';
import { motionGeometry } from '@theme/motion';
import { Springs } from '@theme/springs';
import { seedFromString, seededRand } from '@utils/seededRandom';

type ScalePressableProps = {
  onPress: () => void;
  onPressIn?: () => void;
  children: React.ReactNode;
  /** Style applied to the inner Animated.View (content) */
  style?: StyleProp<ViewStyle>;
  /** Style applied to the outer Pressable wrapper */
  pressableStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: Insets | number;
  /** Delay in ms before scale-down starts. Use 80 for event card rows. */
  delay?: number;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  haptic?: HapticFeedback;
  testID?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** Adds a small scrapbook counter-rotation alongside the press scale. */
  tilt?: boolean;
  /** Stable seed for the tilt angle. Falls back to testID, then to the label. */
  tiltSeed?: string;
};

const ScalePressable = ({
  onPress,
  onPressIn,
  children,
  style,
  pressableStyle,
  disabled,
  hitSlop,
  delay = 0,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  haptic = 'none',
  testID,
  onLayout,
  tilt = false,
  tiltSeed,
}: ScalePressableProps) => {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const tiltAngle = useMemo(() => {
    if (!tilt) return 0;
    const seed = tiltSeed ?? testID ?? accessibilityLabel ?? 'scale-pressable';
    return (seededRand(seedFromString(seed)) * 2 - 1) * motionGeometry.tiltMaxDeg;
  }, [accessibilityLabel, testID, tilt, tiltSeed]);

  const animStyle = useAnimatedStyle(() =>
    tilt
      ? { transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }] }
      : { transform: [{ scale: scale.value }] },
  );
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <Pressable
      onPress={() => {
        triggerHaptic(haptic);
        onPress();
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      testID={testID}
      style={pressableStyle}
      onLayout={onLayout}
      onPressIn={() => {
        if (disabled) return;
        onPressIn?.();
        if (delay > 0) {
          pressTimer.current = setTimeout(() => {
            scale.value = withSpring(0.96, Springs.snappy);
            rotation.value = withSpring(tiltAngle, Springs.snappy);
          }, delay);
        } else {
          scale.value = withSpring(0.96, Springs.snappy);
          rotation.value = withSpring(tiltAngle, Springs.snappy);
        }
      }}
      onPressOut={() => {
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
        scale.value = withSpring(1, Springs.press);
        rotation.value = withSpring(0, Springs.press);
      }}
    >
      <Animated.View style={[style, animStyle]} testID={testID ? `${testID}-content` : undefined}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default ScalePressable;
