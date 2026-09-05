/**
 * Deterministic pseudo-random helpers shared by the confetti engine and the
 * scrapbook motion primitives. Determinism matters for motion: a card must get
 * the same tilt on every render, or it jitters on re-render and list recycling.
 */

/** Deterministic value in [0, 1) for a numeric seed. */
export const seededRand = (seed: number): number => {
  'worklet';
  const x = Math.sin(seed + 1) * 39482.3741;
  return x - Math.floor(x);
};

/** Stable numeric seed for a string id (djb2). */
export const seedFromString = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash % 100000);
};
