import { seedFromString, seededRand } from '../seededRandom';

describe('seededRand', () => {
  it('returns the same value for the same seed', () => {
    expect(seededRand(7)).toBe(seededRand(7));
  });

  it('returns a value in [0, 1)', () => {
    for (let i = 0; i < 50; i += 1) {
      const value = seededRand(i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('varies across seeds', () => {
    expect(seededRand(1)).not.toBe(seededRand(2));
  });
});

describe('seedFromString', () => {
  it('is stable for the same string', () => {
    expect(seedFromString('event-42')).toBe(seedFromString('event-42'));
  });

  it('differs across strings', () => {
    expect(seedFromString('event-42')).not.toBe(seedFromString('event-43'));
  });
});
