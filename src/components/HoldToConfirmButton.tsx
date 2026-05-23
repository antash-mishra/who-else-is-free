import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { typography } from '@theme/index';

const HOLD_DURATION = 2000;

type Props = {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
};

const HoldToConfirmButton = ({ label, onConfirm, disabled }: Props) => {
  const progress = useSharedValue(0);
  const containerWidth = useSharedValue(0);

  const handleComplete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onConfirm();
  };

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * containerWidth.value,
  }));

  return (
    <Pressable
      onLayout={(e) => { containerWidth.value = e.nativeEvent.layout.width; }}
      onPressIn={() => {
        if (disabled) return;
        progress.value = withTiming(1, {
          duration: HOLD_DURATION,
          easing: Easing.linear,
        }, (finished) => {
          if (finished) runOnJS(handleComplete)();
        });
      }}
      onPressOut={() => {
        if (progress.value < 1) {
          progress.value = withTiming(0, { duration: 200 });
        }
      }}
      android_ripple={null}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.fill, fillStyle]} />
      <Text style={styles.label}>
        {disabled ? 'Deleting...' : label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#D1382C',
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: '#FFFFFF',
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
});

export default HoldToConfirmButton;
