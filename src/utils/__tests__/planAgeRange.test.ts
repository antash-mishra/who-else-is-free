import {
  formatEventCardMetaLine,
  formatEventDetailAudienceLine,
  formatRangeAgeLabel,
} from '../eventDisplay';
import {
  ageSelectionNeedsReplacement,
  formatAgeSliderValue,
  fromAgeSliderRange,
  getAgePickerDraft,
  isValidPlanAgeRange,
  toAgeSliderRange,
} from '../planAgeRange';

it('formats numeric values and full bounds consistently across surfaces', () => {
  for (const range of [
    [18, 99],
    [24, 99],
    [20, 60],
    [40, 45],
  ] as [number, number][]) {
    const label = formatRangeAgeLabel(range);
    const input = {
      ageSelectionMode: 'range' as const,
      minAge: range[0],
      maxAge: range[1],
      groupType: 'Group',
      gender: 'Any',
    };
    expect(formatEventCardMetaLine(input)).toContain(label);
    expect(formatEventDetailAudienceLine(input)).toContain(label);
  }
  expect(formatRangeAgeLabel([18, 60])).toBe('18 - 60');
  expect(formatRangeAgeLabel([24, 99])).toBe('24+');
  expect(formatRangeAgeLabel([18, 99])).toBe('All ages');
});
it('maps stored ranges onto the 18-50+ slider and back', () => {
  expect(toAgeSliderRange([18, 99])).toEqual([18, 50]);
  expect(toAgeSliderRange([24, 35])).toEqual([24, 35]);
  expect(toAgeSliderRange([35, 80])).toEqual([35, 50]);
  expect(toAgeSliderRange([60, 99])).toEqual([45, 50]);
  expect(fromAgeSliderRange([24, 50])).toEqual([24, 99]);
  expect(fromAgeSliderRange([24, 49])).toEqual([24, 49]);
  expect(formatAgeSliderValue(49)).toBe('49');
  expect(formatAgeSliderValue(50)).toBe('50+');
});
it('enforces integer bounds and a five-year gap', () => {
  expect(isValidPlanAgeRange([40, 45])).toBe(true);
  for (const range of [
    [40, 44],
    [17, 99],
    [18, 100],
    [24.5, 60],
    [60, 20],
  ] as [number, number][])
    expect(isValidPlanAgeRange(range)).toBe(false);
});
it('preserves bounded range mode and flags historical selections needing replacement', () => {
  expect(getAgePickerDraft([18, 60], 'range')).toEqual([18, 60]);
  expect(getAgePickerDraft([18, 60])).toEqual([18, 99]);
  expect(ageSelectionNeedsReplacement([20, 60], ['20-25', '40+'])).toBe(true);
  expect(ageSelectionNeedsReplacement([40, 44])).toBe(true);
  expect(ageSelectionNeedsReplacement([18, 60], ['all'])).toBe(false);
});
