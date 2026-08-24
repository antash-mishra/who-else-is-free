import {
  buildEventItemSections,
  buildEventSections,
  buildSingleEventSection,
  sortEventsByCreatedAtDesc,
  toEventCardItem,
} from '../eventListSections';

const baseEvent = {
  id: '1',
  title: 'Coffee Meetup',
  location: 'Central Park, NYC',
  time: '10:00 AM',
  audience: 'All Gender, 18 to 50 years',
  imageUri: 'cover://default',
  eventDate: '2099-01-15',
  createdAt: '2026-01-01T00:00:00.000Z',
  groupType: 'Group',
  gender: 'Any',
  minAge: 25,
  maxAge: 35,
};

describe('eventListSections', () => {
  it('maps events to EventCard items with compact metadata', () => {
    expect(toEventCardItem(baseEvent, 'Hosting')).toEqual({
      id: '1',
      title: 'Coffee Meetup',
      location: 'Central Park, NYC',
      time: '10:00 AM',
      audience: 'All Gender, 18 to 50 years',
      metaLine: 'Group · 25-35',
      imageUri: 'cover://default',
      badgeLabel: 'Hosting',
    });
  });

  it('builds date sections in ascending order', () => {
    const sections = buildEventSections(
      [
        { ...baseEvent, id: '2', eventDate: '2099-01-16' },
        { ...baseEvent, id: '1', eventDate: '2099-01-15' },
      ],
      () => undefined,
      { titleForDate: (eventDate) => eventDate },
    );

    expect(sections.map((section) => section.title)).toEqual(['2099-01-15', '2099-01-16']);
    expect(sections[0].data[0].id).toBe('1');
  });

  it('skips events without a section date', () => {
    const sections = buildEventSections([{ ...baseEvent, eventDate: '' }]);

    expect(sections).toEqual([]);
  });

  it('builds a single section when items exist', () => {
    const sections = buildSingleEventSection('Newest', [baseEvent], () => 'Pending');

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Newest');
    expect(sections[0].data[0].badgeLabel).toBe('Pending');
  });

  it('sorts events by createdAt descending with missing dates last', () => {
    const sorted = [
      { createdAt: '2026-01-02T00:00:00.000Z' },
      { createdAt: null },
      { createdAt: '2026-01-03T00:00:00.000Z' },
    ].sort(sortEventsByCreatedAtDesc);

    expect(sorted.map((event) => event.createdAt)).toEqual([
      '2026-01-03T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      null,
    ]);
  });

  it('builds already mapped item sections with custom descending labels', () => {
    const sections = buildEventItemSections(
      [
        { ...toEventCardItem(baseEvent), eventDate: '2099-01-15' },
        { ...toEventCardItem({ ...baseEvent, id: '2' }), eventDate: '2099-01-16' },
      ],
      { sortDirection: 'desc', titleForDate: (eventDate) => `Past ${eventDate}` },
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Past 2099-01-16',
      'Past 2099-01-15',
    ]);
  });
});
