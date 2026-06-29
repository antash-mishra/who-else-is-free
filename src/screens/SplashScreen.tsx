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
import * as SecureStore from "expo-secure-store";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@navigation/types";
import { useAuth } from "@context/AuthContext";
import { useBloom } from "@context/BloomContext";
import { typography } from "@theme/index";
import SplashLogo from "@assets/weif/splash-logo.svg";

const DISPLAY_DURATION_MS = 1600;
const LAST_SPLASH_INDEX_KEY = "whoelseisfree.splashIndex";

// Each cold launch shows one of these venues. Photos are bundled
// (portrait 1320x2868 JPGs) so the splash is instant and works offline.
export const SPLASH_VARIANTS = [
  { image: require("../../assets/splash/VicarStreet.jpg"), location: "Vicar Street" },
  { image: require("../../assets/splash/CrokePark.jpg"), location: "Croke Park" },
  { image: require("../../assets/splash/CapelStreet.jpg"), location: "Capel Street" },
  { image: require("../../assets/splash/Blessington.jpg"), location: "Blessington" },
  { image: require("../../assets/splash/Dunmore.jpg"), location: "Dunmore" },
  { image: require("../../assets/splash/SheepsHead.jpg"), location: "Sheep's Head" },
  { image: require("../../assets/splash/MagheramoreBeach.jpg"), location: "Magheramore Beach" },
] as const;

// Pick a random variant index, never repeating the previous launch's index.
// Passing an out-of-range index (e.g. -1 on first launch) picks fully at random.
export const pickSplashIndex = (excludeIndex: number): number => {
  const count = SPLASH_VARIANTS.length;
  if (excludeIndex < 0 || excludeIndex >= count) {
    return Math.floor(Math.random() * count);
  }
  // Choose uniformly among the other count - 1 venues, no rejection loop.
  const offset = 1 + Math.floor(Math.random() * (count - 1));
  return (excludeIndex + offset) % count;
};

const SplashScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { bloom, signalReady } = useBloom();
  const [isReady, setIsReady] = useState(false);
  const didNavigate = useRef(false);

  // Seed with a random pick so there is always something to render; the final
  // no-repeat choice is resolved in onLayoutRootView before the native splash
  // hides, so this seed is never actually shown.
  const [variant, setVariant] = useState(
    () => SPLASH_VARIANTS[pickSplashIndex(-1)],
  );

  const logoScale = useRef(new Animated.Value(1)).current;

  const onLayoutRootView = useCallback(async () => {
    if (!isReady) {
      setIsReady(true);

      // Resolve the venue while the native splash still covers the screen so
      // the swap is never visible. Persist the choice to avoid repeating it
      // on the next cold launch. Any storage failure falls back to the seed.
      try {
        const storedRaw = await SecureStore.getItemAsync(LAST_SPLASH_INDEX_KEY);
        const lastIndex = storedRaw != null ? parseInt(storedRaw, 10) : -1;
        const nextIndex = pickSplashIndex(Number.isNaN(lastIndex) ? -1 : lastIndex);
        setVariant(SPLASH_VARIANTS[nextIndex]);
        await SecureStore.setItemAsync(LAST_SPLASH_INDEX_KEY, String(nextIndex));
      } catch {
        // Keep the seeded random variant.
      }

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
    <View
      style={styles.root}
      onLayout={onLayoutRootView}
      testID="splash-container"
    >
      <Image
        source={variant.image}
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
        <Text style={styles.location}>{variant.location}</Text>
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
    opacity: 0.85,
    letterSpacing: -0.3,
  },
});

export default SplashScreen;
