/* eslint-disable react-hooks/immutability -- Reanimated tab button feedback mutates shared values from press handlers. */
import { TouchableOpacity } from 'react-native';

import { type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import ReAnimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { triggerHaptic } from '@services/haptics';
import { Springs } from '@theme/springs';

type VibratingTabBarButtonProps = BottomTabBarButtonProps & { pageIndex: number };

export const VibratingTabBarButton = ({
  onPress,
  style,
  children,
  accessibilityLabel,
  testID,
}: VibratingTabBarButtonProps) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    scale.value = 0.8;
    scale.value = withSpring(1, Springs.elegant);
    triggerHaptic('selection');
    if (onPress) onPress(e);
  };

  return (
    <TouchableOpacity
      style={style}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <ReAnimated.View style={animStyle}>{children}</ReAnimated.View>
    </TouchableOpacity>
  );
};
