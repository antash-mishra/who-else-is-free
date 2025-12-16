import { memo } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

const IMAGE_SIZE_RATIO = 0.22;
const IMAGE_MIN_SIZE = 70;
const IMAGE_MAX_SIZE = 100;
const BORDER_RADIUS_RATIO = 0.2;

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
  const { width: screenWidth } = useWindowDimensions();

  const imageSize = Math.min(
    Math.max(screenWidth * IMAGE_SIZE_RATIO, IMAGE_MIN_SIZE),
    IMAGE_MAX_SIZE
  );
  const imageBorderRadius = imageSize * BORDER_RADIUS_RATIO;

  return (
    <View style={styles.container}>
      <View style={[styles.imageWrapper, { width: imageSize, height: imageSize, borderRadius: imageBorderRadius }]}>
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md
  },
  imageWrapper: {
    overflow: 'hidden'
  },
  image: {
    width: '100%',
    height: '100%'
  },
  badge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    backgroundColor: '#FFFFFFDD',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.sm
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
    gap: 1
  },
  title: {
    fontSize: typography.cardTitle,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  meta: {
    fontSize: 15,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  audience: {
    fontSize: 15,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  }
});

export default memo(EventCard);
