import { useCallback, useEffect, useState } from 'react';

import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as AppleAuthentication from 'expo-apple-authentication';

import AppleLogo from '@assets/ui/apple-logo.svg';
import GoogleLogo from '@assets/ui/google-logo.svg';
import DevLoginButton from '@components/DevLoginButton';
import { AppButton } from '@components/ui';
import { APPLE_SIGNIN_DEV_ALL_PLATFORMS } from '@constants/featureFlags';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@constants/google';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { trackEvent } from '@services/analytics';
import { logger } from '@services/logger';
import { colors } from '@theme/index';

type SignInProvider = 'google' | 'apple';

type SignInButtonsProps = {
  onSignInSuccess?: (profileComplete: boolean) => void;
};

const SignInButtons = ({ onSignInSuccess }: SignInButtonsProps = {}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signInWithGoogle, signInWithApple, isSigningIn } = useAuth();
  const [isNativeAvailable, setIsNativeAvailable] = useState<boolean | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState<boolean>(false);
  const [activeSignInProvider, setActiveSignInProvider] = useState<SignInProvider | null>(null);
  const shouldShowAppleButton = Platform.OS === 'ios' || APPLE_SIGNIN_DEV_ALL_PLATFORMS;
  const isAuthBusy = isSigningIn || activeSignInProvider !== null;
  const isGoogleSigningIn = activeSignInProvider === 'google';
  const isAppleSigningIn = activeSignInProvider === 'apple';

  useEffect(() => {
    let isActive = true;

    const configureClient = async () => {
      try {
        await GoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iosClientId: GOOGLE_IOS_CLIENT_ID,
          offlineAccess: true,
        });
        if (isActive) {
          setIsNativeAvailable(true);
        }
      } catch (error) {
        logger.warn('Google Sign-In native module is unavailable.', error);
        if (isActive) {
          setIsNativeAvailable(false);
        }
      }
    };

    const checkAppleAvailability = async () => {
      if (Platform.OS !== 'ios') {
        return;
      }
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (isActive) {
          setIsAppleAvailable(available);
        }
      } catch (error) {
        logger.warn('Failed to determine Apple Sign-In availability', error);
        if (isActive) {
          setIsAppleAvailable(false);
        }
      }
    };

    configureClient().catch((error) => {
      logger.warn('Failed to initialise Google Sign-In', error);
      if (isActive) {
        setIsNativeAvailable(false);
      }
    });

    checkAppleAvailability().catch((error) => {
      logger.warn('Failed to initialise Apple Sign-In', error);
      if (isActive) {
        setIsAppleAvailable(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const handlePostSignInNavigation = useCallback(
    (profileComplete: boolean) => {
      if (onSignInSuccess) {
        onSignInSuccess(profileComplete);
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{ name: profileComplete ? 'Main' : 'Onboarding' }],
      });
    },
    [navigation, onSignInSuccess],
  );

  const onGooglePress = useCallback(async () => {
    if (isAuthBusy) {
      return;
    }
    setActiveSignInProvider('google');
    try {
      trackEvent('login_started', { provider: 'google' }).catch(() => undefined);
      if (!isNativeAvailable) {
        trackEvent('login_failed', {
          provider: 'google',
          failure_stage: 'native_unavailable',
        }).catch(() => undefined);
        Alert.alert(
          'Google Sign-In Unavailable',
          'This feature requires running this app from a custom Expo dev build or standalone build with @react-native-google-signin/google-signin installed.',
        );
        return;
      }

      let reachedServer = false;
      try {
        if (Platform.OS === 'android') {
          await GoogleSignin.hasPlayServices({
            showPlayServicesUpdateDialog: true,
          });
        }
        const result = await GoogleSignin.signIn();
        if (result.type !== 'success' || !result.data.idToken) {
          Alert.alert('Unable to sign in with Google', 'No ID token was returned.');
          trackEvent('login_failed', {
            provider: 'google',
            failure_stage: 'missing_id_token',
          }).catch(() => undefined);
          return;
        }

        reachedServer = true;
        const user = await signInWithGoogle(result.data.idToken);
        handlePostSignInNavigation(user.profileComplete);
      } catch (error) {
        if (!reachedServer) {
          trackEvent('login_failed', {
            provider: 'google',
            failure_stage: 'native',
          }).catch(() => undefined);
        }
        logger.warn('Google sign-in failed', error);
        Alert.alert('Unable to sign in with Google', 'Please try again.');
      }
    } finally {
      setActiveSignInProvider(null);
    }
  }, [handlePostSignInNavigation, isAuthBusy, isNativeAvailable, signInWithGoogle]);

  const onApplePress = useCallback(async () => {
    if (isAuthBusy) {
      return;
    }
    setActiveSignInProvider('apple');
    try {
      trackEvent('login_started', { provider: 'apple' }).catch(() => undefined);
      if (Platform.OS !== 'ios') {
        trackEvent('login_failed', {
          provider: 'apple',
          failure_stage: 'unsupported_platform',
        }).catch(() => undefined);
        Alert.alert(
          'Apple Sign-In (Dev Preview)',
          'This button is shown in development for UI testing. Apple Sign-In works only on iOS native builds.',
        );
        return;
      }

      if (!isAppleAvailable) {
        trackEvent('login_failed', {
          provider: 'apple',
          failure_stage: 'native_unavailable',
        }).catch(() => undefined);
        Alert.alert(
          'Apple Sign-In Unavailable',
          'Apple Sign-In is unavailable on this device or build.',
        );
        return;
      }

      let reachedServer = false;
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          Alert.alert('Unable to sign in with Apple', 'No ID token was returned.');
          trackEvent('login_failed', {
            provider: 'apple',
            failure_stage: 'missing_id_token',
          }).catch(() => undefined);
          return;
        }

        reachedServer = true;
        const user = await signInWithApple(credential.identityToken);
        handlePostSignInNavigation(user.profileComplete);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'ERR_REQUEST_CANCELED') {
          trackEvent('login_failed', {
            provider: 'apple',
            failure_stage: 'cancelled',
          }).catch(() => undefined);
          return;
        }
        if (!reachedServer) {
          trackEvent('login_failed', {
            provider: 'apple',
            failure_stage: 'native',
          }).catch(() => undefined);
        }
        logger.warn('Apple sign-in failed', error);
        Alert.alert('Unable to sign in with Apple', 'Please try again.');
      }
    } finally {
      setActiveSignInProvider(null);
    }
  }, [handlePostSignInNavigation, isAppleAvailable, isAuthBusy, signInWithApple]);

  return (
    <View style={styles.container}>
      <AppButton
        label={isGoogleSigningIn ? 'Signing in…' : 'Continue with Google'}
        icon={
          isGoogleSigningIn ? (
            <ActivityIndicator color={colors.buttonText} size="small" />
          ) : (
            <GoogleLogo width={20} height={20} />
          )
        }
        onPress={onGooglePress}
        disabled={isAuthBusy}
        testID="google-sign-in-button"
        style={styles.button}
      />

      {shouldShowAppleButton ? (
        <AppButton
          label={isAppleSigningIn ? 'Signing in…' : 'Continue with Apple'}
          icon={
            isAppleSigningIn ? (
              <ActivityIndicator color={colors.buttonText} size="small" />
            ) : (
              <AppleLogo width={20} height={20} />
            )
          }
          onPress={onApplePress}
          disabled={isAuthBusy}
          testID="apple-sign-in-button"
          style={styles.button}
        />
      ) : null}

      {/*
        DEV ONLY. The DevLoginButton itself short-circuits to a no-op render
        in release builds (__DEV__ === false), so this is always safe to mount.
        Kept inside SignInButtons so it appears on every unauthenticated
        surface (Profile, Messages, My Events, Create Event) for easy access.
      */}
      <DevLoginButton />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  button: {
    paddingHorizontal: 16,
  },
});

export default SignInButtons;
