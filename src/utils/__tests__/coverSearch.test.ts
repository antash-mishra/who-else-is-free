import { CoverCategory, CoverOption } from '@constants/covers';
import { searchCovers } from '@utils/coverSearch';

const cover = (key: string, category: string, tags: string[]): CoverOption => ({
  key,
  label: tags[0] ?? category,
  fileName: `${key}.png`,
  url: `https://x/${key}.png`,
  source: { uri: `https://x/${key}.png` },
  category,
  tags,
});

const categories: CoverCategory[] = [
  { key: 'sports', label: 'Sports' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'generic', label: 'Generic' },
];

const covers: CoverOption[] = [
  cover('sports-badminton-1', 'sports', ['Badminton']),
  cover('entertainment-concerts-1', 'entertainment', ['Concerts', 'Festivals', 'Party', 'Dancing']),
  cover('generic-1', 'generic', []),
  cover('generic-2', 'generic', []),
];

describe('searchCovers', () => {
  it('returns all covers in catalog order with no query or category', () => {
    const result = searchCovers(covers, categories, {});
    expect(result.map((c) => c.key)).toEqual([
      'sports-badminton-1',
      'entertainment-concerts-1',
      'generic-1',
      'generic-2',
    ]);
  });

  it('matches individual tag segments case-insensitively', () => {
    const result = searchCovers(covers, categories, { query: 'party' });
    expect(result.map((c) => c.key)).toEqual([
      'entertainment-concerts-1',
      'generic-1',
      'generic-2',
    ]);
  });

  it('matches category labels', () => {
    const result = searchCovers(covers, categories, { query: 'sport' });
    expect(result.map((c) => c.key)).toEqual(['sports-badminton-1', 'generic-1', 'generic-2']);
  });

  it('appends generic covers even when nothing matches', () => {
    const result = searchCovers(covers, categories, { query: 'zzz-no-match' });
    expect(result.map((c) => c.key)).toEqual(['generic-1', 'generic-2']);
  });

  it('filters by selected category and appends generic', () => {
    const result = searchCovers(covers, categories, { categoryKey: 'sports' });
    expect(result.map((c) => c.key)).toEqual(['sports-badminton-1', 'generic-1', 'generic-2']);
  });

  it('does not duplicate generic covers', () => {
    const result = searchCovers(covers, categories, { query: 'generic' });
    const genericCount = result.filter((c) => c.key.startsWith('generic')).length;
    expect(genericCount).toBe(2);
  });
});
