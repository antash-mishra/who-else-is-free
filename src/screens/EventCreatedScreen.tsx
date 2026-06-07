import { useCallback, useEffect, useRef } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Springs } from '@theme/springs';
import { typography } from '@theme/index';
import { RootStackParamList } from '@navigation/types';

type EventCreatedRoute = RouteProp<RootStackParamList, 'EventCreated'>;
type EventCreatedNavigation = NativeStackNavigationProp<RootStackParamList, 'EventCreated'>;

const EventCreatedScreen = () => {
  const { width, height } = useWindowDimensions();
  const route = useRoute<EventCreatedRoute>();
  const navigation = useNavigation<EventCreatedNavigation>();

  const { eventTitle, coverUri, buttonLayout, skipAnimation } = route.params;

  const onCompleteRef = useRef(() => {
    navigation.navigate('Main', {
      screen: 'MyEvents',
      params: { showEventCreatedBadge: true },
    });
  });

  const done = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  // Button geometry as shared values
  const btnCX = useSharedValue(buttonLayout.x + buttonLayout.width / 2 - width / 2);
  const btnCY = useSharedValue(buttonLayout.y + buttonLayout.height / 2 - height / 2);
  const btnSX = useSharedValue(buttonLayout.width / width || 0.85);
  const btnSY = useSharedValue(buttonLayout.height / height || 0.06);

  const expandProgress = useSharedValue(0);
  const contentAlpha = useSharedValue(0);
  const screenAlpha = useSharedValue(1);
  const cardBobY = useSharedValue(0);
  const shimmerX = useSharedValue(-200);

  useEffect(() => {
    if (skipAnimation) {
      done();
      return;
    }
    // 1 · White rect expands from button position to fill screen
    expandProgress.value = withSpring(1, Springs.bouncyUp, () => {
      // 2 · Content fades in
      contentAlpha.value = withTiming(1, { duration: 240 });

      // 3 · Card bobs slowly up ↔ down
      cardBobY.value = withDelay(
        80,
        withRepeat(
          withSequence(
            withTiming(-10, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
            withTiming(10, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        ),
      );

      // 4 · Looping AI-thinking shimmer on "Creating event..."
      shimmerX.value = -200;
      shimmerX.value = withRepeat(
        withSequence(
          withTiming(width + 200, { duration: 1200, easing: Easing.linear }),
          withTiming(-200, { duration: 50 }),
        ),
        -1,
      );

      // 5 · After 2200 ms display, navigate first (while still white), then fade
      // done() fires at 2200ms → CommonActions.reset removes this screen instantly
      // (forNoAnimation), so MyEvents appears before any fade is visible
      screenAlpha.value = withDelay(
        2200,
        withSequence(
          withTiming(1, { duration: 0 }, () => {
            runOnJS(done)();
          }),
          withTiming(0, { duration: 300 }),
        ),
      );
    });
  }, []);

  const expandStyle = useAnimatedStyle(() => {
    const p = expandProgress.value;
    const sx = btnSX.value + (1 - btnSX.value) * p;
    const sy = btnSY.value + (1 - btnSY.value) * p;
    return {
      transform: [
        { translateX: btnCX.value * (1 - p) },
        { translateY: btnCY.value * (1 - p) },
        { scaleX: sx },
        { scaleY: sy },
      ],
      borderRadius: 999 * (1 - p),
    };
  });

  const sScreen = useAnimatedStyle(() => ({ opacity: screenAlpha.value }));
  const sContent = useAnimatedStyle(() => ({ opacity: contentAlpha.value }));
  const sCard = useAnimatedStyle(() => ({ transform: [{ translateY: cardBobY.value }] }));
  const sShimmer = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }] }));

  const cardSize = Math.round(width * 0.6);

  // Static initial style applied before Reanimated's first frame so the white
  // rect is never full-screen: it starts at button size/position immediately.
  const whiteRectInitialStyle = useMemo(
    () => ({
      transform: [
        { translateX: buttonLayout.x + buttonLayout.width / 2 - width / 2 },
        { translateY: buttonLayout.y + buttonLayout.height / 2 - height / 2 },
        { scaleX: buttonLayout.width / width || 0.85 },
        { scaleY: buttonLayout.height / height || 0.06 },
      ],
      borderRadius: 999,
    }),
    [],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, sScreen]}>
      {/* Same dark blurred background as CreateEventScreen — cut is invisible */}
      <Image
        source={{ uri: coverUri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        blurRadius={28}
      />
      <View style={styles.backgroundOverlay} />

      {/* White rect — starts at button size/position, expands to fill screen.
                whiteRectInitialStyle seeds the correct transform before Reanimated
                applies expandStyle, preventing a full-screen white flash on frame 0. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.whiteRect, whiteRectInitialStyle, expandStyle]}
      >
        {/* Content — only visible once expansion settles */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.contentLayer, sContent]}>
          {/* Floating cover card */}
          <Animated.View style={sCard}>
            <View style={[styles.card, { width: cardSize, height: cardSize }]}>
              {coverUri ? (
                <Image
                  source={{ uri: coverUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.cardFallback]} />
              )}
            </View>
          </Animated.View>

          <View style={styles.textBlock}>
            {/* Event name */}
            <Text style={styles.eventName}>{eventTitle}</Text>

            {/* "Creating event..." — looping shimmer */}
            <MaskedView
              style={styles.maskedRoot}
              maskElement={
                <View style={styles.maskShape}>
                  <Text style={styles.creatingLabel}>Creating event...</Text>
                </View>
              }
            >
              <View style={styles.maskShape}>
                <Text style={[styles.creatingLabel, styles.dimGrey]}>Creating event...</Text>
              </View>
              <Animated.View style={[styles.shimmerStrip, sShimmer]} pointerEvents="none">
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.85)', 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </MaskedView>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#111',
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  whiteRect: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  contentLayer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  cardFallback: {
    backgroundColor: '#F0F0F0',
  },
  textBlock: {
    alignItems: 'center',
    gap: 8,
  },
  eventName: {
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    color: '#111111',
    lineHeight: 24,
    letterSpacing: -0.5,
    textAlign: 'center',
    paddingHorizontal: 28,
  },
  maskedRoot: {
    alignItems: 'center',
  },
  maskShape: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  creatingLabel: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: '#fff',
    letterSpacing: 0.1,
  },
  dimGrey: {
    color: '#B8B8B8',
  },
  shimmerStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 200,
  },
});

export default EventCreatedScreen;
