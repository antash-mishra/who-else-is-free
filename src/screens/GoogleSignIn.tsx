import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

import { useAuth } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";
import { colors, spacing, typography } from "@theme/index";
import { GOOGLE_WEB_CLIENT_ID } from "@constants/google";

const GoogleSignInScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signInWithGoogle, isSigningIn } = useAuth();
  const [isNativeAvailable, setIsNativeAvailable] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    const configureClient = async () => {
      try {
        await GoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          offlineAccess: true,
        });
        setIsNativeAvailable(true);
      } catch (error) {
        console.warn(
          "Google Sign-In native module is unavailable. Ensure you are running on a custom dev build or prebuilt binary.",
          error,
        );
        setIsNativeAvailable(false);
      }
    };

    configureClient().catch((error) => {
      console.warn("Failed to initialise Google Sign-In", error);
      setIsNativeAvailable(false);
    });
  }, []);

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

      await signInWithGoogle(result.data.idToken);
      navigation.reset({
        index: 0,
        routes: [{ name: "Main" }],
      });
    } catch (error) {
      console.warn("Google sign-in failed", error);
      Alert.alert("Unable to sign in with Google", "Please try again.");
    }
  }, [isNativeAvailable, navigation, signInWithGoogle]);

  const helperText = useMemo(() => {
    if (isNativeAvailable === false) {
      return "Google Sign-In requires running this app from a custom Expo dev build or a production binary.";
    }
    return "Connect with your Google account to continue.";
  }, [isNativeAvailable]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Sign in with Google</Text>
      <Text
        style={[
          styles.helper,
          isNativeAvailable === false && styles.helperError,
        ]}
      >
        {helperText}
      </Text>
      <Button
        title={isSigningIn ? "Signing in..." : "Sign in with Google"}
        onPress={onGooglePress}
        disabled={isSigningIn}
      />
      {isSigningIn ? <ActivityIndicator color={colors.subText} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
});

export default GoogleSignInScreen;
