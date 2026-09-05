import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { StyleProp, View, ViewStyle } from 'react-native';

import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Motion, motionGeometry, motionTiming } from '@theme/motion';
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
 * The animating form. Only mounted for an item that is actually going to play
 * its entry, because the Reanimated machinery below (a shared value, a worklet
 * style, and a native Animated.View) costs real frame time on a recycling list
 * and must not outlive the one-shot animation it exists for.
 */
const PlacedAnimated = ({
  id,
  index = 0,
  tiltMode = 'entry',
  style,
  testID,
  children,
}: PlacedProps) => {
  const progress = useSharedValue(0);
  const tilt = useMemo(() => (tiltMode === 'none' ? 0 : tiltForId(id)), [id, tiltMode]);
  const restTilt = tiltMode === 'rest' ? tilt : 0;

  useEffect(() => {
    if (placedIds.size >= PLACED_ID_LIMIT) {
      placedIds.clear();
    }
    placedIds.add(id);
    progress.value = withDelay(staggerDelayMs(index), withSpring(1, Motion.settle));
  }, [id, index, progress]);

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

  return (
    <Animated.View style={[style, animatedStyle]} testID={testID}>
      {children}
    </Animated.View>
  );
};

/**
 * Settles its children onto the page like a placed photograph: fade in, rise,
 * scale up, and un-tilt (or settle to a slight angle).
 *
 * Anything that is not currently animating — an id already seen, reduce motion,
 * or a row past the stagger window — renders as a plain View with no Reanimated
 * attached at all. That keeps the steady-state cost of a long list at zero;
 * leaving a shared value and worklet style on every recycled row measured at
 * 9% janky frames on a mid-range device versus 0.8% without.
 */
const Placed = (props: PlacedProps) => {
  const { id, index = 0, tiltMode = 'entry', style, testID, children } = props;
  const reducedMotion = useReducedMotion();
  // Captured once at mount: whether this id had already been placed before.
  const [alreadyPlaced] = useState(() => placedIds.has(id));

  // Only the first screenful animates. Rows revealed by scrolling appear
  // immediately, which is both cheaper and less distracting than a cascade
  // that chases the scroll position.
  const withinStaggerWindow = index <= motionTiming.staggerMaxSteps;
  const shouldAnimate = !reducedMotion && !alreadyPlaced && withinStaggerWindow;

  if (shouldAnimate) {
    return <PlacedAnimated {...props} />;
  }

  // Static path. A 'rest' tilt is part of the resting appearance rather than
  // the animation, so it is preserved here with a plain style transform.
  const restAngle = tiltMode === 'rest' ? tiltForId(id) : 0;
  return (
    <View
      style={restAngle === 0 ? style : [style, { transform: [{ rotate: `${restAngle}deg` }] }]}
      testID={testID}
    >
      {children}
    </View>
  );
};

export default Placed;
