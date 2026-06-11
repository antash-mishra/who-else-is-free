import { memo } from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';

import { colors, typography } from '@theme/index';

export type AppTextVariant = 'title' | 'subtitle' | 'body' | 'caption' | 'button' | 'error';

export interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
}

const AppText = ({ variant = 'body', style, ...props }: AppTextProps) => (
  <Text {...props} style={[styles.base, styles[variant], style]} />
);

const styles = StyleSheet.create<Record<'base' | AppTextVariant, TextStyle>>({
  base: {
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: typography.letterSpacing,
  },
  title: {
    fontSize: typography.title,
    lineHeight: 28,
    fontFamily: typography.fontFamilySemiBold,
  },
  subtitle: {
    fontSize: typography.subtitle,
    lineHeight: 24,
    fontFamily: typography.fontFamilyMedium,
  },
  body: {
    fontSize: typography.body,
    lineHeight: 22,
  },
  caption: {
    fontSize: typography.caption,
    lineHeight: 18,
    color: colors.mutedText,
  },
  button: {
    fontSize: typography.body,
    lineHeight: 20,
    fontFamily: typography.fontFamilyMedium,
    textAlign: 'center',
  },
  error: {
    fontSize: typography.caption,
    lineHeight: 18,
    color: colors.error,
  },
});

export default memo(AppText);
