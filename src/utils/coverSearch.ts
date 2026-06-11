import { CoverCategory, CoverOption, GENERIC_COVER_CATEGORY } from '@constants/covers';

export type CoverSearchArgs = {
  query?: string;
  categoryKey?: string | null;
};

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Search/filter the cover catalog. Generic covers are appended to every
 * result set (product rule), so the grid is never empty.
 */
export const searchCovers = (
  covers: readonly CoverOption[],
  categories: readonly CoverCategory[],
  { query, categoryKey }: CoverSearchArgs,
): CoverOption[] => {
  const normalizedQuery = normalize(query ?? '');
  if (!normalizedQuery && !categoryKey) {
    return [...covers];
  }

  const categoryLabels = new Map(
    categories.map((category) => [category.key, normalize(category.label)]),
  );

  let matches: CoverOption[];
  if (normalizedQuery) {
    matches = covers.filter((coverOption) => {
      if (coverOption.category === GENERIC_COVER_CATEGORY) {
        return false;
      }
      if (coverOption.tags.some((tag) => normalize(tag).includes(normalizedQuery))) {
        return true;
      }
      const categoryLabel = categoryLabels.get(coverOption.category) ?? '';
      return categoryLabel.includes(normalizedQuery);
    });
  } else {
    matches = covers.filter((coverOption) => coverOption.category === categoryKey);
  }

  const seen = new Set(matches.map((coverOption) => coverOption.key));
  const generic = covers.filter(
    (coverOption) => coverOption.category === GENERIC_COVER_CATEGORY && !seen.has(coverOption.key),
  );
  return [...matches, ...generic];
};
