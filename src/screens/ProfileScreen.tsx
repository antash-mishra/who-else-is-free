import { StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@components/ScreenContainer';
import { colors, spacing, typography } from '@theme/index';

const ProfileScreen = () => {
  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>A</Text>
        </View>
        <Text style={styles.name}>Your Profile</Text>
        <Text style={styles.caption}>Complete your profile to make it easier for others to find you.</Text>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    fontSize: 40,
    color: colors.primary,
    fontFamily: typography.fontFamilyBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  name: {
    fontSize: typography.header,
    color: colors.text,
    fontFamily: typography.fontFamilyBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  caption: {
    fontSize: typography.body,
    color: colors.subText,
    textAlign: 'center',
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  }
});

export default ProfileScreen;
