import { memo, ReactNode } from 'react';
import { Insets, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import ScalePressable from '@components/ScalePressable';
import { HapticFeedback } from '@services/haptics';
import { colors, componentTokens, layout, radii } from '@theme/index';

export interface IconButtonProps {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  haptic?: HapticFeedback;
  size?: 'sm' | 'md';
  variant?: 'plain' | 'soft';
  hitSlop?: Insets | number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const IconButton = ({
  icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  haptic = 'light',
  size = 'md',
  variant = 'plain',
  hitSlop = layout.hitSlop.md,
  testID,
  style,
}: IconButtonProps) => (
  <ScalePressable
    onPress={onPress}
    disabled={disabled}
    haptic={haptic}
    hitSlop={hitSlop}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    testID={testID}
    style={[
      styles.button,
      styles[size],
      variant === 'soft' && styles.soft,
      disabled && styles.disabled,
      style,
    ]}
  >
    {icon}
  </ScalePressable>
);

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.transparent,
  },
  sm: {
    width: componentTokens.iconButton.sm,
    height: componentTokens.iconButton.sm,
  },
  md: {
    width: componentTokens.iconButton.md,
    height: componentTokens.iconButton.md,
  },
  soft: {
    backgroundColor: componentTokens.overlay.closeButtonBackground,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default memo(IconButton);
