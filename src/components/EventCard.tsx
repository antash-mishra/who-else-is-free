import { memo, type RefObject } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import HostingIcon from '@assets/event/hosting.svg';
import JoinedIcon from '@assets/event/joined.svg';
import PendingIcon from '@assets/event/pending.svg';
import { EVENT_INFO_SEPARATOR } from '@constants/display';
import { colors, spacing, typography } from '@theme/index';
import { eventCoverMotion } from '@theme/motion';
import { formatEventLocationName } from '@utils/eventDisplay';

const IMAGE_SIZE = 80;
const IMAGE_BORDER_RADIUS = eventCoverMotion.cardRadius;
const BLUR_H = 38;

export interface EventItemProps {
  id: string;
  title: string;
  location: string;
  time: string;
  audience: string;
  metaLine?: string;
  imageUri: string;
  badgeLabel?: string;
  coverRef?: RefObject<View | null>;
}

const BADGE_ICON_SIZE = 10;
const VALID_BADGES = ['Pending', 'Requested', 'Hosting', 'Joined'];

const getBadgeIcon = (badgeLabel: string) => {
  switch (badgeLabel) {
    case 'Pending':
    case 'Requested':
      return <PendingIcon width={9.5} height={9.5} />;
    case 'Hosting':
      return <HostingIcon width={BADGE_ICON_SIZE} height={BADGE_ICON_SIZE} />;
    case 'Joined':
      return <JoinedIcon width={9.5} height={9.5} />;
    default:
      return null;
  }
};

const EventCard = ({
  title,
  location,
  time,
  audience,
  metaLine,
  imageUri,
  badgeLabel,
  coverRef,
}: EventItemProps) => {
  const showBadge = badgeLabel && VALID_BADGES.includes(badgeLabel);
  const locationName = formatEventLocationName(location);

  return (
    <View style={styles.container} testID="event-card">
      <View ref={coverRef} collapsable={false} style={styles.imageWrapper}>
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={imageUri}
          transition={150}
        />
        {showBadge && (
          <MaskedView
            style={{ width: IMAGE_SIZE, height: BLUR_H }}
            maskElement={
              <LinearGradient
                colors={['transparent', 'black']}
                locations={[0, 0.7]}
                style={{ width: IMAGE_SIZE, height: BLUR_H }}
              />
            }
          >
            <BlurView intensity={28} tint="dark" style={{ width: IMAGE_SIZE, height: BLUR_H }} />
            <View
              testID="event-card-badge"
              style={{
                position: 'absolute',
                bottom: 6,
                left: 7,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {getBadgeIcon(badgeLabel)}
              <Text style={styles.badgeText}>{badgeLabel}</Text>
            </View>
          </MaskedView>
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {`${locationName}${EVENT_INFO_SEPARATOR}${time}`}
        </Text>
        <Text style={styles.audience} numberOfLines={1}>
          {metaLine ?? audience}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: IMAGE_BORDER_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  badgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.2,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 17,
    lineHeight: typography.body + spacing.xs,
    includeFontPadding: false,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.5,
  },
  meta: {
    fontSize: 15,
    lineHeight: typography.body + spacing.xs,
    includeFontPadding: false,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.5,
  },
  audience: {
    fontSize: 15,
    lineHeight: typography.body + spacing.xs,
    includeFontPadding: false,
    color: colors.cardMeta,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.5,
  },
});

export default memo(EventCard);
