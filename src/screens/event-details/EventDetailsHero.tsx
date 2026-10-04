import { View } from 'react-native';

import { Image } from 'expo-image';

import styles from './EventDetailsScreen.styles';

type EventDetailsHeroProps = {
  imageUri: string;
  topInset: number;
};

/**
 * Event Details hero: blurred background image, dark/light overlays, and the
 * static square cover card. Both images scroll with their containing page.
 */
const EventDetailsHero = ({ imageUri, topInset }: EventDetailsHeroProps) => {
  return (
    <View style={[styles.heroContainer, { height: 320 + topInset, paddingTop: topInset + 10 }]}>
      <Image
        source={{ uri: imageUri }}
        style={styles.heroBackgroundImage}
        contentFit="cover"
        blurRadius={28}
        transition={0}
      />
      <View pointerEvents="none" style={styles.heroOverlayDark} />
      <View pointerEvents="none" style={styles.heroOverlayLight} />

      <View style={styles.imageCardContainer} testID="hero-cover-card">
        <Image
          source={{ uri: imageUri }}
          style={styles.imageCard}
          contentFit="cover"
          transition={0}
        />
      </View>
    </View>
  );
};

export default EventDetailsHero;
