import { useEffect, useState } from 'react';

import { Text, View } from 'react-native';

import DescriptionIcon from '@assets/event-details/description.svg';
import PeopleIcon from '@assets/event-details/group-type.svg';
import LocationIcon from '@assets/event-details/location.svg';
import TimeIcon from '@assets/event-details/time.svg';
import ScalePressable from '@components/ScalePressable';
import UserAvatar from '@components/UserAvatar';
import { colors } from '@theme/index';

import styles from './EventDetailsScreen.styles';

type GoingParticipant = {
  id: number;
  name: string;
  avatar?: string | null;
};

type EventDetailsInfoProps = {
  title: string;
  hostLine: string;
  readOnly: boolean;
  isSingleEvent: boolean;
  goingParticipants: GoingParticipant[];
  goingCount: number;
  location: string;
  scheduleLine: string;
  audienceLine: string;
  description?: string;
};

const renderAvatar = (participant: GoingParticipant, size: number = 40) => (
  <UserAvatar
    avatar={participant.avatar ?? undefined}
    name={participant.name}
    seed={participant.id}
    size={size}
  />
);

/**
 * Event Details info block: title, host line, going avatars stack, detail
 * rows (location/time/audience), and the expandable description. Owns the
 * description measurement/expansion state.
 */
const EventDetailsInfo = ({
  title,
  hostLine,
  readOnly,
  isSingleEvent,
  goingParticipants,
  goingCount,
  location,
  scheduleLine,
  audienceLine,
  description,
}: EventDetailsInfoProps) => {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionHasMore, setDescriptionHasMore] = useState(false);
  const [fullDescHeight, setFullDescHeight] = useState(0);
  const [truncatedDescHeight, setTruncatedDescHeight] = useState(0);

  useEffect(() => {
    if (fullDescHeight > 0 && truncatedDescHeight > 0) {
      setDescriptionHasMore(fullDescHeight > truncatedDescHeight + 1);
    }
  }, [fullDescHeight, truncatedDescHeight]);

  return (
    <>
      {/* Header block has no gap; each row's vertical spacing is its own
          marginTop (styles.hostedBy / styles.goingRow). */}
      <View style={styles.headerBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hostedBy}>{hostLine}</Text>
        {!readOnly && !isSingleEvent && (
          <View style={styles.goingRow} testID="going-row">
            <View style={styles.goingAvatarStack}>
              {goingParticipants.slice(0, 4).map((participant, index) => (
                <View
                  key={`${participant.id}-${index}`}
                  style={[styles.goingAvatarItem, index > 0 && styles.goingAvatarOverlap]}
                  testID={`going-avatar-${index}`}
                >
                  {renderAvatar(participant, 28)}
                </View>
              ))}
            </View>
            <Text style={styles.goingLabel} testID="going-count-label">
              {`${goingCount} Going`}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.divider, { marginTop: 20, marginBottom: 24 }]} />

      <Text style={styles.sectionHeading}>Details</Text>
      <View style={styles.detailDiv}>
        <View style={styles.detailRowTop}>
          <View style={styles.detailIconContainerTop}>
            <LocationIcon width={20} height={20} color={colors.iconColor} />
          </View>
          <Text style={styles.detailText}>{location}</Text>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailIconContainer}>
            <TimeIcon width={20} height={20} color={colors.iconColor} />
          </View>
          <Text style={styles.detailText}>{scheduleLine}</Text>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailIconContainer}>
            <PeopleIcon width={20} height={20} color={colors.iconColor} />
          </View>
          <Text style={styles.detailText}>{audienceLine}</Text>
        </View>
        {!!description && (
          <View style={styles.descriptionRow}>
            {/* Icon container height = description line-height, so with the row
                top-aligned the icon centers on the FIRST line: it reads centered
                on a single line and top-aligned once the text wraps. */}
            <View style={styles.descriptionIconContainer}>
              <DescriptionIcon width={20} height={20} color={colors.iconColor} />
            </View>
            <View style={styles.descriptionContent}>
              <View style={styles.measureContainer}>
                <Text
                  style={styles.description}
                  onLayout={(e) => setFullDescHeight(e.nativeEvent.layout.height)}
                  testID="description-full-measure"
                >
                  {description}
                </Text>
                <Text
                  style={styles.description}
                  numberOfLines={2}
                  onLayout={(e) => setTruncatedDescHeight(e.nativeEvent.layout.height)}
                  testID="description-truncated-measure"
                >
                  {description}
                </Text>
              </View>
              <Text style={styles.description} numberOfLines={descriptionExpanded ? undefined : 2}>
                {description}
              </Text>
              {descriptionHasMore && (
                <ScalePressable
                  haptic="light"
                  onPress={() => setDescriptionExpanded((prev) => !prev)}
                  style={styles.seeMoreButton}
                >
                  <Text style={styles.seeMoreText}>
                    {descriptionExpanded ? 'See less' : 'See more'}
                  </Text>
                </ScalePressable>
              )}
            </View>
          </View>
        )}
      </View>
    </>
  );
};

export default EventDetailsInfo;
