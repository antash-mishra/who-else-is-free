import {
  AGE_MAX,
  AGE_MIN,
  PLAN_AGE_MAX,
  PLAN_AGE_MIN_GAP,
  PLAN_AGE_SLIDER_MAX,
} from '@constants/eventOptions';
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

/**
 * Most plans target roughly 20-40, so the slider spans AGE_MIN-PLAN_AGE_SLIDER_MAX
 * instead of the full stored range. Ages above the slider's end show at its end
 * stop ("50+"); a saved range is only rewritten once a handle actually moves.
 */
export const toAgeSliderRange = ([min, max]: PlanAgeRange): PlanAgeRange => {
  const sliderMin = Math.min(min, PLAN_AGE_SLIDER_MAX - PLAN_AGE_MIN_GAP);
  return [sliderMin, Math.max(sliderMin + PLAN_AGE_MIN_GAP, Math.min(max, PLAN_AGE_SLIDER_MAX))];
};

/** The slider's end stop means "and older", which is stored as PLAN_AGE_MAX. */
export const fromAgeSliderRange = ([min, max]: PlanAgeRange): PlanAgeRange => [
  min,
  max >= PLAN_AGE_SLIDER_MAX ? PLAN_AGE_MAX : max,
];

export const formatAgeSliderValue = (value: number): string =>
  value >= PLAN_AGE_SLIDER_MAX ? `${PLAN_AGE_SLIDER_MAX}+` : `${value}`;
