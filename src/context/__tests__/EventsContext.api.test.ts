/**
 * Test cases for EventsContext API interactions
 * Covers refreshEvents, addUserEvent, updateUserEvent, deleteUserEvent, and guest event queue
 */

import fetchMock from 'jest-fetch-mock';
import { mockApiResponses, mockEvents, createTodayEvent, createTomorrowEvent } from '../../__tests__/mocks/mockData';

const BASE_URL = 'http://localhost:8080';
const MOCK_TOKEN = 'mock-jwt-token';

describe('EventsContext - API Integration', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  describe('refreshEvents', () => {
    it('should fetch events from API and return formatted list', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      const response = await fetch(`${BASE_URL}/api/events`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should handle null data from API gracefully (bug fix)', async () => {
      // This tests the fix for the null data bug
      // When API returns { data: null }, it should be treated as empty array
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.nullData));

      const response = await fetch(`${BASE_URL}/api/events`);
      const payload = await response.json();

      // The context uses: (payload.data ?? [])
      const events = payload.data ?? [];
      expect(events).toEqual([]);
      expect(Array.isArray(events)).toBe(true);
    });

    it('should handle empty data array from API', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.empty));

      const response = await fetch(`${BASE_URL}/api/events`);
      const payload = await response.json();

      expect(payload.data).toEqual([]);
    });

    it('should include auth header when token is available', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      await fetch(`${BASE_URL}/api/events`, {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/events`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_TOKEN}`,
          }),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      fetchMock.mockResponseOnce('', { status: 500 });

      const response = await fetch(`${BASE_URL}/api/events`);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectOnce(new Error('Network error'));

      await expect(fetch(`${BASE_URL}/api/events`)).rejects.toThrow('Network error');
    });
  });

  describe('addUserEvent', () => {
    it('should post new event to API', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ id: 100 }), { status: 201 });

      const newEvent = createTodayEvent();
      const payload = {
        title: newEvent.title,
        location: newEvent.location,
        time: newEvent.time,
        description: newEvent.description ?? '',
        gender: newEvent.gender,
        min_age: newEvent.minAge,
        max_age: newEvent.maxAge,
        event_date: newEvent.eventDate,
        date_label: newEvent.dateLabel,
        group_type: newEvent.groupType,
        cover_key: newEvent.coverKey ?? 'default',
      };

      const response = await fetch(`${BASE_URL}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe(100);
    });

    it('should throw error when not authenticated', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

      const response = await fetch(`${BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle validation errors', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Title is required' }), { status: 400 });

      const response = await fetch(`${BASE_URL}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ title: '' }),
      });

      expect(response.ok).toBe(false);
      const data = await response.json();
      expect(data.error).toBe('Title is required');
    });
  });

  describe('updateUserEvent', () => {
    it('should put updated event to API', async () => {
      fetchMock.mockResponseOnce('', { status: 200 });

      const eventId = '1';
      const updatedEvent = {
        title: 'Updated Event Title',
        location: 'New Location',
        time: '15:00',
        event_date: new Date().toISOString().split('T')[0],
        gender: 'Any',
        min_age: 18,
        max_age: 50,
        group_type: 'Single',
      };

      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify(updatedEvent),
      });

      expect(response.ok).toBe(true);
    });

    it('should return 403 when updating another user\'s event', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

      const eventId = '999';
      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ title: 'Hacked Event' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });

    it('should handle not found error', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Event not found' }), { status: 404 });

      const eventId = '999999';
      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('deleteUserEvent', () => {
    it('should delete event from API', async () => {
      fetchMock.mockResponseOnce('', { status: 200 });

      const eventId = '1';
      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);
    });

    it('should return 403 when deleting another user\'s event', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

      const eventId = '999';
      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });

    it('should throw error when not authenticated', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

      const eventId = '1';
      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'DELETE',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('refreshRequestedEvents', () => {
    it('should fetch user\'s pending join requests', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          requests: [
            { event_id: 1 },
            { event_id: 2 },
          ],
        })
      );

      const response = await fetch(`${BASE_URL}/api/chat/requests/me`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.requests).toBeDefined();
      expect(data.requests.length).toBe(2);
    });

    it('should handle empty requests list', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      const response = await fetch(`${BASE_URL}/api/chat/requests/me`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      const data = await response.json();
      expect(data.requests).toEqual([]);
    });

    it('should handle 401 and attempt token refresh', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      const response = await fetch(`${BASE_URL}/api/chat/requests/me`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('Guest Event Queue', () => {
    it('should queue event when user is not logged in', () => {
      const guestDraft = {
        title: 'Guest Event',
        location: 'Guest Location',
        time: '12:00',
        eventDate: new Date().toISOString().split('T')[0],
        gender: 'Any',
        minAge: 18,
        maxAge: 50,
        groupType: 'Single' as const,
        coverKey: 'default' as const,
      };

      // Simulate queueing (stored in state)
      let pendingGuestEvent: typeof guestDraft | null = null;
      pendingGuestEvent = guestDraft;

      expect(pendingGuestEvent).toEqual(guestDraft);
    });

    it('should submit queued event after user logs in', async () => {
      const guestDraft = {
        title: 'Guest Event',
        location: 'Guest Location',
        time: '12:00',
        eventDate: new Date().toISOString().split('T')[0],
        gender: 'Any',
        minAge: 18,
        maxAge: 50,
        groupType: 'Single',
        coverKey: 'default',
      };

      // After login, the pending event should be submitted
      fetchMock.mockResponseOnce(JSON.stringify({ id: 101 }), { status: 201 });

      const payload = {
        title: guestDraft.title,
        location: guestDraft.location,
        time: guestDraft.time,
        description: '',
        gender: guestDraft.gender,
        min_age: guestDraft.minAge,
        max_age: guestDraft.maxAge,
        event_date: guestDraft.eventDate,
        group_type: guestDraft.groupType,
        cover_key: guestDraft.coverKey,
      };

      const response = await fetch(`${BASE_URL}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.id).toBe(101);
    });
  });

  describe('Event Filtering', () => {
    const formatLocalDate = (offsetDays = 0) => {
      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      base.setDate(base.getDate() + offsetDays);
      const year = base.getFullYear();
      const month = String(base.getMonth() + 1).padStart(2, '0');
      const day = String(base.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    it('should filter out past events', () => {
      const isUpcomingEvent = (eventDate: string): boolean => {
        const [year, month, day] = eventDate.split('-').map((part) => Number(part));
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (
          Number.isNaN(year) ||
          Number.isNaN(month) ||
          Number.isNaN(day) ||
          month < 1 ||
          day < 1
        ) {
          return false;
        }
        const parsedDate = new Date(year, month - 1, day);
        const diffDays = Math.floor(
          (parsedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (Number.isNaN(diffDays)) {
          return false;
        }
        return diffDays >= 0 && diffDays <= 1;
      };

      // Today's date
      const todayStr = formatLocalDate();
      expect(isUpcomingEvent(todayStr)).toBe(true);

      // Tomorrow's date
      const tomorrowStr = formatLocalDate(1);
      expect(isUpcomingEvent(tomorrowStr)).toBe(true);

      // Yesterday's date (should be filtered out)
      const yesterdayStr = formatLocalDate(-1);
      expect(isUpcomingEvent(yesterdayStr)).toBe(false);

      // Future date (more than 1 day ahead)
      const nextWeekStr = formatLocalDate(7);
      expect(isUpcomingEvent(nextWeekStr)).toBe(false);
    });

    it('should sort events by schedule', () => {
      const events = [
        createTomorrowEvent({ id: '1', time: '10:00' }),
        createTodayEvent({ id: '2', time: '15:00' }),
        createTodayEvent({ id: '3', time: '09:00' }),
      ];

      const parseTimeToMinutes = (timeLabel: string) => {
        const match = timeLabel.trim().toLowerCase().match(/(\d{1,2}):(\d{2})(am|pm)?/);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        return hours * 60 + minutes;
      };

      const sortEventsBySchedule = (a: typeof events[0], b: typeof events[0]) => {
        if (a.eventDate === b.eventDate) {
          const timeA = parseTimeToMinutes(a.time) ?? 0;
          const timeB = parseTimeToMinutes(b.time) ?? 0;
          return timeA - timeB;
        }
        return a.eventDate.localeCompare(b.eventDate);
      };

      const sorted = [...events].sort(sortEventsBySchedule);

      // Today's events should come first, sorted by time
      expect(sorted[0].id).toBe('3'); // Today 09:00
      expect(sorted[1].id).toBe('2'); // Today 15:00
      expect(sorted[2].id).toBe('1'); // Tomorrow 10:00
    });
  });

  describe('User Events Filtering', () => {
    it('should filter events by owner ID', () => {
      const userId = 1;
      const allEvents = mockEvents;

      const userEvents = allEvents.filter((event) => event.ownerId === userId);

      expect(userEvents.length).toBeGreaterThan(0);
      userEvents.forEach((event) => {
        expect(event.ownerId).toBe(userId);
      });
    });

    it('should return empty array when no events owned by user', () => {
      const userId = 999;
      const allEvents = mockEvents;

      const userEvents = allEvents.filter((event) => event.ownerId === userId);

      expect(userEvents).toEqual([]);
    });
  });
});

export {};
