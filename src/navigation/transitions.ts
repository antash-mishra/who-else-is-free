import { Platform } from 'react-native';

import { CardStyleInterpolators, type StackCardInterpolationProps } from '@react-navigation/stack';

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

// Keep the stack back swipe in a left-side zone (about a quarter of a phone
// screen, wide enough to find with a thumb) so drags elsewhere belong to the
// page ScrollView. Inside the host Requests/Members pager the tabs keep
// priority; see HostRequestTabs. The stack pan only activates rightward
// because of patches/@react-navigation+stack+*.patch.
export const EVENT_DETAILS_BACK_EDGE_WIDTH = 100;

export const eventDetailsScreenOptions = {
  gestureEnabled: true,
  gestureDirection: 'horizontal' as const,
  gestureResponseDistance: EVENT_DETAILS_BACK_EDGE_WIDTH,
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
