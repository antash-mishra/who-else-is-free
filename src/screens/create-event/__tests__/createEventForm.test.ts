import { DEFAULT_COVER_KEY } from '@constants/covers';

import {
  buildCreateEventPayload,
  buildGuestEventDraft,
  buildUpdateEventPayload,
  createFormStateFromEvent,
  normalizeCreateEventForm,
} from '../createEventForm';

const form = createFormStateFromEvent({
  id: '42',
  title: '  Coffee Meetup  ',
  location: '  Blue Bottle, 1 Market St  ',
  time: '10:15 AM',
  audience: 'All Gender, 18 to 50 years',
  imageUri: 'cover://default',
  dateLabel: 'Today',
  eventDate: '2026-06-15',
  description: '  Bring ideas  ',
  ownerId: 1,
  hostName: 'Asha',
  gender: 'Women',
  minAge: 35,
  maxAge: 21,
  groupType: 'Group',
  coverKey: DEFAULT_COVER_KEY,
  scheduledAt: new Date(2026, 5, 15, 10, 15, 30, 999).toISOString(),
  placeId: 'place-1',
  latitude: 12.97,
  longitude: 77.59,
});

describe('createEventForm', () => {
  it('maps an existing event into editable form state', () => {
    expect(form.eventName).toBe('  Coffee Meetup  ');
    expect(form.description).toBe('  Bring ideas  ');
    expect(form.groupType).toBe('Group');
    expect(form.gender).toBe('Women');
    expect(form.ageRange).toEqual([35, 21]);
    expect(form.selectedDateTime).toEqual(new Date(2026, 5, 15, 10, 15, 30, 999));
    expect(form.placeId).toBe('place-1');
  });

  it('normalizes shared submit fields', () => {
    const normalized = normalizeCreateEventForm(form);

    expect(normalized.title).toBe('Coffee Meetup');
    expect(normalized.location).toBe('Blue Bottle, 1 Market St');
    expect(normalized.description).toBe('Bring ideas');
    expect(normalized.minAge).toBe(21);
    expect(normalized.maxAge).toBe(35);
    expect(normalized.time).toBe('10:15');
    expect(normalized.eventDate).toBe('2026-06-15');
    expect(normalized.scheduledAt).toBe(new Date(2026, 5, 15, 10, 15, 0, 0).toISOString());
  });

  it('builds create payloads with owner fields', () => {
    expect(buildCreateEventPayload(form, { id: 7, name: 'Mina' })).toMatchObject({
      title: 'Coffee Meetup',
      userId: 7,
      hostName: 'Mina',
      badgeLabel: 'Group',
    });
  });

  it('builds update payloads with null badge for single events', () => {
    expect(buildUpdateEventPayload({ ...form, groupType: 'Single' })).toMatchObject({
      title: 'Coffee Meetup',
      badgeLabel: null,
      coverKey: DEFAULT_COVER_KEY,
    });
  });

  it('builds guest drafts without inventing fallback copy', () => {
    const guestForm = {
      ...form,
      eventName: '',
      description: '  Draft description  ',
      location: '',
    };

    expect(buildGuestEventDraft(guestForm)).toMatchObject({
      title: '',
      location: '',
      description: 'Draft description',
    });
  });
});
