import { useCallback, useEffect, useRef, useState } from 'react';

import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreenModule from 'expo-splash-screen';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SplashLogo from '@assets/weif/splash-logo.svg';
import { useAuth } from '@context/AuthContext';
import { useBloom } from '@context/BloomContext';
import { RootStackParamList } from '@navigation/types';
import { colors, spacing, typography } from '@theme/index';

const DISPLAY_DURATION_MS = 1600;
const LAST_SPLASH_INDEX_KEY = 'whoelseisfree.splashIndex';

// Exit: the wordmark zooms through the viewer while the tagline and caption
// fade, and the white bloom rises mid-zoom so it is fully opaque exactly as the
// zoom ends. The screen swap happens only under that opaque bloom, so the zoom
// is never cut off part-way.
export const SPLASH_ZOOM_MS = 560;
/** Bloom (300 ms) starts this long into the zoom, reaching full cover as it ends. */
export const SPLASH_BLOOM_DELAY_MS = 260;
export const SPLASH_CHROME_FADE_MS = 240;
/** Visual scale the wordmark reaches at the end of the zoom. */
export const SPLASH_LOGO_ZOOM_TO = 45;
/**
 * The wordmark is drawn at this multiple of its layout size and scaled down,
 * so it stays crisp for the first stretch of the zoom instead of upscaling a
 * 184 px rasterisation from the first frame.
 */
export const SPLASH_LOGO_RENDER_SCALE = 3;
const LOGO_WIDTH = 184;
const LOGO_HEIGHT = 67;

// Each cold launch shows one of these venues. Photos are bundled
// (portrait 1320x2868 JPGs) so the splash is instant and works offline.
export const SPLASH_VARIANTS = [
  { image: require('../../assets/splash/VicarStreet.jpg'), location: 'Vicar Street' },
  { image: require('../../assets/splash/CrokePark.jpg'), location: 'Croke Park' },
  { image: require('../../assets/splash/CapelStreet.jpg'), location: 'Capel Street' },
  { image: require('../../assets/splash/Blessington.jpg'), location: 'Blessington' },
  { image: require('../../assets/splash/SheepsHead.jpg'), location: "Sheep's Head" },
  { image: require('../../assets/splash/MulrannyBeach.jpg'), location: 'Mulranny Beach' },
  { image: require('../../assets/splash/RossCastle.jpg'), location: 'Ross Castle' },
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

export const splashCaptionBottom = (bottomInset: number): number => bottomInset + spacing.md;

const SplashScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { bloom, signalReady } = useBloom();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [isReady, setIsReady] = useState(false);
  const didNavigate = useRef(false);
  const bloomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed with a random pick so there is always something to render; the final
  // no-repeat choice is resolved in onLayoutRootView before the native splash
  // hides, so this seed is never actually shown.
  const [variant, setVariant] = useState(() => SPLASH_VARIANTS[pickSplashIndex(-1)]);

  const [logoScale] = useState(() => new Animated.Value(1 / SPLASH_LOGO_RENDER_SCALE));
  const [chromeOpacity] = useState(() => new Animated.Value(1));

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
    const dest: keyof RootStackParamList = user && !user.profileComplete ? 'Onboarding' : 'Main';

    // Swap screens only after the white bloom fully covers the splash.
    const swap = () => {
      navigation.reset({ index: 0, routes: [{ name: dest }] });
      if (dest !== 'Main') {
        signalReady();
      }
    };

    if (reducedMotion) {
      bloom(swap);
      return;
    }

    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: SPLASH_LOGO_ZOOM_TO / SPLASH_LOGO_RENDER_SCALE,
        duration: SPLASH_ZOOM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(chromeOpacity, {
        toValue: 0,
        duration: SPLASH_CHROME_FADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    bloomTimer.current = setTimeout(() => {
      bloomTimer.current = null;
      bloom(swap);
    }, SPLASH_BLOOM_DELAY_MS);
  }, [bloom, chromeOpacity, logoScale, navigation, reducedMotion, signalReady, user]);

  useEffect(
    () => () => {
      if (bloomTimer.current) clearTimeout(bloomTimer.current);
    },
    [],
  );

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
      accessible
      accessibilityLabel="Who Else Is Free"
      accessibilityRole="image"
    >
      <Image source={variant.image} style={styles.image} resizeMode="cover" />
      <View style={styles.overlay}>
        <View style={styles.center}>
          <View style={styles.logoBox}>
            <Animated.View style={[styles.logoCanvas, { transform: [{ scale: logoScale }] }]}>
              <SplashLogo
                width={LOGO_WIDTH * SPLASH_LOGO_RENDER_SCALE}
                height={LOGO_HEIGHT * SPLASH_LOGO_RENDER_SCALE}
              />
            </Animated.View>
          </View>
          <Animated.Text style={[styles.tagline, { opacity: chromeOpacity }]}>
            Who Else Is Free
          </Animated.Text>
        </View>
        <Animated.Text
          style={[
            styles.location,
            { bottom: splashCaptionBottom(insets.bottom), opacity: chromeOpacity },
          ]}
          testID="splash-location"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {variant.location}
        </Animated.Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  // Keeps the wordmark's layout footprint at its display size while the
  // oversized canvas inside it is scaled down (and later zoomed) about the centre.
  logoBox: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  logoCanvas: {
    position: 'absolute',
    left: -(LOGO_WIDTH * (SPLASH_LOGO_RENDER_SCALE - 1)) / 2,
    top: -(LOGO_HEIGHT * (SPLASH_LOGO_RENDER_SCALE - 1)) / 2,
  },
  tagline: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.buttonText,
    marginTop: 20,
  },
  location: {
    position: 'absolute',
    fontFamily: typography.fontFamilyRegular,
    fontSize: 13,
    color: colors.buttonText,
    opacity: 0.85,
    letterSpacing: -0.3,
  },
});

export default SplashScreen;
