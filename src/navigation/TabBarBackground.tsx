import { StyleSheet, View } from 'react-native';

import FrostedSurface from '@components/ui/FrostedSurface';
import { colors } from '@theme/colors';

export const TabBarBackground = () => (
  <View style={styles.container}>
    <FrostedSurface tint="light" intensity={54} blur style={StyleSheet.absoluteFill} />
    <View style={styles.overlay} />
    <View style={styles.topBorder} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.tabBarFrostedOverlay,
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.background,
  },
});
