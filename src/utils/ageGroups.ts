import { ageOptions } from '@constants/eventOptions';

export type AgeRange = { min: number; max: number };
export const toggleAgeGroup = (ids: readonly string[], id: string): string[] => {
  if (id === 'all') return ['all'];
  const selected = ids.filter((value) => value !== 'all');
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
};
export const getAgeRanges = (
  ids: readonly string[] | undefined,
  fallback: [number, number],
): AgeRange[] => {
  if (!ids) return [{ min: Math.min(...fallback), max: Math.max(...fallback) }];
  const ranges = ageOptions
    .filter((option) => ids.includes(option.id))
    .map(({ min, max }) => ({ min, max }))
    .sort((a, b) => a.min - b.min);
  return ranges.reduce<AgeRange[]>((result, range) => {
    const last = result[result.length - 1];
    if (last && range.min <= last.max + 1) last.max = Math.max(last.max, range.max);
    else result.push({ ...range });
    return result;
  }, []);
};
export const getAgeGroupsLabel = (
  ids: readonly string[] | undefined,
  fallback: [number, number],
): string => {
  if (!ids) return `${fallback[0]}-${fallback[1]}`;
  return ageOptions
    .filter((option) => ids.includes(option.id))
    .map((option) => option.label)
    .join(', ');
};
