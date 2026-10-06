import { AGE_MAX, AGE_MIN, PLAN_AGE_MAX, PLAN_AGE_MIN_GAP } from '@constants/eventOptions';
import { getAgeRanges } from '@utils/ageGroups';

export type PlanAgeRange = [number, number];

export const isValidPlanAgeRange = ([min, max]: PlanAgeRange): boolean =>
  Number.isInteger(min) &&
  Number.isInteger(max) &&
  min >= AGE_MIN &&
  max <= PLAN_AGE_MAX &&
  max - min >= PLAN_AGE_MIN_GAP;

export const getAgePickerDraft = (
  range: PlanAgeRange,
  mode?: 'range',
  ids?: string[],
): PlanAgeRange => {
  if (
    mode !== 'range' &&
    (ids?.includes('all') || (range[0] === AGE_MIN && range[1] === AGE_MAX))
  ) {
    return [AGE_MIN, PLAN_AGE_MAX];
  }
  const min = Math.max(AGE_MIN, Math.min(PLAN_AGE_MAX - PLAN_AGE_MIN_GAP, range[0]));
  return [min, Math.min(PLAN_AGE_MAX, Math.max(min + PLAN_AGE_MIN_GAP, range[1]))];
};

export const ageSelectionNeedsReplacement = (range: PlanAgeRange, ids?: string[]): boolean => {
  if (ids?.includes('all')) return false;
  return !isValidPlanAgeRange(range) || getAgeRanges(ids, range).length > 1;
};
