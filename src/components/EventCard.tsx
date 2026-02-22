import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, spacing, typography } from '@theme/index';
import PendingIcon from '@assets/pending.svg';
import HostingIcon from '@assets/hosting.svg';
import JoinedIcon from '@assets/joined.svg';

const IMAGE_SIZE = 68;
const IMAGE_BORDER_RADIUS = 8;

export interface EventItemProps {
  id: string;
  title: string;
  location: string;
  time: string;
  audience: string;
  imageUri: string;
  badgeLabel?: string;
}

const BADGE_ICON_SIZE = 10;
const VALID_BADGES = ['Pending', 'Hosting', 'Joined'];

const getBadgeIcon = (badgeLabel: string) => {
  switch (badgeLabel) {
    case 'Pending':
      return <PendingIcon width={BADGE_ICON_SIZE} height={BADGE_ICON_SIZE} />;
    case 'Hosting':
      return <HostingIcon width={BADGE_ICON_SIZE} height={BADGE_ICON_SIZE} />;
    case 'Joined':
      return <JoinedIcon width={BADGE_ICON_SIZE} height={BADGE_ICON_SIZE} />;
    default:
      return null;
  }
};

const EventCard = ({ title, location, time, audience, imageUri, badgeLabel }: EventItemProps) => {
  const showBadge = badgeLabel && VALID_BADGES.includes(badgeLabel);

  return (
    <View style={styles.container} testID="event-card">
      <View style={styles.imageWrapper}>
        <Image source={{ uri: imageUri }} style={styles.image} />
        {showBadge ? (
          <>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
              locations={[0, 0.56, 1]}
              style={styles.gradient}
            />
            <View style={styles.badge} testID="event-card-badge">
              {getBadgeIcon(badgeLabel)}
              <Text style={styles.badgeText}>{badgeLabel}</Text>
            </View>
          </>
        ) : null}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {`${location}, ${time}`}
        </Text>
        <Text style={styles.audience} numberOfLines={1}>
          {audience}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    // paddingVertical: spacing.sm,
    gap: spacing.md
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: IMAGE_BORDER_RADIUS,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%'
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  badgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 12,
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
    gap: 1
  },
  title: {
    fontSize: typography.cardTitle,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.5
  },
  meta: {
    fontSize: 15,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.5
  },
  
  audience: {
    fontSize: 15,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.5

  }
});

export default memo(EventCard);
