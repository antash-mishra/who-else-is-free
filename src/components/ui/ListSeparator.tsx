import { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '@theme/index';

interface ListSeparatorProps {
  style?: StyleProp<ViewStyle>;
}

const ListSeparator = ({ style }: ListSeparatorProps) => <View style={[styles.separator, style]} />;

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
});

export default memo(ListSeparator);
