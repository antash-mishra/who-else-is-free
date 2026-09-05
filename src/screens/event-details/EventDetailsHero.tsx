import { View } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import { Placed } from '@components/motion';

import styles from './EventDetailsScreen.styles';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Backdrop drifts at this fraction of scroll speed. */
const BACKDROP_RATE = 0.5;
/** Cover card drifts slightly with the page, but slower than the content. */
const COVER_RATE = 0.2;

type EventDetailsHeroProps = {
  imageUri: string;
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
const EventDetailsHero = ({ imageUri, topInset, scrollY }: EventDetailsHeroProps) => {
  const reducedMotion = useReducedMotion();

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

      {/* Elevated Image Card — settles onto the page like a placed photo. */}
      <Animated.View style={[styles.imageCardContainer, coverStyle]}>
        <Placed id={`hero-${imageUri}`} tiltMode="rest" testID="hero-cover-card">
          <Image
            source={{ uri: imageUri }}
            style={styles.imageCard}
            contentFit="cover"
            transition={150}
          />
        </Placed>
      </Animated.View>
    </View>
  );
};

export default EventDetailsHero;
