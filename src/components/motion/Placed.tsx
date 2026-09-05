/* eslint-disable react-hooks/immutability -- Reanimated entry animation mutates a shared value from an effect. */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import { StyleProp, View, ViewStyle } from 'react-native';

import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Motion, motionGeometry } from '@theme/motion';
import { seedFromString, seededRand } from '@utils/seededRandom';

import { staggerDelayMs } from './staggerDelay';

/**
 * Ids that have already played their entry. An item animates once per id, so
 * SectionList cell recycling, pager page changes, and re-renders do not re-fire
 * entries on rows the user has already seen.
 */
const placedIds = new Set<string>();
const PLACED_ID_LIMIT = 500;

/** Test seam: forget every placed id. */
export const resetPlacedIds = (): void => {
  placedIds.clear();
};

/** Deterministic resting/entry angle for an id, in degrees. */
const tiltForId = (id: string): number =>
  (seededRand(seedFromString(id)) * 2 - 1) * motionGeometry.tiltMaxDeg;

export type PlacedTiltMode = 'entry' | 'rest' | 'none';

export type PlacedProps = {
  /** Stable identity. Entry plays once per id for the app's lifetime. */
  id: string;
  /** Position within a staggered group. Delay is capped by staggerDelayMs. */
  index?: number;
  /**
   * 'entry' starts tilted and settles square — right for text rows.
   * 'rest' settles to a slight angle — right for photo cards.
   * 'none' never rotates.
   */
  tiltMode?: PlacedTiltMode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/**
 * Settles its children onto the page like a placed photograph: fade in, rise,
 * scale up, and un-tilt (or settle to a slight angle).
 *
 * Honours reduce motion by rendering a plain, static View.
 */
const Placed = ({ id, index = 0, tiltMode = 'entry', style, testID, children }: PlacedProps) => {
  const reducedMotion = useReducedMotion();
  const alreadyPlaced = useRef(placedIds.has(id)).current;
  const shouldAnimate = !reducedMotion && !alreadyPlaced;

  const progress = useSharedValue(shouldAnimate ? 0 : 1);
  const tilt = useMemo(() => (tiltMode === 'none' ? 0 : tiltForId(id)), [id, tiltMode]);
  const restTilt = tiltMode === 'rest' ? tilt : 0;

  useEffect(() => {
    if (!shouldAnimate) {
      return;
    }
    if (placedIds.size >= PLACED_ID_LIMIT) {
      placedIds.clear();
    }
    placedIds.add(id);
    progress.value = withDelay(staggerDelayMs(index), withSpring(1, Motion.settle));
  }, [id, index, progress, shouldAnimate]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const angle = restTilt + (tilt - restTilt) * (1 - p);
    return {
      opacity: p,
      transform: [
        { translateY: (1 - p) * motionGeometry.entryTranslateY },
        { scale: motionGeometry.entryScaleFrom + (1 - motionGeometry.entryScaleFrom) * p },
        { rotate: `${angle}deg` },
      ],
    };
  });

  if (reducedMotion) {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={[style, animatedStyle]} testID={testID}>
      {children}
    </Animated.View>
  );
};

export default Placed;
