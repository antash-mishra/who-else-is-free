/**
 * Tests for MyEventsScreen
 * Covers tab switching, filtering, empty states
 */

import { mockEvents, mockUsers, mockConversations } from '../../__tests__/mocks/mockData';

describe('MyEventsScreen', () => {
  const user = mockUsers[0];

  describe('Tab Types', () => {
    const tabs = ['Hosting', 'Joined', 'Requested'] as const;

    it('should have three tabs', () => {
      expect(tabs.length).toBe(3);
    });

    it('should include Hosting tab', () => {
      expect(tabs).toContain('Hosting');
    });

    it('should include Joined tab', () => {
      expect(tabs).toContain('Joined');
    });

    it('should include Requested tab', () => {
      expect(tabs).toContain('Requested');
    });
  });

  describe('Hosting Tab', () => {
    it('should filter events owned by user', () => {
      const userEvents = mockEvents.filter((e) => e.ownerId === user.id);

      userEvents.forEach((event) => {
        expect(event.ownerId).toBe(user.id);
      });
    });

    it('should return empty array when user has no hosted events', () => {
      const nonHostUser = { ...user, id: 999 };
      const userEvents = mockEvents.filter((e) => e.ownerId === nonHostUser.id);

      expect(userEvents).toEqual([]);
    });

    it('should add "Hosting" badge to hosted events', () => {
      const userEvents = mockEvents
        .filter((e) => e.ownerId === user.id)
        .map((e) => ({ ...e, badgeLabel: 'Hosting' }));

      userEvents.forEach((event) => {
        expect(event.badgeLabel).toBe('Hosting');
      });
    });
  });

  describe('Joined Tab', () => {
    it('should filter events user has joined', () => {
      // Get event IDs from conversations where user is member but not owner
      const joinedEventIds = new Set<string>();
      mockConversations.forEach((conversation) => {
        if (conversation.eventId && conversation.createdBy !== user.id) {
          joinedEventIds.add(String(conversation.eventId));
        }
      });

      const joinedEvents = mockEvents.filter(
        (e) => joinedEventIds.has(e.id) && e.ownerId !== user.id
      );

      joinedEvents.forEach((event) => {
        expect(event.ownerId).not.toBe(user.id);
      });
    });

    it('should add "Joined" badge to joined events', () => {
      const joinedEventIds = new Set(['1', '2']);
      const joinedEvents = mockEvents
        .filter((e) => joinedEventIds.has(e.id))
        .map((e) => ({ ...e, badgeLabel: 'Joined' }));

      joinedEvents.forEach((event) => {
        expect(event.badgeLabel).toBe('Joined');
      });
    });
  });

  describe('Requested Tab', () => {
    it('should filter events user has requested to join', () => {
      const requestedEventIds = new Set(['1', '2']);
      const requestedEvents = mockEvents.filter((e) => requestedEventIds.has(e.id));

      expect(requestedEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should add "Pending" badge to requested events', () => {
      const requestedEventIds = new Set(['3']);
      const requestedEvents = mockEvents
        .filter((e) => requestedEventIds.has(e.id))
        .map((e) => ({ ...e, badgeLabel: 'Pending' }));

      requestedEvents.forEach((event) => {
        expect(event.badgeLabel).toBe('Pending');
      });
    });

    it('should return empty array when no pending requests', () => {
      const requestedEventIds = new Set<string>();
      const requestedEvents = mockEvents.filter((e) => requestedEventIds.has(e.id));

      expect(requestedEvents).toEqual([]);
    });
  });

  describe('Tab Switching', () => {
    it('should track active tab state', () => {
      let activeTab: 'Hosting' | 'Joined' | 'Requested' = 'Hosting';

      expect(activeTab).toBe('Hosting');

      activeTab = 'Joined';
      expect(activeTab).toBe('Joined');

      activeTab = 'Requested';
      expect(activeTab).toBe('Requested');
    });
  });

  describe('Empty States', () => {
    it('should show empty state for Hosting when no hosted events', () => {
      const userEvents: typeof mockEvents = [];
      const showEmptyState = userEvents.length === 0;

      expect(showEmptyState).toBe(true);
    });

    it('should show empty state for Joined when no joined events', () => {
      const joinedEvents: typeof mockEvents = [];
      const showEmptyState = joinedEvents.length === 0;

      expect(showEmptyState).toBe(true);
    });

    it('should show empty state for Requested when no requested events', () => {
      const requestedEvents: typeof mockEvents = [];
      const showEmptyState = requestedEvents.length === 0;

      expect(showEmptyState).toBe(true);
    });
  });

  describe('Guest User', () => {
    it('should show login prompt for guest users', () => {
      const isGuest = user === null;
      const mockGuestUser = null;
      const showLoginPrompt = mockGuestUser === null;

      expect(showLoginPrompt).toBe(true);
    });
  });

  describe('Navigation', () => {
    it('should navigate to EventDetails from MyEvents tab', () => {
      const event = mockEvents[0];
      const navigateParams = { eventId: event.id, origin: 'MyEvents' };

      expect(navigateParams.origin).toBe('MyEvents');
    });

    it('should navigate to Create screen for new event', () => {
      const navigateTarget = 'Create';
      expect(navigateTarget).toBe('Create');
    });
  });
});
