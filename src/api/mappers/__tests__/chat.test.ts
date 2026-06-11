import {
  normalizeConversation,
  normalizeConversationEvent,
  normalizeJoinRequest,
  normalizeParticipant,
  RawConversation,
} from '@api/mappers/chat';
import { getScheduleDisplay } from '@utils/dateTime';

describe('normalizeParticipant', () => {
  it('maps a well-formed participant', () => {
    expect(
      normalizeParticipant({ id: 3, name: 'Ava', avatar: 'https://example.com/a.png' }),
    ).toEqual({
      id: 3,
      name: 'Ava',
      avatar: 'https://example.com/a.png',
    });
  });

  it('supports snake_case payload variants', () => {
    expect(
      normalizeParticipant({ id: 4, full_name: 'Ben Lee', avatar_url: 'https://e.com/b.png' }),
    ).toEqual({
      id: 4,
      name: 'Ben Lee',
      avatar: 'https://e.com/b.png',
    });
  });

  it('supports camelCase avatarUrl', () => {
    expect(normalizeParticipant({ id: 5, name: 'Cy', avatarUrl: 'https://e.com/c.png' })).toEqual({
      id: 5,
      name: 'Cy',
      avatar: 'https://e.com/c.png',
    });
  });

  it('falls back to defaults for empty or missing payloads', () => {
    expect(normalizeParticipant(undefined, 9)).toEqual({ id: 9, name: '', avatar: undefined });
    expect(normalizeParticipant(null)).toEqual({ id: 0, name: '', avatar: undefined });
    expect(normalizeParticipant({})).toEqual({ id: 0, name: '', avatar: undefined });
  });
});

describe('normalizeJoinRequest', () => {
  it('maps camelCase payloads', () => {
    const result = normalizeJoinRequest({
      id: 1,
      eventId: 10,
      userId: 20,
      message: 'Can I join?',
      status: 'approved',
      createdAt: '2026-06-10T12:00:00Z',
      requester: { id: 20, name: 'Dana' },
      conversationId: 30,
    });

    expect(result).toEqual({
      id: 1,
      eventId: 10,
      userId: 20,
      message: 'Can I join?',
      status: 'approved',
      createdAt: '2026-06-10T12:00:00Z',
      requester: { id: 20, name: 'Dana', avatar: undefined },
      conversationId: 30,
    });
  });

  it('maps snake_case payloads', () => {
    const result = normalizeJoinRequest({
      id: 2,
      event_id: 11,
      user_id: 21,
      message: 'Hello',
      status: 'denied',
      created_at: '2026-06-09T08:00:00Z',
      conversation_id: 31,
    });

    expect(result.eventId).toBe(11);
    expect(result.userId).toBe(21);
    expect(result.status).toBe('denied');
    expect(result.createdAt).toBe('2026-06-09T08:00:00Z');
    expect(result.conversationId).toBe(31);
  });

  it('applies defaults for an empty payload', () => {
    const result = normalizeJoinRequest({ id: 3, user_id: 22 });

    expect(result.eventId).toBe(0);
    expect(result.message).toBe('');
    expect(result.status).toBe('pending');
    expect(typeof result.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
    // Missing requester falls back to the request user id.
    expect(result.requester).toEqual({ id: 22, name: '', avatar: undefined });
    expect(result.conversationId).toBeUndefined();
  });
});

describe('normalizeConversation', () => {
  const rawEvent = {
    id: 100,
    user_id: 1,
    title: 'Padel Night',
    location: 'Club 21',
    time: '19:00',
    date_label: 'Tomorrow',
    event_date: '2026-06-12',
    group_type: 'Group',
    cover_key: 'badminton',
    scheduled_at: '2026-06-12T19:00:00Z',
  };

  const baseConversation: RawConversation = {
    id: 50,
    created_by: 1,
    title: null,
    member_ids: [1, 2],
    participants: [
      { id: 1, name: 'Host' },
      { id: 2, name: 'Guest' },
    ],
  };

  it('normalizes an event conversation with schedule display fields', () => {
    const schedule = getScheduleDisplay({
      scheduledAt: rawEvent.scheduled_at,
      eventDate: rawEvent.event_date,
      time: rawEvent.time,
      dateLabel: rawEvent.date_label,
    });

    const result = normalizeConversation(
      {
        ...baseConversation,
        last_message: {
          id: 7,
          sender_id: 2,
          body: 'See you there',
          created_at: '2026-06-11T10:00:00Z',
        },
        unread_count: 3,
        event: rawEvent,
      },
      1,
    );

    expect(result).toEqual({
      id: 50,
      createdBy: 1,
      title: null,
      memberIds: [1, 2],
      participants: [
        { id: 1, name: 'Host', avatar: undefined },
        { id: 2, name: 'Guest', avatar: undefined },
      ],
      displayName: 'Padel Night',
      lastMessage: {
        id: '7',
        conversationId: 50,
        senderId: 2,
        body: 'See you there',
        createdAt: '2026-06-11T10:00:00Z',
      },
      unreadCount: 3,
      eventId: 100,
      event: {
        id: 100,
        userId: 1,
        title: 'Padel Night',
        location: 'Club 21',
        time: schedule.displayTime,
        dateLabel: schedule.displayLabel,
        eventDate: schedule.displayDate,
        groupType: 'Group',
        coverKey: 'badminton',
        scheduledAt: '2026-06-12T19:00:00Z',
      },
    });
  });

  it('uses the counterpart name for 1:1 conversations', () => {
    const result = normalizeConversation(baseConversation, 1);

    expect(result.displayName).toBe('Guest');
    expect(result.eventId).toBeNull();
    expect(result.event).toBeUndefined();
    expect(result.lastMessage).toBeUndefined();
    expect(result.unreadCount).toBe(0);
  });

  it('falls back to the title and then a generic name for empty payloads', () => {
    const titled = normalizeConversation(
      { id: 51, created_by: 1, title: 'Weekend plans', member_ids: [1], participants: [] },
      1,
    );
    expect(titled.displayName).toBe('Weekend plans');

    const empty = normalizeConversation(
      { id: 52, created_by: 1, member_ids: [1], participants: [] },
      1,
    );
    expect(empty.displayName).toBe('Conversation');
    expect(empty.participants).toEqual([]);
    expect(empty.title).toBeNull();
  });
});

describe('normalizeConversationEvent', () => {
  it('passes through identity fields and derives schedule display values', () => {
    const raw = {
      id: 1,
      user_id: 2,
      title: 'Tennis',
      location: 'Court A',
      time: '18:00',
      date_label: 'Today',
      event_date: '2026-06-11',
    };
    const schedule = getScheduleDisplay({
      scheduledAt: undefined,
      eventDate: raw.event_date,
      time: raw.time,
      dateLabel: raw.date_label,
    });

    expect(normalizeConversationEvent(raw)).toEqual({
      id: 1,
      userId: 2,
      title: 'Tennis',
      location: 'Court A',
      time: schedule.displayTime,
      dateLabel: schedule.displayLabel,
      eventDate: schedule.displayDate,
      groupType: undefined,
      coverKey: undefined,
      scheduledAt: undefined,
    });
  });
});
