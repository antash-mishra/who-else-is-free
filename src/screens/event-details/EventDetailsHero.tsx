import { useCallback, useEffect, useRef } from 'react';

import { View, useWindowDimensions } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import {
  useEventSharedTransition,
  useEventSharedTransitionState,
} from '@components/events/EventSharedTransition';
import { Placed } from '@components/motion';
import { eventSharedMotion, heroCoverSize, motionGeometry } from '@theme/motion';
import { seedFromString, seededRand } from '@utils/seededRandom';

import styles from './EventDetailsScreen.styles';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Backdrop drifts at this fraction of scroll speed. */
const BACKDROP_RATE = 0.5;
/** Cover card drifts slightly with the page, but slower than the content. */
const COVER_RATE = 0.2;

type EventDetailsHeroProps = {
  imageUri: string;
  eventId?: string;
  sharedCover?: boolean;
  topInset: number;
  /** Vertical scroll offset of the host ScrollView, for parallax. */
  scrollY?: SharedValue<number>;
};

/**
 * Event Details hero: blurred background image, dark/light overlays, and the
 * elevated square cover card.
 *
 * The backdrop and the cover card drift at different rates as the page scrolls
 * away. The host ScrollView keeps `bounces={false}`, so this is scroll-away
 * parallax only — there is no stretchy pull-down.
 */
const EventDetailsHero = ({
  imageUri,
  topInset,
  scrollY,
  eventId,
  sharedCover,
}: EventDetailsHeroProps) => {
  const reducedMotion = useReducedMotion();
  const coverRef = useRef<View>(null);
  // Exactly the flying cover's layout size, so the hero's bitmap is the same
  // cache entry and appears on the hand-off frame instead of decoding again.
  const coverSize = heroCoverSize(useWindowDimensions().width);
  const { land } = useEventSharedTransition();
  const { eventId: activeEventId } = useEventSharedTransitionState();
  const hidden = !!sharedCover && !!eventId && activeEventId === eventId;
  const rotation = reducedMotion
    ? 0
    : (seededRand(seedFromString(`hero-${imageUri}`)) * 2 - 1) * motionGeometry.tiltMaxDeg;
  const measureCover = useCallback(() => {
    if (!hidden || !eventId) return;
    coverRef.current?.measureInWindow((x, y, width, height) => {
      land(eventId, 'cover', { x, y, width, height }, { rotation });
    });
  }, [hidden, eventId, land, rotation]);
  useEffect(() => {
    const frame = requestAnimationFrame(measureCover);
    return () => globalThis.cancelAnimationFrame(frame);
  }, [measureCover]);
  const cover = (
    <Image
      source={{ uri: imageUri }}
      style={styles.imageCard}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={sharedCover ? 0 : 150}
    />
  );

  const backdropStyle = useAnimatedStyle(() => {
    if (!scrollY || reducedMotion) {
      return {};
    }
    return { transform: [{ translateY: scrollY.value * BACKDROP_RATE }] };
  });

  const coverStyle = useAnimatedStyle(() => {
    if (!scrollY || reducedMotion) {
      return {};
    }
    return { transform: [{ translateY: scrollY.value * COVER_RATE }] };
  });

  return (
    <View style={[styles.heroContainer, { height: 320 + topInset, paddingTop: topInset + 10 }]}>
      <AnimatedImage
        source={{ uri: imageUri }}
        style={[styles.heroBackgroundImage, backdropStyle]}
        contentFit="cover"
        blurRadius={28}
        transition={150}
      />
      <View pointerEvents="none" style={styles.heroOverlayDark} />
      <View pointerEvents="none" style={styles.heroOverlayLight} />

      <Animated.View style={[styles.imageCardContainer, { width: coverSize }, coverStyle]}>
        <View ref={coverRef} onLayout={measureCover} collapsable={false} style={{ flex: 1 }}>
          {sharedCover ? (
            <View
              testID="hero-cover-card"
              style={{
                flex: 1,
                opacity: hidden ? 0 : 1,
                transform: [{ rotate: `${rotation}deg` }],
                borderRadius: eventSharedMotion.heroRadius,
              }}
            >
              {cover}
            </View>
          ) : (
            <Placed id={`hero-${imageUri}`} tiltMode="rest" testID="hero-cover-card">
              {cover}
            </Placed>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

export default EventDetailsHero;
