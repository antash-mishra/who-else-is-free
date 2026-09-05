import { memo } from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { colors, componentTokens, typography } from '@theme/index';

import AppText from './AppText';

export interface TextFieldProps extends TextInputProps {
  errorText?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
}

const TextField = ({
  errorText,
  containerStyle,
  multiline,
  style,
  placeholderTextColor = colors.placeholder,
  textAlignVertical,
  ...props
}: TextFieldProps) => (
  <View style={containerStyle}>
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={placeholderTextColor}
      textAlignVertical={textAlignVertical ?? (multiline ? 'top' : undefined)}
      style={[styles.input, multiline ? styles.multiline : styles.singleLine, style]}
    />
    {errorText ? (
      <AppText variant="error" style={styles.error}>
        {errorText}
      </AppText>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.inputSurface,
    color: colors.text,
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: typography.inputLetterSpacing,
  },
  singleLine: {
    height: componentTokens.input.height,
    borderRadius: componentTokens.input.pillRadius,
    borderCurve: 'continuous',
    paddingHorizontal: componentTokens.input.paddingHorizontal,
  },
  multiline: {
    minHeight: 140,
    borderRadius: componentTokens.input.radius,
    borderCurve: 'continuous',
    paddingHorizontal: componentTokens.input.paddingHorizontal - 4,
    paddingVertical: componentTokens.input.paddingVertical,
  },
  error: {
    marginTop: 6,
  },
});

export default memo(TextField);
