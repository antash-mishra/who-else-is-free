import { Animated, Platform } from 'react-native';

import { CardStyleInterpolators, type StackCardInterpolationProps } from '@react-navigation/stack';

import { eventSharedMotion } from '@theme/motion';
import { Springs } from '@theme/springs';

// ─── Stack screen animation ───────────────────────────────────────────────────
// Push (open):  incoming slides from 30% right — matches tab animation
// Pop  (close): card slides fully off to the right — standard iOS back feel
export const slideFromRightInterpolator = ({ current, layouts }: StackCardInterpolationProps) => ({
  cardStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [layouts.screen.width, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  },
});

export const slideFromRightTransitionSpec = {
  open: { animation: 'spring' as const, config: Springs.snappy },
  close: { animation: 'spring' as const, config: Springs.snappy },
};

export const eventDetailsScreenOptions = {
  gestureEnabled: false,
  cardStyleInterpolator: slideFromRightInterpolator,
  transitionSpec: slideFromRightTransitionSpec,
};

// Full-screen slide-up modal — no background scaling/dimming
export const slideFromBottomInterpolator = ({ current, layouts }: StackCardInterpolationProps) => ({
  cardStyle: {
    transform: [
      {
        translateY: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [layouts.screen.height, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  },
});

export const slideFromBottomTransitionSpec = {
  open: { animation: 'spring' as const, config: Springs.snappy },
  close: { animation: 'spring' as const, config: Springs.snappy },
};

// Sheet modal: backdrop fades in place (overlayStyle, requires cardOverlayEnabled),
// transparent card slides up carrying the sheet content anchored to bottom.
// Matches BottomSheetModal behaviour exactly.
export const sheetModalInterpolator = ({ current, layouts }: StackCardInterpolationProps) => ({
  overlayStyle: {
    opacity: current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.4],
      extrapolate: 'clamp',
    }),
  },
  cardStyle: {
    transform: [
      {
        translateY: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [layouts.screen.height, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  },
});

export const sheetModalTransitionSpec = {
  open: { animation: 'spring' as const, config: Springs.bouncyUp },
  close: { animation: 'spring' as const, config: Springs.elegant },
};

export const sheetModalScreenOptions = Platform.select({
  android: {
    gestureEnabled: false,
    cardStyle: { backgroundColor: 'transparent' },
    cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
  },
  default: {
    gestureEnabled: false,
    cardOverlayEnabled: true,
    cardStyle: { backgroundColor: 'transparent' },
    cardStyleInterpolator: sheetModalInterpolator,
    transitionSpec: sheetModalTransitionSpec,
  },
});

// Card-origin Details owns its shared opening and return. Configure instant
// stack removal from the outset: changing options and popping in the same JS
// batch can leave the closing route with its old, input-blocking descriptor.
export const sharedCoverScreenOptions = {
  ...eventDetailsScreenOptions,
  animation: 'none' as const,
  detachPreviousScreen: false,
  cardStyle: { backgroundColor: 'transparent' },
  cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
  transitionSpec: {
    open: { animation: 'timing' as const, config: { duration: 0 } },
    close: { animation: 'timing' as const, config: { duration: 0 } },
  },
};

// The page installs this only when it cannot perform a shared return, and
// waits for the options to commit before dispatching the fallback navigation.
export const fallbackSharedCoverScreenOptions = {
  ...sharedCoverScreenOptions,
  animation: 'fade' as const,
  cardStyleInterpolator: ({ current, closing }: StackCardInterpolationProps) => ({
    cardStyle: {
      opacity: Animated.subtract(
        1,
        Animated.multiply(closing, Animated.subtract(1, current.progress)),
      ),
    },
  }),
  transitionSpec: {
    open: { animation: 'timing' as const, config: { duration: 0 } },
    close: { animation: 'timing' as const, config: { duration: eventSharedMotion.fadeMs } },
  },
};
