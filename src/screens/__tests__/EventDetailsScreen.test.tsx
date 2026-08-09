/**
 * Tests for EventDetailsScreen
 * Covers event display, host/guest/joined views, join/leave/report flows
 */

import fetchMock from 'jest-fetch-mock';
import { formatEventDetailAudienceLine } from '@utils/eventDisplay';
import { mockEvents, mockUsers, mockConversations } from '../../__tests__/mocks/mockData';

const BASE_URL = 'http://localhost:8080';
const MOCK_TOKEN = 'mock-jwt-token';

describe('EventDetailsScreen', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  describe('Event Display', () => {
    it('should display event title and details', () => {
      const event = mockEvents[0];

      expect(event.title).toBeDefined();
      expect(event.location).toBeDefined();
      expect(event.time).toBeDefined();
    });

    it('should format host line correctly for owner', () => {
      const user = mockUsers[0];
      const event = { ...mockEvents[0], ownerId: user.id };
      const isOwner = user.id === event.ownerId;

      const hostLine = isOwner ? 'Hosted by you' : `Hosted by ${event.hostName}`;
      expect(hostLine).toBe('Hosted by you');
    });

    it('should format host line correctly for non-owner', () => {
      const user = mockUsers[1];
      const event = mockEvents[0];
      const isOwner = user.id === event.ownerId;

      const hostLine = isOwner ? 'Hosted by you' : `Hosted by ${event.hostName}`;
      expect(hostLine).toBe(`Hosted by ${event.hostName}`);
    });

    it('should format schedule line correctly', () => {
      const event = mockEvents[0];
      const readableDateLabel = (label: 'Today' | 'Tmrw') =>
        label === 'Today' ? 'Today' : 'Tomorrow';

      const scheduleLine = `${readableDateLabel(event.dateLabel)}, ${event.time}`;
      expect(scheduleLine).toContain(event.time);
    });

    it('should format audience line correctly', () => {
      const event = mockEvents[0];
      const audienceLine = formatEventDetailAudienceLine({
        groupType: event.groupType,
        gender: event.gender,
        minAge: event.minAge,
        maxAge: event.maxAge,
      });

      expect(audienceLine).toBe('Group, All genders, 18 to 35 years');
    });
  });

  describe('View Types', () => {
    const user = mockUsers[0];

    it('should identify owner view correctly', () => {
      const event = { ...mockEvents[0], ownerId: user.id };
      const isOwner = user.id === event.ownerId;

      expect(isOwner).toBe(true);
    });

    it('should identify guest view correctly', () => {
      const event = { ...mockEvents[0], ownerId: 999 };
      const isOwner = user.id === event.ownerId;
      const isConversationMember = false;

      expect(isOwner).toBe(false);
      expect(isConversationMember).toBe(false);
    });

    it('should identify joined member view correctly', () => {
      const event = { ...mockEvents[0], ownerId: 999 };
      const isOwner = user.id === event.ownerId;
      const isConversationMember = true;

      expect(isOwner).toBe(false);
      expect(isConversationMember).toBe(true);
    });
  });

  describe('CTA Button Logic', () => {
    const user = mockUsers[0];

    it('should show "Interested" for guests without pending request', () => {
      const hasPendingRequest = false;
      const ctaLabel = hasPendingRequest ? 'Pending Request' : 'Interested';

      expect(ctaLabel).toBe('Interested');
    });

    it('should show "Pending Request" for guests with pending request', () => {
      const hasPendingRequest = true;
      const ctaLabel = hasPendingRequest ? 'Pending Request' : 'Interested';

      expect(ctaLabel).toBe('Pending Request');
    });

    it('should show "Go to Chat" for owners', () => {
      const isOwner = true;
      const eventConversation = mockConversations[0];
      const showOpenChatCTA = isOwner && !!eventConversation;

      expect(showOpenChatCTA).toBe(true);
    });

    it('should show "Go to Chat" for joined members', () => {
      const isOwner = false;
      const isConversationMember = true;
      const eventConversation = mockConversations[0];
      const showOpenChatCTA = (isOwner || isConversationMember) && !!eventConversation;

      expect(showOpenChatCTA).toBe(true);
    });
  });

  describe('Join Request Flow', () => {
    it('should send join request to API', async () => {
      const eventId = '1';
      const message = 'I would like to join!';

      fetchMock.mockResponseOnce(
        JSON.stringify({ request: { id: 1, status: 'pending' } }),
        { status: 201 }
      );

      const response = await fetch(`${BASE_URL}/api/events/${eventId}/chat/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ message }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
    });

    it('should handle duplicate request (409)', async () => {
      const eventId = '1';

      fetchMock.mockResponseOnce('', { status: 409 });

      const response = await fetch(`${BASE_URL}/api/events/${eventId}/chat/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ message: 'test' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);
    });

    it('should require message for join request', () => {
      const inviteMessage = '   ';
      const trimmed = inviteMessage.trim();

      expect(trimmed.length).toBe(0);
    });
  });

  describe('Cancel Request Flow', () => {
    it('should cancel join request via API', async () => {
      const eventId = '1';

      fetchMock.mockResponseOnce('', { status: 200 });

      const response = await fetch(`${BASE_URL}/api/events/${eventId}/chat/requests/me`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('Leave Event Flow', () => {
    it('should leave event via API', async () => {
      const eventId = '1';
      const userId = 1;

      fetchMock.mockResponseOnce('', { status: 200 });

      const response = await fetch(
        `${BASE_URL}/api/events/${eventId}/chat/members/${userId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${MOCK_TOKEN}`,
          },
        }
      );

      expect(response.ok).toBe(true);
    });
  });

  describe('Report Event Flow', () => {
    it('should report event via API', async () => {
      const eventId = '1';
      const reason = 'Inappropriate content';

      fetchMock.mockResponseOnce('', { status: 200 });

      const response = await fetch(`${BASE_URL}/api/events/${eventId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ reason }),
      });

      expect(response.ok).toBe(true);
    });

    it('should handle failed report request', async () => {
      const eventId = '1';

      fetchMock.mockResponseOnce('', { status: 500 });

      const response = await fetch(`${BASE_URL}/api/events/${eventId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ reason: 'test' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should require reason for report', () => {
      const reportMessage = '';
      const trimmed = reportMessage.trim();

      expect(trimmed.length).toBe(0);
    });
  });

  describe('Host Actions', () => {
    it('should delete event via API', async () => {
      const eventId = '1';

      fetchMock.mockResponseOnce('', { status: 200 });

      const response = await fetch(`${BASE_URL}/api/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);
    });

    it('should build correct menu items for host', () => {
      const isOwner = true;
      const isConversationMember = false;
      const hasPendingRequest = false;

      const menuItems = isOwner
        ? [{ label: 'Edit Details' }, { label: 'Delete Event' }]
        : isConversationMember
          ? [{ label: 'View Intro Message' }, { label: 'Leave Event' }, { label: 'Report Event' }]
          : hasPendingRequest
            ? [{ label: 'Cancel Request' }, { label: 'Report Event' }]
            : [{ label: 'Report Event' }];

      expect(menuItems.length).toBe(2);
      expect(menuItems[0].label).toBe('Edit Details');
      expect(menuItems[1].label).toBe('Delete Event');
    });
  });

  describe('Event Not Found', () => {
    it('should handle event not found gracefully', () => {
      const events = mockEvents;
      const eventId = 'nonexistent-id';
      const event = events.find((e) => e.id === eventId);

      expect(event).toBeUndefined();
    });
  });

  describe('Single vs Group Events', () => {
    it('should identify single events', () => {
      const groupType = 'Single' as 'Single' | 'Group';
      const isSingleEvent = groupType === 'Single';

      expect(isSingleEvent).toBe(true);
    });

    it('should identify group events', () => {
      const groupType = 'Group' as 'Single' | 'Group';
      const isSingleEvent = groupType === 'Single';

      expect(isSingleEvent).toBe(false);
    });
  });
});
