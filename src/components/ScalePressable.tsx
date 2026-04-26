import { useRef } from 'react';
import { AccessibilityRole, Insets, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Springs } from '@theme/springs';

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
  testID?: string;
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
  testID,
}: ScalePressableProps) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      testID={testID}
      style={pressableStyle}
      onPressIn={() => {
        if (disabled) return;
        onPressIn?.();
        if (delay > 0) {
          pressTimer.current = setTimeout(() => {
            scale.value = withSpring(0.96, Springs.snappy);
          }, delay);
        } else {
          scale.value = withSpring(0.96, Springs.snappy);
        }
      }}
      onPressOut={() => {
        if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
        scale.value = withSpring(1, Springs.press);
      }}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
};

export default ScalePressable;
