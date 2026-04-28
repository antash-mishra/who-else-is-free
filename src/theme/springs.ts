// Named spring presets — single source of truth for all animation feel.
// snappy:   overdamped — fast nav/dismiss transitions, no bounce
// press:    slightly underdamped — scale press-release, page snap-back
// bouncyUp: near-critical — sheet/badge slide-in, alive but no overshoot
// elegant:  clearly underdamped — nav/sheet entries, tab icon bounce
export const Springs = {
  snappy:   { mass: 0.3, stiffness: 600, damping: 40 },
  press:    { mass: 0.3, stiffness: 300, damping: 15 },
  bouncyUp: { mass: 1, stiffness: 817, damping: 50 },
  elegant:  { mass: 0.2, stiffness: 26.7, damping: 4.1 },
} as const;

// Shared timing durations — used where spring adds no value (opacity fades).
export const durations = {
  outgoingFade: 140,
} as const;
