import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback } from 'react';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenContainer from '@components/ScreenContainer';
import EmptyState from '@components/EmptyState';
import { colors, spacing, typography } from '@theme/index';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import EmptyProfileIllustration from '@assets/empty-profile.svg';

type ProfileNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const ProfileScreen = () => {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<ProfileNavigation>();

  const handleSignOut = useCallback(() => {
    signOut();
  }, [signOut]);

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <EmptyState
          title="No profile to show"
          description="Login to see the profile"
          actionLabel="Login"
          onActionPress={() => navigation.navigate('Login')}
          illustration={EmptyProfileIllustration}
          illustrationSize={40}
        />
      </ScreenContainer>
    );
  }

  const initial = user?.name?.charAt(0).toUpperCase() ?? 'Y';

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user?.name ?? 'Your Profile'}</Text>
        <Text style={styles.caption}>{user?.email ?? 'Complete your profile to make it easier for others to find you.'}</Text>

        <Pressable onPress={handleSignOut} style={styles.signOutButton} accessibilityRole="button">
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  headerSpacing: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
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
  },
  signOutButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 24,
    backgroundColor: colors.primary
  },
  signOutText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: typography.subtitle,
    letterSpacing: typography.letterSpacing
  }
});

export default ProfileScreen;
