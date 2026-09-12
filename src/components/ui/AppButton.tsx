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
  // A caller's own icon is coloured for the enabled surface -- the Apple mark
  // is solid white for the black button -- and cannot be recoloured from here.
  // Swapping the surface under it would make it invisible, so a button with a
  // custom icon dims uniformly instead, which keeps every layer legible.
  const dimsInsteadOfSwapping = !!icon;
  const showsDisabledSurface = isDisabled && !dimsInsteadOfSwapping && variant !== 'ghost';
  // A white spinner would vanish on the disabled surface.
  const indicatorColor = showsDisabledSurface
    ? colors.disabledButtonText
    : variant === 'secondary' || variant === 'ghost'
      ? colors.text
      : colors.buttonText;

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
        // Ghost has no surface to swap, so it greys its label only.
        showsDisabledSurface && styles.disabledSurface,
        isDisabled && dimsInsteadOfSwapping && styles.disabledDimmed,
        style,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      {loading ? (
        <ActivityIndicator color={indicatorColor} size="small" />
      ) : (
        <AppText
          variant="button"
          style={[
            styles.label,
            styles[`${variant}Label`],
            showsDisabledSurface && styles.disabledLabel,
            textStyle,
          ]}
        >
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
  disabledSurface: {
    backgroundColor: colors.disabledButtonBackground,
  },
  disabledDimmed: {
    opacity: 0.6,
  },
  disabledLabel: {
    color: colors.disabledButtonText,
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
