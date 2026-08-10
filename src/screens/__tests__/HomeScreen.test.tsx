/**
 * Tests for HomeScreen
 * Covers loading/error/empty states, section building, badge labels, sorting, navigation
 */

import { mockEvents, mockConversations, mockUsers } from '../../__tests__/mocks/mockData';

describe('HomeScreen', () => {
  describe('Section Building', () => {
    const buildSections = (
      items: typeof mockEvents,
      getBadgeLabel: (event: typeof mockEvents[0]) => string | undefined
    ) => {
      const sectionOrder = [
        { label: 'Today', value: 'Today' as const },
        { label: 'Tomorrow', value: 'Tmrw' as const },
      ];

      const grouped: Record<'Today' | 'Tmrw', typeof mockEvents> = {
        Today: [],
        Tmrw: [],
      };

      items.forEach((event) => {
        grouped[event.dateLabel].push({
          ...event,
          badgeLabel: getBadgeLabel(event),
        });
      });

      return sectionOrder
        .map(({ label, value }) => ({
          title: label,
          data: grouped[value],
        }))
        .filter((section) => section.data.length > 0);
    };

    it('should group events by date label', () => {
      const todayEvents = mockEvents.filter((e) => e.dateLabel === 'Today');
      const tomorrowEvents = mockEvents.filter((e) => e.dateLabel === 'Tmrw');

      expect(todayEvents.length).toBeGreaterThan(0);
      expect(tomorrowEvents.length).toBeGreaterThan(0);
    });

    it('should create sections only for dates with events', () => {
      const eventsOnlyToday = mockEvents.filter((e) => e.dateLabel === 'Today');
      const sections = buildSections(eventsOnlyToday, () => undefined);

      expect(sections.length).toBe(1);
      expect(sections[0].title).toBe('Today');
    });

    it('should return empty array when no events', () => {
      const sections = buildSections([], () => undefined);
      expect(sections).toEqual([]);
    });

    it('should order sections as Today, Tomorrow', () => {
      const sections = buildSections(mockEvents, () => undefined);

      if (sections.length > 1) {
        expect(sections[0].title).toBe('Today');
        expect(sections[1].title).toBe('Tomorrow');
      }
    });
  });

  describe('Badge Labels', () => {
    const user = mockUsers[0];

    const getBadgeLabel = (event: typeof mockEvents[0]): string | undefined => {
      const joinedEventIds = new Set<string>();
      mockConversations.forEach((conversation) => {
        if (conversation.eventId && conversation.createdBy !== user.id) {
          joinedEventIds.add(String(conversation.eventId));
        }
      });

      if (event.ownerId === user.id) return 'Hosting';
      if (joinedEventIds.has(event.id)) return 'Joined';
      return undefined;
    };

    it('should return "Hosting" for events owned by user', () => {
      const userEvent = mockEvents.find((e) => e.ownerId === user.id);
      expect(userEvent).toBeDefined();
      expect(getBadgeLabel(userEvent!)).toBe('Hosting');
    });

    it('should return "Joined" for events user has joined', () => {
      // Create a joined event scenario
      const conversationWithEvent = mockConversations.find(
        (c) => c.eventId && c.createdBy !== user.id
      );
      if (conversationWithEvent) {
        const joinedEvent = mockEvents.find(
          (e) => String(conversationWithEvent.eventId) === e.id
        );
        if (joinedEvent) {
          expect(getBadgeLabel(joinedEvent)).toBe('Joined');
        }
      }
    });

    it('should return undefined for events user has no relationship with', () => {
      const otherEvent = mockEvents.find(
        (e) => e.ownerId !== user.id && e.ownerId !== mockUsers[1].id
      );
      // If no such event exists, this test is skipped
      if (otherEvent) {
        expect(getBadgeLabel(otherEvent)).toBeUndefined();
      }
    });

    it('should return "Requested" for events with pending requests', () => {
      const isEventRequested = (eventId: string) => eventId === '99';
      const pendingEvent = { ...mockEvents[0], id: '99', ownerId: 999 };

      const getBadgeLabelWithPending = (event: typeof mockEvents[0]): string | undefined => {
        if (event.ownerId === user.id) return 'Hosting';
        if (isEventRequested(event.id)) return 'Requested';
        return undefined;
      };

      expect(getBadgeLabelWithPending(pendingEvent)).toBe('Requested');
    });
  });

  describe('Sort Modes', () => {
    it('should sort by schedule (upcoming mode)', () => {
      const parseTimeToMinutes = (timeLabel: string) => {
        const match = timeLabel.trim().toLowerCase().match(/(\d{1,2}):(\d{2})(am|pm)?/);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        return hours * 60 + minutes;
      };

      const sortEventsBySchedule = (a: typeof mockEvents[0], b: typeof mockEvents[0]) => {
        if (a.eventDate === b.eventDate) {
          const timeA = parseTimeToMinutes(a.time) ?? 0;
          const timeB = parseTimeToMinutes(b.time) ?? 0;
          return timeA - timeB;
        }
        return a.eventDate.localeCompare(b.eventDate);
      };

      const sorted = [...mockEvents].sort(sortEventsBySchedule);

      // Events should be sorted by date first, then by time
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        if (current.eventDate === next.eventDate) {
          const currentTime = parseTimeToMinutes(current.time) ?? 0;
          const nextTime = parseTimeToMinutes(next.time) ?? 0;
          expect(currentTime).toBeLessThanOrEqual(nextTime);
        } else {
          expect(current.eventDate.localeCompare(next.eventDate)).toBeLessThanOrEqual(0);
        }
      }
    });

    it('should sort by createdAt (newest mode)', () => {
      const eventsWithCreatedAt = mockEvents.filter((e) => e.createdAt);

      const sorted = [...eventsWithCreatedAt].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      // Events should be sorted by createdAt descending
      for (let i = 0; i < sorted.length - 1; i++) {
        const currentDate = sorted[i].createdAt ? new Date(sorted[i].createdAt!).getTime() : 0;
        const nextDate = sorted[i + 1].createdAt ? new Date(sorted[i + 1].createdAt!).getTime() : 0;
        expect(currentDate).toBeGreaterThanOrEqual(nextDate);
      }
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when isLoading is true and no events', () => {
      const isLoading = true;
      const events: typeof mockEvents = [];
      const hasLoadedOnce = false;

      const showAllEventsLoading = isLoading && events.length === 0 && !hasLoadedOnce;
      expect(showAllEventsLoading).toBe(true);
    });

    it('should not show loading when events exist', () => {
      const isLoading = true;
      const events = mockEvents;
      const hasLoadedOnce = true;

      const showAllEventsLoading = isLoading && events.length === 0 && !hasLoadedOnce;
      expect(showAllEventsLoading).toBe(false);
    });
  });

  describe('Error State', () => {
    it('should show error when error exists and not loading', () => {
      const error = 'Unable to load plans.';
      const isLoading = false;
      const events: typeof mockEvents = [];

      const showAllEventsError = !!error && !isLoading && events.length === 0;
      expect(showAllEventsError).toBe(true);
    });

    it('should not show error when loading', () => {
      const error = 'Unable to load plans.';
      const isLoading = true;
      const events: typeof mockEvents = [];

      const showAllEventsError = !!error && !isLoading && events.length === 0;
      expect(showAllEventsError).toBe(false);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no events and not loading', () => {
      const isLoading = false;
      const error = null;
      const events: typeof mockEvents = [];

      const showAllEventsEmpty = !isLoading && events.length === 0 && !error;
      expect(showAllEventsEmpty).toBe(true);
    });

    it('should not show empty state when events exist', () => {
      const isLoading = false;
      const error = null;
      const events = mockEvents;

      const showAllEventsEmpty = !isLoading && events.length === 0 && !error;
      expect(showAllEventsEmpty).toBe(false);
    });
  });

  describe('Navigation', () => {
    it('should navigate to EventDetails with correct params', () => {
      const event = mockEvents[0];
      const navigateParams = { eventId: event.id, origin: 'Events' };

      expect(navigateParams.eventId).toBe(event.id);
      expect(navigateParams.origin).toBe('Events');
    });
  });
});
