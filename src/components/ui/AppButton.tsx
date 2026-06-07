import { memo, ReactNode } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import ScalePressable from '@components/ScalePressable';
import { HapticFeedback } from '@services/haptics';
import { colors, componentTokens, typography } from '@theme/index';

import AppText from './AppText';

export type AppButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  haptic?: HapticFeedback;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const getDefaultHaptic = (variant: AppButtonVariant): HapticFeedback =>
  variant === 'destructive' ? 'destructive' : 'light';

const AppButton = ({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  haptic,
  testID,
  accessibilityLabel,
  style,
  textStyle,
}: AppButtonProps) => {
  const isDisabled = disabled || loading;
  const resolvedHaptic = haptic ?? getDefaultHaptic(variant);
  const indicatorColor =
    variant === 'secondary' || variant === 'ghost' ? colors.text : colors.buttonText;

  return (
    <ScalePressable
      onPress={onPress}
      disabled={isDisabled}
      haptic={resolvedHaptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        styles.button,
        styles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      {loading ? (
        <ActivityIndicator color={indicatorColor} size="small" />
      ) : (
        <AppText variant="button" style={[styles.label, styles[`${variant}Label`], textStyle]}>
          {label}
        </AppText>
      )}
    </ScalePressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: componentTokens.button.height,
    borderRadius: componentTokens.button.radius,
    borderCurve: 'continuous',
    paddingHorizontal: componentTokens.button.paddingHorizontal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  primary: {
    backgroundColor: colors.primaryButtonBackground,
  },
  secondary: {
    backgroundColor: colors.secondaryButtonBackground,
  },
  destructive: {
    backgroundColor: colors.error,
  },
  ghost: {
    backgroundColor: colors.transparent,
  },
  disabled: {
    opacity: 0.6,
  },
  icon: {
    position: 'absolute',
    left: 16,
  },
  label: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: typography.detailLetterSpacing,
  },
  primaryLabel: {
    color: colors.buttonText,
  },
  secondaryLabel: {
    color: colors.text,
  },
  destructiveLabel: {
    color: colors.buttonText,
  },
  ghostLabel: {
    color: colors.text,
  },
});

export default memo(AppButton);
