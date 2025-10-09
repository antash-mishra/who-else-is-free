import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, spacing } from '@theme/index';

interface ScreenContainerProps {
  children: ReactNode;
}

const ScreenContainer = ({ children }: ScreenContainerProps) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.gradient}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="bottomGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.background} />
              <Stop offset="40%" stopColor={colors.background} />
              <Stop offset="100%" stopColor={colors.backgroundGradientEnd} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="50%" fill={colors.background} />
          <Rect x="0" y="50%" width="100%" height="50%" fill="url(#bottomGradient)" />
        </Svg>
      </View>
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none'
  }
});

export default ScreenContainer;
