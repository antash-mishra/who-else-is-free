import { View } from 'react-native';

import { Image } from 'expo-image';

import styles from './EventDetailsScreen.styles';

type EventDetailsHeroProps = {
  imageUri: string;
  topInset: number;
};

/**
 * Event Details hero: blurred background image, dark/light overlays, and the
 * elevated square cover card.
 */
const EventDetailsHero = ({ imageUri, topInset }: EventDetailsHeroProps) => (
  <View style={[styles.heroContainer, { height: 320 + topInset, paddingTop: topInset + 10 }]}>
    <Image
      source={{ uri: imageUri }}
      style={styles.heroBackgroundImage}
      contentFit="cover"
      blurRadius={28}
      transition={150}
    />
    <View pointerEvents="none" style={styles.heroOverlayDark} />
    <View pointerEvents="none" style={styles.heroOverlayLight} />

    {/* Elevated Image Card */}
    <View style={styles.imageCardContainer}>
      <Image
        source={{ uri: imageUri }}
        style={styles.imageCard}
        contentFit="cover"
        transition={150}
      />
    </View>
  </View>
);

export default EventDetailsHero;
