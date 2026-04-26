import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SplashScreenModule from "expo-splash-screen";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@navigation/types";
import { useAuth } from "@context/AuthContext";
import { useBloom } from "@context/BloomContext";
import { typography } from "@theme/index";
import SplashLogo from "@assets/splash_logo.svg";

const DISPLAY_DURATION_MS = 1600;

const SplashScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { bloom, signalReady } = useBloom();
  const [isReady, setIsReady] = useState(false);
  const didNavigate = useRef(false);

  const logoScale = useRef(new Animated.Value(1)).current;

  const onLayoutRootView = useCallback(async () => {
    if (!isReady) {
      setIsReady(true);
      await new Promise((r) => setTimeout(r, 50));
      await SplashScreenModule.hideAsync();
    }
  }, [isReady]);

  const navigateAway = useCallback(() => {
    if (didNavigate.current) return;
    didNavigate.current = true;
    const dest: keyof RootStackParamList =
      user && !user.profileComplete ? "Onboarding" : "Main";

    Animated.timing(logoScale, {
      toValue: 45,
      duration: 450,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Navigate at 350ms (bloom ~50% opaque) — gives HomeScreen head start on fetching
    setTimeout(() => {
      navigation.reset({ index: 0, routes: [{ name: dest }] });
      if (dest !== "Main") {
        setTimeout(signalReady, 100);
      }
    }, 350);

    setTimeout(() => {
      bloom(() => {});
    }, 200);
  }, [logoScale, bloom, signalReady, navigation, user]);

  useEffect(() => {
    if (!isReady) return;
    const timer = setTimeout(navigateAway, DISPLAY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isReady, navigateAway]);

  return (
    <View style={styles.root} onLayout={onLayoutRootView}>
      <Image
        source={require("../../assets/splash/VicarStreet.png")}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.overlay}>
        <View style={styles.center}>
          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
            <SplashLogo width={184} height={67} />
          </Animated.View>
          <Text style={styles.tagline}>Who Else Is Free</Text>
        </View>
        <Text style={styles.location}>Vicar Street, Dublin</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
  },
  tagline: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: "#FFFFFF",
    marginTop: 20,
  },
  location: {
    position: "absolute",
    bottom: 20,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 13,
    color: "#FFFFFF",
    opacity: 0.6,
    letterSpacing: -0.3,
  },
});

export default SplashScreen;
