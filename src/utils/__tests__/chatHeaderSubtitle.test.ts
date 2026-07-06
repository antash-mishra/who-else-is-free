import { buildEventMemberSubtitle, buildOneToOneSubtitle } from '../chatHeaderSubtitle';

const todayKey = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
};

const absoluteFor = (eventDate: string) => {
  const parsed = new Date(`${eventDate}T00:00:00`);
  const day = `${parsed.getDate()}`.padStart(2, '0');
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  const weekday = parsed.toLocaleString('en-US', { weekday: 'short' });
  return `${day} ${month} ${weekday}`;
};

describe('buildEventMemberSubtitle', () => {
  const eventDate = todayKey();
  const absoluteLabel = absoluteFor(eventDate);

  it('uses "People" wording for Single group type', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Single',
        memberCount: 3,
        schedule: { eventDate },
      }),
    ).toBe(`3 People, ${absoluteLabel}`);
  });

  it('uses "Members" wording for Group group type', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: 3,
        schedule: { eventDate },
      }),
    ).toBe(`3 Members, ${absoluteLabel}`);
  });

  it('falls back to the legacy dateLabel when no eventDate is present', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: 5,
        schedule: { dateLabel: 'Today' },
      }),
    ).toBe('5 Members, Today');
  });

  it('returns only the count part when no schedule is available', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Single',
        memberCount: 2,
        schedule: null,
      }),
    ).toBe('2 People');

    expect(
      buildEventMemberSubtitle({
        groupType: undefined,
        memberCount: 2,
        schedule: undefined,
      }),
    ).toBe('2 Members');
  });

  it('handles a zero count', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: 0,
        schedule: { dateLabel: 'Today' },
      }),
    ).toBe('0 Members, Today');
  });
});

describe('buildOneToOneSubtitle', () => {
  const eventDate = todayKey();
  const absoluteLabel = absoluteFor(eventDate);

  it('formats as "One to one, <date>"', () => {
    expect(
      buildOneToOneSubtitle({
        schedule: { eventDate },
      }),
    ).toBe(`One to one, ${absoluteLabel}`);
  });

  it('falls back to dateLabel when no eventDate', () => {
    expect(
      buildOneToOneSubtitle({
        schedule: { dateLabel: 'Today' },
      }),
    ).toBe('One to one, Today');
  });

  it('returns just "One to one" when no schedule', () => {
    expect(buildOneToOneSubtitle({ schedule: null })).toBe('One to one');
    expect(buildOneToOneSubtitle({ schedule: undefined })).toBe('One to one');
  });
});
