import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import * as SplashScreenModule from "expo-splash-screen";
import { useVideoPlayer, VideoView } from "expo-video";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@navigation/types";
import { useAuth } from "@context/AuthContext";
import { typography } from "@theme/index";
import SplashLogo from "@assets/splash_logo.svg";

const FALLBACK_TIMEOUT_MS = 8000;

const SplashScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isReady, setIsReady] = useState(false);
  const didNavigate = useRef(false);

  const player = useVideoPlayer(require("../../assets/splash.mp4"), (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  const onLayoutRootView = useCallback(async () => {
    if (!isReady) {
      setIsReady(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await SplashScreenModule.hideAsync();
    }
  }, [isReady]);

  const navigateAway = useCallback(() => {
    if (didNavigate.current) return;
    didNavigate.current = true;

    let destination: keyof RootStackParamList = "Main";
    if (user && !user.profileComplete) {
      destination = "Onboarding";
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: destination }],
      });
    });
  }, [fadeAnim, navigation, user]);

  useEffect(() => {
    if (!isReady) return;

    const sub = player.addListener("playToEnd", navigateAway);

    // Fallback: navigate after timeout in case video fails to play or fires no event
    const timer = setTimeout(navigateAway, FALLBACK_TIMEOUT_MS);

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [isReady, player, navigateAway]);

  return (
    <Animated.View
      testID="splash-container"
      style={[styles.container, { opacity: fadeAnim }]}
      onLayout={onLayoutRootView}
    >
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
      <View style={styles.overlay}>
        <SplashLogo width={184} height={67} />
        <Text style={styles.tagline}>Who Else Is Free</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050F29",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tagline: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: "#FFFFFF",
    marginTop: 20,
  },
});

export default SplashScreen;
