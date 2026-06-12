import { CoverCategory, CoverOption, GENERIC_COVER_CATEGORY } from '@constants/covers';

export type CoverSearchArgs = {
  query?: string;
  categoryKey?: string | null;
};

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Search/filter the cover catalog. A selected category shows only that
 * category's covers; a text search appends every Generic cover to the
 * matches (product rule), so the search grid is never empty.
 */
export const searchCovers = (
  covers: readonly CoverOption[],
  categories: readonly CoverCategory[],
  { query, categoryKey }: CoverSearchArgs,
): CoverOption[] => {
  const normalizedQuery = normalize(query ?? '');
  if (!normalizedQuery) {
    if (!categoryKey) {
      return [...covers];
    }
    return covers.filter((coverOption) => coverOption.category === categoryKey);
  }

  const categoryLabels = new Map(
    categories.map((category) => [category.key, normalize(category.label)]),
  );
  const matches = covers.filter((coverOption) => {
    if (coverOption.category === GENERIC_COVER_CATEGORY) {
      return false;
    }
    if (coverOption.tags.some((tag) => normalize(tag).includes(normalizedQuery))) {
      return true;
    }
    const categoryLabel = categoryLabels.get(coverOption.category) ?? '';
    return categoryLabel.includes(normalizedQuery);
  });

  const generic = covers.filter((coverOption) => coverOption.category === GENERIC_COVER_CATEGORY);
  return [...matches, ...generic];
};
