import { useCallback, useEffect, useRef, useState } from 'react';

import { NativeSyntheticEvent, Text, TextLayoutEventData, View } from 'react-native';

import DescriptionIcon from '@assets/event-details/description.svg';
import PeopleIcon from '@assets/event-details/group-type.svg';
import LocationIcon from '@assets/event-details/location.svg';
import TimeIcon from '@assets/event-details/time.svg';
import {
  useEventSharedTransition,
  useEventSharedTransitionState,
} from '@components/events/EventSharedTransition';
import { Placed } from '@components/motion';
import UserAvatar from '@components/UserAvatar';
import { triggerHaptic } from '@services/haptics';
import { colors } from '@theme/index';

import styles from './EventDetailsScreen.styles';

type DescriptionTruncation = { firstLine: string; rest: string };

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
  eventId?: string;
  /** True when the page was opened from a card: the title lands the shared flight. */
  sharedTitle?: boolean;
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
  eventId,
  sharedTitle,
}: EventDetailsInfoProps) => {
  const titleRef = useRef<Text>(null);
  const { land } = useEventSharedTransition();
  const { eventId: activeEventId } = useEventSharedTransitionState();
  // The flying replica lands pixel-identical to the first line, so the real title
  // simply takes over at hand-off; revealing it earlier reads as a second copy.
  const titleHidden = !!sharedTitle && !!eventId && activeEventId === eventId;
  const measureTitle = useCallback(() => {
    if (!titleHidden || !eventId) return;
    titleRef.current?.measureInWindow((x, y, width, height) => {
      land(eventId, 'title', { x, y, width, height }, { titleStyle: styles.title });
    });
  }, [eventId, land, titleHidden]);
  useEffect(() => {
    const frame = requestAnimationFrame(measureTitle);
    return () => globalThis.cancelAnimationFrame(frame);
  }, [measureTitle]);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // First line + remainder when the description spills past two lines (null = fits).
  const [descriptionTruncation, setDescriptionTruncation] = useState<DescriptionTruncation | null>(
    null,
  );

  const handleDescriptionTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      const { lines } = event.nativeEvent;
      if (lines.length > 2) {
        setDescriptionTruncation({
          firstLine: lines[0].text,
          rest: lines
            .slice(1)
            .map((line) => line.text)
            .join(''),
        });
      } else {
        setDescriptionTruncation(null);
      }
    },
    [],
  );

  const toggleDescription = useCallback(() => {
    triggerHaptic('light');
    setDescriptionExpanded((prev) => !prev);
  }, []);

  return (
    <>
      {/* Header block has no gap; each row's vertical spacing is its own
          marginTop (styles.hostedBy / styles.goingRow). */}
      <View style={styles.headerBlock}>
        <Text
          ref={titleRef}
          onLayout={measureTitle}
          style={[styles.title, titleHidden ? styles.titleHidden : styles.titleShown]}
          testID="event-details-title"
        >
          {title}
        </Text>
        <Text style={styles.hostedBy}>{hostLine}</Text>
        {!readOnly && !isSingleEvent && (
          <View style={styles.goingRow} testID="going-row">
            <View style={styles.goingAvatarStack}>
              {/* tiltMode none: overlapping circles must not rotate or the
                  overlap reads as broken. */}
              {goingParticipants.slice(0, 3).map((participant, index) => (
                <Placed
                  key={`${participant.id}-${index}`}
                  id={`going-${participant.id}-${index}`}
                  index={index}
                  tiltMode="none"
                  testID={`placed-going-${index}`}
                >
                  <View
                    style={[styles.goingAvatarItem, index > 0 && styles.goingAvatarOverlap]}
                    testID={`going-avatar-${index}`}
                  >
                    {renderAvatar(participant, 24)}
                  </View>
                </Placed>
              ))}
              {/* "+N" overflow badge when more than 3 people are going. */}
              {goingCount > 3 && (
                <View
                  style={[
                    styles.goingAvatarItem,
                    styles.goingAvatarOverlap,
                    styles.goingOverflowBadge,
                  ]}
                  testID="going-avatar-overflow"
                >
                  <Text style={styles.goingOverflowText}>{`+${goingCount - 3}`}</Text>
                </View>
              )}
            </View>
            <Text style={styles.goingLabel} testID="going-count-label">
              {`${goingCount} ${goingCount === 1 ? 'Member' : 'Members'}`}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.divider, { marginTop: 20, marginBottom: 24 }]} />

      <Text style={styles.sectionHeading}>Plan details</Text>
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
              {/* Hidden full render to measure wrapped lines (in-flow so it wraps
                  at the same width as the visible text). */}
              <View style={styles.measureContainer} pointerEvents="none">
                <Text
                  style={styles.description}
                  onTextLayout={handleDescriptionTextLayout}
                  testID="description-full-measure"
                >
                  {description}
                </Text>
              </View>

              {descriptionExpanded ? (
                <Text style={styles.description}>
                  {description}
                  {'  '}
                  <Text style={styles.seeMoreText} onPress={toggleDescription}>
                    See less
                  </Text>
                </Text>
              ) : descriptionTruncation ? (
                // Line 2 is a flex row so "See more" pins to the far right while
                // the remaining text ellipsizes to fill.
                <>
                  <Text style={styles.description} numberOfLines={1}>
                    {descriptionTruncation.firstLine}
                  </Text>
                  <View style={styles.descriptionSecondLine}>
                    <Text
                      style={[styles.description, styles.descriptionSecondLineText]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {descriptionTruncation.rest}
                    </Text>
                    <Text
                      style={[styles.seeMoreText, styles.seeMoreInlineGap]}
                      onPress={toggleDescription}
                    >
                      See more
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.description}>{description}</Text>
              )}
            </View>
          </View>
        )}
      </View>
    </>
  );
};

export default EventDetailsInfo;
