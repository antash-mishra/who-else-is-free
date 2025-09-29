import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@theme/index';

export interface EventItemProps {
  id: string;
  title: string;
  location: string;
  time: string;
  audience: string;
  imageUri: string;
  badgeLabel?: string;
}

const EventCard = ({ title, location, time, audience, imageUri, badgeLabel }: EventItemProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        <Image source={{ uri: imageUri }} style={styles.image} />
        {badgeLabel ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{`${location}, ${time}`}</Text>
        <Text style={styles.audience}>{audience}</Text>
      </View>
    </View>
  );
};

const CARD_HEIGHT = 80;
const IMAGE_SIZE = 80;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CARD_HEIGHT,
    gap: 20
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 16,
    overflow: 'hidden'
  },
  image: {
    width: '100%',
    height: '100%'
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FFFFFFDD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  badgeText: {
    fontSize: typography.caption,
    color: colors.primary,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  content: {
    flex: 1,
    gap: 2
  },
  title: {
    fontSize: typography.cardTitle,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  meta: {
    fontSize: typography.cardMeta,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  audience: {
    fontSize: typography.cardMeta,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  }
});

export default memo(EventCard);
