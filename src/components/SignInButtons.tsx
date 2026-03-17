import { useCallback, useEffect, useState } from "react";
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
import GoogleLogo from "@assets/google-logo.svg";
import AppleLogo from "@assets/apple-logo.svg";

type SignInButtonsProps = {
    onSignInSuccess?: (profileComplete: boolean) => void;
};

const SignInButtons = ({ onSignInSuccess }: SignInButtonsProps = {}) => {
    const navigation =
        useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { signInWithGoogle, signInWithApple, isSigningIn } = useAuth();
    const [isNativeAvailable, setIsNativeAvailable] = useState<boolean | null>(null);
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
                console.warn("Google Sign-In native module is unavailable.", error);
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
            if (onSignInSuccess) {
                onSignInSuccess(profileComplete);
                return;
            }
            navigation.reset({
                index: 0,
                routes: [{ name: profileComplete ? "Main" : "Onboarding" }],
            });
        },
        [navigation, onSignInSuccess],
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
    }, [handlePostSignInNavigation, isNativeAvailable, signInWithGoogle]);

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

    return (
        <View style={styles.container}>
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
                {isSigningIn ? (
                    <ActivityIndicator color={colors.buttonText} size="small" />
                ) : (
                    <GoogleLogo width={20} height={20} />
                )}
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
                    <AppleLogo width={20} height={20} />
                    <Text style={styles.buttonText}>Continue with Apple</Text>
                </Pressable>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        gap: spacing.sm,
        paddingVertical: spacing.sm,
    },
    button: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        height: 48,
        borderRadius: 52,
        backgroundColor: colors.buttonBackground,
    },
    buttonPressed: {
        opacity: 0.85,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        fontSize: 16,
        fontFamily: typography.fontFamilyMedium,
        color: colors.buttonText,
        lineHeight: 20,
        letterSpacing: -0.3,
    },
});

export default SignInButtons;
