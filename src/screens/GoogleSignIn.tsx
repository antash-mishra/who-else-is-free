import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";

import { useAuth } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";
import { colors, spacing, typography } from "@theme/index";
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "@constants/google";
import { APPLE_SIGNIN_DEV_ALL_PLATFORMS } from "@constants/featureFlags";
import ScreenContainer from "@components/ScreenContainer";
import GoogleLogo from "@assets/google-logo.svg";
import AppleLogo from "@assets/apple-logo.svg";

const GoogleSignInScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signInWithGoogle, signInWithApple, isSigningIn } = useAuth();
  const [isNativeAvailable, setIsNativeAvailable] = useState<boolean | null>(
    null,
  );
  const [isAppleAvailable, setIsAppleAvailable] = useState<boolean>(false);
  const shouldShowAppleButton =
    Platform.OS === "ios" || APPLE_SIGNIN_DEV_ALL_PLATFORMS;

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
        console.warn(
          "Google Sign-In native module is unavailable. Ensure you are running on a custom Expo dev build or prebuilt binary.",
          error,
        );
        if (isActive) {
          setIsNativeAvailable(false);
        }
      }
    };

    const checkAppleAvailability = async () => {
      if (Platform.OS !== "ios") {
        return;
      }
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (isActive) {
          setIsAppleAvailable(available);
        }
      } catch (error) {
        console.warn("Failed to determine Apple Sign-In availability", error);
        if (isActive) {
          setIsAppleAvailable(false);
        }
      }
    };

    configureClient().catch((error) => {
      console.warn("Failed to initialise Google Sign-In", error);
      if (isActive) {
        setIsNativeAvailable(false);
      }
    });

    checkAppleAvailability().catch((error) => {
      console.warn("Failed to initialise Apple Sign-In", error);
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
      navigation.reset({
        index: 0,
        routes: [{ name: profileComplete ? "Main" : "Onboarding" }],
      });
    },
    [navigation],
  );

  const onGooglePress = useCallback(async () => {
    if (!isNativeAvailable) {
      Alert.alert(
        "Google Sign-In Unavailable",
        "This feature requires running this app from a custom Expo dev build or standalone build with @react-native-google-signin/google-signin installed.",
      );
      return;
    }

    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }
      const result = await GoogleSignin.signIn();
      if (result.type !== "success" || !result.data.idToken) {
        Alert.alert(
          "Unable to sign in with Google",
          "No ID token was returned.",
        );
        return;
      }

      const user = await signInWithGoogle(result.data.idToken);
      handlePostSignInNavigation(user.profileComplete);
    } catch (error) {
      console.warn("Google sign-in failed", error);
      Alert.alert("Unable to sign in with Google", "Please try again.");
    }
  }, [
    handlePostSignInNavigation,
    isNativeAvailable,
    signInWithGoogle,
  ]);

  const onApplePress = useCallback(async () => {
    if (Platform.OS !== "ios") {
      Alert.alert(
        "Apple Sign-In (Dev Preview)",
        "This button is shown in development for UI testing. Apple Sign-In works only on iOS native builds.",
      );
      return;
    }

    if (!isAppleAvailable) {
      Alert.alert(
        "Apple Sign-In Unavailable",
        "Apple Sign-In is unavailable on this device or build.",
      );
      return;
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert(
          "Unable to sign in with Apple",
          "No ID token was returned.",
        );
        return;
      }

      const user = await signInWithApple(credential.identityToken);
      handlePostSignInNavigation(user.profileComplete);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "ERR_REQUEST_CANCELED") {
        return;
      }
      console.warn("Apple sign-in failed", error);
      Alert.alert("Unable to sign in with Apple", "Please try again.");
    }
  }, [handlePostSignInNavigation, isAppleAvailable, signInWithApple]);

  const helperText = useMemo(() => {
    if (isNativeAvailable === null) {
      return "Checking Google Sign-In availability...";
    }
    if (isNativeAvailable === false) {
      return "Google Sign-In requires running this app from a custom Expo dev build or a production binary.";
    }
    return "Connect with your account to continue.";
  }, [isNativeAvailable]);

  const appleHelperText = useMemo(() => {
    if (!shouldShowAppleButton) {
      return null;
    }
    if (Platform.OS !== "ios") {
      return "Apple Sign-In button is shown for development testing. It works only on iOS native builds.";
    }
    if (!isAppleAvailable) {
      return "Apple Sign-In is unavailable on this iOS device/build.";
    }
    return null;
  }, [isAppleAvailable, shouldShowAppleButton]);

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.heading}>Sign in</Text>
        <Text
          style={[
            styles.helper,
            isNativeAvailable === false && styles.helperError,
          ]}
        >
          {helperText}
        </Text>

        <View style={styles.buttonGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              isSigningIn && styles.buttonDisabled,
              pressed && !isSigningIn && styles.buttonPressed,
            ]}
            onPress={onGooglePress}
            disabled={isSigningIn}
            testID="google-sign-in-button"
            accessibilityRole="button"
          >
            <View style={styles.iconWrapper}>
              {isSigningIn ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <GoogleLogo width={20} height={20} />
              )}
            </View>
            <Text style={styles.buttonText}>
              {isSigningIn ? "Signing in…" : "Continue with Google"}
            </Text>
          </Pressable>

          {shouldShowAppleButton ? (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                isSigningIn && styles.buttonDisabled,
                pressed && !isSigningIn && styles.buttonPressed,
              ]}
              onPress={onApplePress}
              disabled={isSigningIn}
              testID="apple-sign-in-button"
              accessibilityRole="button"
            >
              <View style={styles.iconWrapper}>
                <AppleLogo width={20} height={20} />
              </View>
              <Text style={styles.buttonText}>Continue with Apple</Text>
            </Pressable>
          ) : null}
        </View>

        {appleHelperText ? (
          <Text style={styles.helper}>{appleHelperText}</Text>
        ) : null}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    gap: spacing.lg,
  },
  heading: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    textAlign: "center",
  },
  helper: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    textAlign: "center",
  },
  helperError: {
    color: "#B00020",
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 26,
    borderCurve: "continuous",
    backgroundColor: "#000000",
    paddingHorizontal: 16,
  },
  iconWrapper: {
    position: "absolute",
    left: 16,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: "#FFFFFF",
    lineHeight: 20,
    letterSpacing: -0.3,
  },
});

export default GoogleSignInScreen;
