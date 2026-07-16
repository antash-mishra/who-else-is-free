import React, { useLayoutEffect, useEffect, useRef } from 'react';

import { StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { triggerHaptic as triggerSemanticHaptic } from '@services/haptics';
import { colors } from '@theme/colors';

const SWIPE_DISTANCE = 50;
const SWIPE_VELOCITY = 500; // px/s — meaningful flick threshold
// Tap-triggered slide: fixed timing like PagerView.setPage()
const TAP_TIMING = { duration: 280, easing: Easing.out(Easing.cubic) } as const;
// Cancelled swipe snapback
const SNAPBACK_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) } as const;
// Committed swipe settle: responsive near-critical spring, driven by finger velocity.
const COMMIT_SPRING = {
  mass: 0.85,
  stiffness: 340,
  damping: 30,
  overshootClamping: true,
} as const;

type AnimatedPagerProps = {
  selectedIndex: number;
  onPageChange: (index: number) => void;
  onPendingIndexChange?: (index: number) => void;
  pageOffsetSV?: SharedValue<number>;
  children: React.ReactNode;
  style?: ViewStyle;
  swipeEnabled?: boolean;
};

// Supports up to 4 pages. Shared values must be created unconditionally.
const AnimatedPager = ({
  selectedIndex,
  onPageChange,
  onPendingIndexChange,
  pageOffsetSV,
  children,
  style,
  swipeEnabled = true,
}: AnimatedPagerProps) => {
  const { width } = useWindowDimensions();
  const childArray = React.Children.toArray(children);
  const pageCount = childArray.length;
  const prevIndex = useRef(selectedIndex);

  const onPageChangeRef = useRef(onPageChange);
  const onPendingIndexChangeRef = useRef(onPendingIndexChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);
  useEffect(() => {
    onPendingIndexChangeRef.current = onPendingIndexChange;
  }, [onPendingIndexChange]);

  // Prevents useLayoutEffect from re-running the slide animation when selectedIndex
  // updates as a result of a swipe commit (animation already done by gesture handler)
  const swipeCommittedRef = useRef(false);

  // Each page has a single translateX shared value
  const slide0 = useSharedValue(0 === selectedIndex ? 0 : 0 < selectedIndex ? -width : width);
  const slide1 = useSharedValue(1 === selectedIndex ? 0 : 1 < selectedIndex ? -width : width);
  const slide2 = useSharedValue(2 === selectedIndex ? 0 : 2 < selectedIndex ? -width : width);
  const slide3 = useSharedValue(3 === selectedIndex ? 0 : 3 < selectedIndex ? -width : width);
  const slides = [slide0, slide1, slide2, slide3];

  const selectedIndexSV = useSharedValue(selectedIndex);
  const widthSV = useSharedValue(width);
  const dragFrom = useSharedValue(-1);
  const dragTo = useSharedValue(-1);

  useEffect(() => {
    selectedIndexSV.value = selectedIndex;
  }, [selectedIndex]);
  useEffect(() => {
    widthSV.value = width;
  }, [width]);

  const notifyPageChange = (index: number) => {
    swipeCommittedRef.current = true;
    onPageChangeRef.current(index);
  };
  const notifyPendingChange = (index: number) => {
    onPendingIndexChangeRef.current?.(index);
  };
  const triggerHaptic = () => {
    triggerSemanticHaptic('selection');
  };

  const pan = Gesture.Pan()
    .enabled(swipeEnabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-25, 25])
    .onUpdate((e) => {
      const dx = e.translationX;
      const current = selectedIndexSV.value;
      const w = widthSV.value;

      if (dragFrom.value === -1) {
        if (dx < 0 && current < pageCount - 1) {
          dragFrom.value = current;
          dragTo.value = current + 1;
          runOnJS(notifyPendingChange)(current + 1);
        } else if (dx > 0 && current > 0) {
          dragFrom.value = current;
          dragTo.value = current - 1;
          runOnJS(notifyPendingChange)(current - 1);
        } else {
          return;
        }

        cancelAnimation(slides[dragFrom.value]);
        cancelAnimation(slides[dragTo.value]);
        if (pageOffsetSV) {
          cancelAnimation(pageOffsetSV);
        }
      }

      const from = dragFrom.value;
      const to = dragTo.value;
      // The new swipe owns both pages immediately; they then track like a belt.
      slides[from].value = dx;
      slides[to].value = to > from ? dx + w : dx - w;

      // Continuous page offset for filter tracking
      if (pageOffsetSV) {
        const fraction = Math.max(0, Math.min(1, Math.abs(dx) / w));
        pageOffsetSV.value = from + (to - from) * fraction;
      }
    })
    .onEnd((e) => {
      const from = dragFrom.value;
      const to = dragTo.value;
      dragFrom.value = -1;
      dragTo.value = -1;
      if (from === -1) return;

      const dx = e.translationX;
      const vx = e.velocityX;
      const w = widthSV.value;
      const toIsNext = to > from;
      const committed = toIsNext
        ? dx < -SWIPE_DISTANCE || vx < -SWIPE_VELOCITY
        : dx > SWIPE_DISTANCE || vx > SWIPE_VELOCITY;

      if (committed) {
        runOnJS(triggerHaptic)();
        runOnJS(notifyPageChange)(to);
        selectedIndexSV.value = to;

        if (pageOffsetSV) {
          pageOffsetSV.value = withTiming(to, TAP_TIMING);
        }
        // Spring with finger velocity — carries momentum naturally, no overshoot
        slides[from].value = withSpring(toIsNext ? -w : w, { ...COMMIT_SPRING, velocity: vx });
        slides[to].value = withSpring(0, { ...COMMIT_SPRING, velocity: vx });
      } else {
        // Not committed — snap back with timing
        if (pageOffsetSV) {
          pageOffsetSV.value = withTiming(from, SNAPBACK_TIMING);
        }
        runOnJS(notifyPendingChange)(from);
        slides[from].value = withTiming(0, SNAPBACK_TIMING);
        slides[to].value = withTiming(toIsNext ? w : -w, SNAPBACK_TIMING);
      }
    })
    .onFinalize((_, success) => {
      if (!success) {
        const from = dragFrom.value;
        const to = dragTo.value;
        dragFrom.value = -1;
        dragTo.value = -1;
        if (from === -1) return;
        const w = widthSV.value;
        if (pageOffsetSV) {
          pageOffsetSV.value = withTiming(from, SNAPBACK_TIMING);
        }
        runOnJS(notifyPendingChange)(from);
        slides[from].value = withTiming(0, SNAPBACK_TIMING);
        slides[to].value = withTiming(to > from ? w : -w, SNAPBACK_TIMING);
      }
    });

  // Tap-triggered: clean synchronized slide from edge, same as PagerView.setPage()
  useLayoutEffect(() => {
    const from = prevIndex.current;
    const to = selectedIndex;
    prevIndex.current = to;
    if (from === to) return;

    // Swipe already animated the pages — just sync the ref, skip the tap transition
    if (swipeCommittedRef.current) {
      swipeCommittedRef.current = false;
      return;
    }

    const toIsRight = to > from;

    cancelAnimation(slides[to]);
    cancelAnimation(slides[from]);

    // Filter snaps instantly on tap — only tracks smoothly during swipes
    if (pageOffsetSV) {
      pageOffsetSV.value = to;
    }

    // Start incoming page from full off-screen edge
    slides[to].value = toIsRight ? width : -width;

    slides[to].value = withTiming(0, TAP_TIMING, (finished) => {
      if (finished) {
        slides[from].value = toIsRight ? -width : width;
      }
    });
    slides[from].value = withTiming(toIsRight ? -width : width, TAP_TIMING);
  }, [selectedIndex, width]);

  const animStyle0 = useAnimatedStyle(() => ({ transform: [{ translateX: slide0.value }] }));
  const animStyle1 = useAnimatedStyle(() => ({ transform: [{ translateX: slide1.value }] }));
  const animStyle2 = useAnimatedStyle(() => ({ transform: [{ translateX: slide2.value }] }));
  const animStyle3 = useAnimatedStyle(() => ({ transform: [{ translateX: slide3.value }] }));
  const animStyles = [animStyle0, animStyle1, animStyle2, animStyle3];

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, style]}>
        {childArray.map((child, index) => {
          const isActive = index === selectedIndex;
          return (
            <Animated.View
              key={index}
              collapsable={false}
              accessibilityElementsHidden={!isActive}
              importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
              pointerEvents={isActive ? 'auto' : 'none'}
              style={[
                StyleSheet.absoluteFill,
                animStyles[index],
                { backgroundColor: colors.background },
              ]}
            >
              {child}
            </Animated.View>
          );
        })}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default AnimatedPager;
