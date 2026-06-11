import { ApiEvent, mapApiEventToUserEvent } from '@api/mappers/events';
import { resolveCoverUri } from '@constants/covers';
import { getScheduleDisplay } from '@utils/dateTime';
import { formatAudienceLabel } from '@utils/eventDisplay';

const buildApiEvent = (overrides: Partial<ApiEvent> = {}): ApiEvent => ({
  id: 42,
  title: 'Morning Run',
  location: 'Central Park',
  time: '07:30',
  description: 'Easy 5k loop',
  gender: 'Any',
  min_age: 21,
  max_age: 35,
  date_label: 'Today',
  event_date: '2026-06-11',
  group_type: 'Single',
  user_id: 7,
  host_name: 'Ava',
  host_avatar: 'https://example.com/avatar.png',
  cover_key: 'badminton',
  scheduled_at: '2026-06-11T07:30:00Z',
  created_at: '2026-06-01T10:00:00Z',
  place_id: 'place-123',
  latitude: 40.78,
  longitude: -73.96,
  ...overrides,
});

describe('mapApiEventToUserEvent', () => {
  it('maps a well-formed snake_case payload to a UserEvent', () => {
    const apiEvent = buildApiEvent();
    const schedule = getScheduleDisplay({
      scheduledAt: apiEvent.scheduled_at,
      eventDate: apiEvent.event_date,
      time: apiEvent.time,
      dateLabel: apiEvent.date_label,
    });

    const result = mapApiEventToUserEvent(apiEvent, 'Run club');

    expect(result).toEqual({
      id: '42',
      title: 'Morning Run',
      location: 'Central Park',
      time: schedule.displayTime,
      audience: formatAudienceLabel({ gender: 'Any', minAge: 21, maxAge: 35 }),
      imageUri: resolveCoverUri('badminton'),
      badgeLabel: 'Run club',
      dateLabel: schedule.displayLabel,
      eventDate: schedule.displayDate,
      description: 'Easy 5k loop',
      ownerId: 7,
      hostName: 'Ava',
      hostAvatar: 'https://example.com/avatar.png',
      gender: 'Any',
      minAge: 21,
      maxAge: 35,
      groupType: 'Single',
      coverKey: 'badminton',
      scheduledAt: '2026-06-11T07:30:00Z',
      createdAt: '2026-06-01T10:00:00Z',
      placeId: 'place-123',
      latitude: 40.78,
      longitude: -73.96,
    });
  });

  it('forces the Group badge for group events', () => {
    const result = mapApiEventToUserEvent(buildApiEvent({ group_type: 'Group' }), 'Custom badge');

    expect(result.groupType).toBe('Group');
    expect(result.badgeLabel).toBe('Group');
  });

  it('applies defaults when optional fields are missing', () => {
    const result = mapApiEventToUserEvent(
      buildApiEvent({
        description: undefined,
        group_type: undefined,
        host_avatar: null,
        cover_key: undefined,
        scheduled_at: undefined,
        created_at: undefined,
        place_id: undefined,
        latitude: undefined,
        longitude: undefined,
      }),
    );

    expect(result.groupType).toBe('Single');
    expect(result.badgeLabel).toBeUndefined();
    expect(result.hostAvatar).toBeUndefined();
    expect(result.coverKey).toBeNull();
    expect(result.imageUri).toBe(resolveCoverUri(undefined));
    expect(result.scheduledAt).toBeUndefined();
    expect(result.createdAt).toBeUndefined();
    expect(result.placeId).toBeUndefined();
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
  });

  it('stringifies the numeric event id', () => {
    expect(mapApiEventToUserEvent(buildApiEvent({ id: 9001 })).id).toBe('9001');
  });
});
