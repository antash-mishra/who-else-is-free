import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout } from '@theme/index';

interface ScreenContainerProps {
  children: ReactNode;
  edges?: Edge[];
}

const ScreenContainer = ({ children, edges }: ScreenContainerProps) => {
  const resolvedEdges: Edge[] = edges ?? ['top', 'bottom'];

  return (
    <SafeAreaView style={styles.safeArea} edges={resolvedEdges}>
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.transparent,
    paddingHorizontal: layout.screenHorizontalPadding,
  },
});

export default ScreenContainer;
