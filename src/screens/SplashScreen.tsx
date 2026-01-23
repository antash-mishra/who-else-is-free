import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as SplashScreenModule from "expo-splash-screen";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@navigation/types";
import { useAuth } from "@context/AuthContext";
import { typography } from "@theme/index";
import SplashLogo from "@assets/splash_logo.svg";

const SplashScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isReady, setIsReady] = useState(false);

  // Called when the view layout is complete - safe to hide native splash
  const onLayoutRootView = useCallback(async () => {
    if (!isReady) {
      setIsReady(true);
      // Small delay to ensure React splash is fully painted
      await new Promise((resolve) => setTimeout(resolve, 50));
      await SplashScreenModule.hideAsync();
    }
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;

    const runSplashSequence = async () => {
      // Wait 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Determine destination: if user exists but profile not complete, go to Onboarding
      let destination: keyof RootStackParamList = "Main";
      if (user && !user.profileComplete) {
        destination = "Onboarding";
      }

      // Fade out animation (300ms)
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Navigate to destination after fade completes
        navigation.reset({
          index: 0,
          routes: [{ name: destination }],
        });
      });
    };

    runSplashSequence();
  }, [fadeAnim, navigation, isReady, user]);

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      onLayout={onLayoutRootView}
    >
      <LinearGradient
        colors={["#1B50E3", "#153DAD", "#081944", "#050F29"]}
        locations={[0, 0.3174, 0.601, 0.726]}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <SplashLogo width={184} height={67} />
          <Text style={styles.tagline}>Who Else Is Free</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tagline: {
    fontFamily: typography.fontFamilyMedium,
    fontWeight: "500",
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: "#FFFFFF",
    marginTop: 20,
  },
});

export default SplashScreen;
