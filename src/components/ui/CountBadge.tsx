import React from 'react';
import { StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';

import { colors, componentTokens, radii, typography } from '@theme/index';

export interface CountBadgeProps {
  count: number;
  /** Cap displayed value; larger counts render as "<max>+". Defaults to 99. */
  maxCount?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Shared numeric count badge used in headers and rows (e.g. pending join
 * requests). Owns size, shape, and text treatment so counts look the same
 * everywhere.
 */
const CountBadge: React.FC<CountBadgeProps> = ({ count, maxCount = 99, style, testID }) => (
  <View style={[styles.badge, style]} testID={testID}>
    <Text style={styles.text}>{count > maxCount ? `${maxCount}+` : count}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.secondaryButtonBackground,
    borderRadius: radii.pill,
    minWidth: componentTokens.countBadge.size,
    height: componentTokens.countBadge.size,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: componentTokens.countBadge.paddingHorizontal,
  },
  text: {
    color: colors.text,
    fontSize: componentTokens.countBadge.fontSize,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.3,
  },
});

export default CountBadge;
