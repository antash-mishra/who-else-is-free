import { Platform, StyleSheet, View } from 'react-native';

import FrostedSurface from '@components/ui/FrostedSurface';
import { colors } from '@theme/colors';
import { tabBarAndroidMaterial } from '@theme/materials';

export const TabBarBackground = () => (
  <View style={styles.container}>
    <FrostedSurface
      tint="light"
      intensity={54}
      blur
      androidMaterial={tabBarAndroidMaterial}
      style={StyleSheet.absoluteFill}
    />
    {/* Android's blur captures every view drawn above it, so this overlay would be blurred
        into the material and then drawn over it again; tabBarAndroidMaterial's tint carries
        its white there instead (#190). */}
    {Platform.OS === 'android' ? null : <View style={styles.overlay} />}
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
