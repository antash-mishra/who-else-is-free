// Hex values in this file are brand/artwork confetti palette data — an allowed exception to the theme-token rule.
import { StyleSheet, View } from 'react-native';

import { CannonConfetti } from 'react-native-fast-confetti';
import { useReducedMotion } from 'react-native-reanimated';

import { motionTiming } from '@theme/motion';

// Fully saturated, so the pieces stay punchy on a white screen. (The previous
// "classic" palette was mostly mid-to-light tints and read as pastel.)
const CONFETTI_COLORS = [
  '#FF1744', // red
  '#FFC400', // amber
  '#00C853', // green
  '#2979FF', // blue
  '#D500F9', // purple
  '#00B8D4', // cyan
  '#FF6D00', // orange
  '#F50057', // pink
];

// Two cannons, one in each bottom corner, firing towards the top centre (the
// library's default target). Rectangles mixed with round dots, flat colour,
// fading out as they settle.
const PIECES_PER_CANNON = 150;
const CANNON_SPEED = 3;
// The library sizes the animation from its physics: pieces fall at a terminal speed
// of gravity x height / drag, so half the default gravity (3) roughly doubles the
// fall and the confetti drifts down instead of dropping out of view.
const CANNON_GRAVITY = 1.5;

type Props = {
  active: boolean;
  /** Called when the last piece has settled, so the owner can unmount the overlay. */
  onFinished?: () => void;
};

/**
 * Celebration cannons (used when a plan is created). react-native-fast-confetti draws
 * every piece in one Skia batch on the UI thread; the previous version animated 50
 * pieces as separate nodes and allocated new objects every frame, which stuttered.
 *
 * Mounts only while active, so a hidden celebration allocates nothing, and shows
 * nothing at all with reduced motion.
 */
const ConfettiOverlay = ({ active, onFinished }: Props) => {
  const reducedMotion = useReducedMotion();
  if (!active || reducedMotion) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="confetti-overlay">
      <CannonConfetti
        autoplay
        fadeOutOnEnd
        gravity={CANNON_GRAVITY}
        flakeStyle="solid"
        colors={CONFETTI_COLORS}
        // Lets the "plan created" toast and the list re-render land first, so the
        // burst does not compete with them for its opening frames.
        autoStartDelay={motionTiming.confettiStartDelayMs}
        // Each cannon keeps firing for this long instead of emptying at once.
        sprayDuration={motionTiming.confettiSprayMs}
        containerStyle={StyleSheet.absoluteFill}
        onAnimationEnd={onFinished}
      >
        {(['bottom-left', 'bottom-right'] as const).map((position) => (
          <CannonConfetti.Origin
            key={position}
            position={position}
            count={PIECES_PER_CANNON}
            initialSpeed={CANNON_SPEED}
          >
            <CannonConfetti.Flake width={8} height={14} radius={2} />
            <CannonConfetti.Flake size={10} radius={5} />
          </CannonConfetti.Origin>
        ))}
      </CannonConfetti>
    </View>
  );
};

export default ConfettiOverlay;
