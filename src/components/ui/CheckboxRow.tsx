import { memo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import ScalePressable from '@components/ScalePressable';
import { colors, componentTokens, typography } from '@theme/index';

export interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CheckboxRow = ({
  label,
  checked,
  onPress,
  disabled = false,
  style,
  testID,
}: CheckboxRowProps) => (
  <ScalePressable
    onPress={onPress}
    disabled={disabled}
    haptic="selection"
    accessibilityRole="checkbox"
    accessibilityState={{ checked, disabled }}
    testID={testID}
    style={[styles.row, disabled && styles.disabled, style]}
  >
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? <Text style={styles.tick}>✓</Text> : null}
    </View>
    <Text style={styles.label}>{label}</Text>
  </ScalePressable>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  disabled: {
    opacity: 0.5,
  },
  checkbox: {
    width: componentTokens.checkbox.size,
    height: componentTokens.checkbox.size,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.checkboxBorder,
    borderRadius: componentTokens.checkbox.radius,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  tick: {
    color: colors.buttonText,
    fontSize: componentTokens.checkbox.tickSize,
    lineHeight: 16,
    fontFamily: typography.fontFamilySemiBold,
  },
  label: {
    color: colors.text,
    fontSize: typography.caption,
    lineHeight: 18,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.2,
  },
});

export default memo(CheckboxRow);
