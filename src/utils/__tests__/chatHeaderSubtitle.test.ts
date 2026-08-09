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

  it('leads with "1:1" then the accepted count for Single', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Single',
        memberCount: 3,
        schedule: { eventDate },
      }),
    ).toBe('1:1, 3 Accepted');
  });

  it('leads with "Group" then the member count for Group', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: 3,
        schedule: { eventDate },
      }),
    ).toBe('Group, 3 members');
  });

  it('ignores the schedule (no date in the subtitle)', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: 5,
        schedule: { dateLabel: 'Today' },
      }),
    ).toBe('Group, 5 members');

    expect(
      buildEventMemberSubtitle({
        groupType: 'Single',
        memberCount: 2,
        schedule: null,
      }),
    ).toBe('1:1, 2 Accepted');
  });

  it('treats undefined group type as Group', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: undefined,
        memberCount: 2,
        schedule: undefined,
      }),
    ).toBe('Group, 2 members');
  });

  it('handles a zero count', () => {
    expect(
      buildEventMemberSubtitle({
        groupType: 'Group',
        memberCount: 0,
        schedule: { dateLabel: 'Today' },
      }),
    ).toBe('Group, 0 members');
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
