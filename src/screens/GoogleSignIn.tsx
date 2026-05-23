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
import { trackEvent } from "@services/analytics";
import { colors, spacing, typography } from "@theme/index";
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "@constants/google";
import { APPLE_SIGNIN_DEV_ALL_PLATFORMS } from "@constants/featureFlags";
import ScreenContainer from "@components/ScreenContainer";
import GoogleLogo from "@assets/ui/google-logo.svg";
import AppleLogo from "@assets/ui/apple-logo.svg";

type SignInProvider = "google" | "apple";

const GoogleSignInScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signInWithGoogle, signInWithApple, isSigningIn } = useAuth();
  const [isNativeAvailable, setIsNativeAvailable] = useState<boolean | null>(
    null,
  );
  const [isAppleAvailable, setIsAppleAvailable] = useState<boolean>(false);
  const [activeSignInProvider, setActiveSignInProvider] =
    useState<SignInProvider | null>(null);
  const shouldShowAppleButton =
    Platform.OS === "ios" || APPLE_SIGNIN_DEV_ALL_PLATFORMS;
  const isAuthBusy = isSigningIn || activeSignInProvider !== null;
  const isGoogleSigningIn = activeSignInProvider === "google";
  const isAppleSigningIn = activeSignInProvider === "apple";

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
    if (isAuthBusy) {
      return;
    }
    setActiveSignInProvider("google");
    try {
      trackEvent("login_started", { provider: "google" }).catch(() => undefined);
      if (!isNativeAvailable) {
        trackEvent("login_failed", {
          provider: "google",
          failure_stage: "native_unavailable",
        }).catch(() => undefined);
        Alert.alert(
          "Google Sign-In Unavailable",
          "This feature requires running this app from a custom Expo dev build or standalone build with @react-native-google-signin/google-signin installed.",
        );
        return;
      }

      let reachedServer = false;
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
          trackEvent("login_failed", {
            provider: "google",
            failure_stage: "missing_id_token",
          }).catch(() => undefined);
          return;
        }

        reachedServer = true;
        const user = await signInWithGoogle(result.data.idToken);
        handlePostSignInNavigation(user.profileComplete);
      } catch (error) {
        if (!reachedServer) {
          trackEvent("login_failed", {
            provider: "google",
            failure_stage: "native",
          }).catch(() => undefined);
        }
        console.warn("Google sign-in failed", error);
        Alert.alert("Unable to sign in with Google", "Please try again.");
      }
    } finally {
      setActiveSignInProvider(null);
    }
  }, [
    handlePostSignInNavigation,
    isAuthBusy,
    isNativeAvailable,
    signInWithGoogle,
  ]);

  const onApplePress = useCallback(async () => {
    if (isAuthBusy) {
      return;
    }
    setActiveSignInProvider("apple");
    try {
      trackEvent("login_started", { provider: "apple" }).catch(() => undefined);
      if (Platform.OS !== "ios") {
        trackEvent("login_failed", {
          provider: "apple",
          failure_stage: "unsupported_platform",
        }).catch(() => undefined);
        Alert.alert(
          "Apple Sign-In (Dev Preview)",
          "This button is shown in development for UI testing. Apple Sign-In works only on iOS native builds.",
        );
        return;
      }

      if (!isAppleAvailable) {
        trackEvent("login_failed", {
          provider: "apple",
          failure_stage: "native_unavailable",
        }).catch(() => undefined);
        Alert.alert(
          "Apple Sign-In Unavailable",
          "Apple Sign-In is unavailable on this device or build.",
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
          Alert.alert(
            "Unable to sign in with Apple",
            "No ID token was returned.",
          );
          trackEvent("login_failed", {
            provider: "apple",
            failure_stage: "missing_id_token",
          }).catch(() => undefined);
          return;
        }

        reachedServer = true;
        const user = await signInWithApple(credential.identityToken);
        handlePostSignInNavigation(user.profileComplete);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === "ERR_REQUEST_CANCELED") {
          trackEvent("login_failed", {
            provider: "apple",
            failure_stage: "cancelled",
          }).catch(() => undefined);
          return;
        }
        if (!reachedServer) {
          trackEvent("login_failed", {
            provider: "apple",
            failure_stage: "native",
          }).catch(() => undefined);
        }
        console.warn("Apple sign-in failed", error);
        Alert.alert("Unable to sign in with Apple", "Please try again.");
      }
    } finally {
      setActiveSignInProvider(null);
    }
  }, [handlePostSignInNavigation, isAppleAvailable, isAuthBusy, signInWithApple]);

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
              isAuthBusy && styles.buttonDisabled,
              pressed && !isAuthBusy && styles.buttonPressed,
            ]}
            onPress={onGooglePress}
            disabled={isAuthBusy}
            testID="google-sign-in-button"
            accessibilityRole="button"
          >
            <View style={styles.iconWrapper}>
              {isGoogleSigningIn ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <GoogleLogo width={20} height={20} />
              )}
            </View>
            <Text style={styles.buttonText}>
              {isGoogleSigningIn ? "Signing in…" : "Continue with Google"}
            </Text>
          </Pressable>

          {shouldShowAppleButton ? (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                isAuthBusy && styles.buttonDisabled,
                pressed && !isAuthBusy && styles.buttonPressed,
              ]}
              onPress={onApplePress}
              disabled={isAuthBusy}
              testID="apple-sign-in-button"
              accessibilityRole="button"
            >
              <View style={styles.iconWrapper}>
                {isAppleSigningIn ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <AppleLogo width={20} height={20} />
                )}
              </View>
              <Text style={styles.buttonText}>
                {isAppleSigningIn ? "Signing in…" : "Continue with Apple"}
              </Text>
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
