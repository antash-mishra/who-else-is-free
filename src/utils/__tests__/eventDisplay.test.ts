import {
  formatAudienceLabel,
  formatCompactAgeLabel,
  formatEventCardMetaLine,
  formatEventDetailAudienceLine,
  formatEventLocationName,
  formatEventListSectionHeaderLabel,
} from '../eventDisplay';

describe('eventDisplay', () => {
  describe('formatEventListSectionHeaderLabel', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0, 0);

    it('returns Today for same-day events', () => {
      expect(formatEventListSectionHeaderLabel('2026-01-15', now)).toBe('Today');
    });

    it('returns Tomorrow for next-day events', () => {
      expect(formatEventListSectionHeaderLabel('2026-01-16', now)).toBe('Tomorrow');
    });

    it('formats other dates as DD Mon, ddd', () => {
      expect(formatEventListSectionHeaderLabel('2026-01-17', now)).toBe('17 Jan, Sat');
    });

    it('preserves raw value for invalid dates', () => {
      expect(formatEventListSectionHeaderLabel('not-a-date', now)).toBe('not-a-date');
    });
  });

  describe('formatAudienceLabel', () => {
    it('uses All genders for open-gender events', () => {
      expect(formatAudienceLabel({ gender: 'Any', minAge: 18, maxAge: 35 })).toBe(
        'All genders · 18 to 35 years',
      );
    });

    it('uses All ages for the canonical full age range', () => {
      expect(formatAudienceLabel({ gender: 'Female', minAge: 18, maxAge: 60 })).toBe(
        'Female · All ages',
      );
    });

    it('formats a single-year audience range', () => {
      expect(formatAudienceLabel({ gender: 'Male', minAge: 30, maxAge: 30 })).toBe(
        'Male · 30 years',
      );
    });
  });

  describe('formatCompactAgeLabel', () => {
    it('returns a compact range', () => {
      expect(formatCompactAgeLabel(30, 40)).toBe('30-40');
    });

    it('returns a single number for single-year ranges', () => {
      expect(formatCompactAgeLabel(30, 30)).toBe('30');
    });

    it('hides the canonical all-age range', () => {
      expect(formatCompactAgeLabel(18, 60)).toBeNull();
    });
  });

  describe('formatEventCardMetaLine', () => {
    it('shows only the event type when gender and age are open', () => {
      expect(
        formatEventCardMetaLine({
          groupType: 'Group',
          gender: 'Any',
          minAge: 18,
          maxAge: 60,
        }),
      ).toBe('Group');
    });

    it('shows 1:1, Female for gender-specific all-age events', () => {
      expect(
        formatEventCardMetaLine({
          groupType: 'Single',
          gender: 'Female',
          minAge: 18,
          maxAge: 60,
        }),
      ).toBe('1:1 · Female');
    });

    it('shows Group, 30-40 for age-specific open-gender events', () => {
      expect(
        formatEventCardMetaLine({
          groupType: 'Group',
          gender: 'Any',
          minAge: 30,
          maxAge: 40,
        }),
      ).toBe('Group · 30-40');
    });

    it('shows 1:1, Male, 30-40 when both filters are specific', () => {
      expect(
        formatEventCardMetaLine({
          groupType: 'Single',
          gender: 'Male',
          minAge: 30,
          maxAge: 40,
        }),
      ).toBe('1:1 · Male · 30-40');
    });
  });

  describe('formatEventDetailAudienceLine', () => {
    it('uses verbose labels on detail surfaces', () => {
      expect(
        formatEventDetailAudienceLine({
          groupType: 'Group',
          gender: 'Any',
          minAge: 18,
          maxAge: 60,
        }),
      ).toBe('Group · All genders · All ages');
    });
  });

  describe('formatEventLocationName', () => {
    it('returns the place name from a full saved location', () => {
      expect(formatEventLocationName('Temple Bar, Dublin, Ireland')).toBe('Temple Bar');
    });

    it('preserves locations without address separators', () => {
      expect(formatEventLocationName('Central Park')).toBe('Central Park');
    });

    it('returns an empty string for blank locations', () => {
      expect(formatEventLocationName('   ')).toBe('');
    });
  });
});
