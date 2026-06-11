import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';

import { colors } from '@theme/index';

export interface UnreadDotProps {
  /** Positioning within the parent row; size and color are owned here. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Shared unread indicator dot for conversation/request rows so every list
 * marks unread items with the same size and color.
 */
const UnreadDot: React.FC<UnreadDotProps> = ({ style, testID }) => (
  <View style={[styles.dot, style]} testID={testID} />
);

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.unreadIndicator,
  },
});

export default UnreadDot;
