import { StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@components/ScreenContainer';
import { colors, typography } from '@theme/index';

const MessagesScreen = () => {
  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>No conversations yet. Start joining events to chat with others.</Text>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    gap: 12
  },
  title: {
    fontSize: typography.header,
    color: colors.text,
    fontFamily: typography.fontFamilyBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.subText,
    textAlign: 'center',
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  }
});

export default MessagesScreen;
