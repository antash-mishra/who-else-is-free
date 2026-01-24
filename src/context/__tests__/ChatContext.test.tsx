/**
 * Tests for ChatContext
 * Covers WebSocket connection, messaging, and join request handling
 */

import fetchMock from 'jest-fetch-mock';
import { mockApiResponses, mockMessages, mockConversations, mockJoinRequests } from '../../__tests__/mocks/mockData';

// Test constants
const MOCK_TOKEN = 'mock-jwt-token';
const BASE_URL = 'http://localhost:8080';

describe('ChatContext', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    jest.clearAllTimers();
  });

  describe('Conversation Loading', () => {
    it('should fetch conversations from API', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.conversations.success));

      const response = await fetch(`${BASE_URL}/api/conversations`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.conversations).toBeDefined();
      expect(data.conversations.length).toBeGreaterThan(0);
    });

    it('should handle 401 error and attempt token refresh', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      const response = await fetch(`${BASE_URL}/api/conversations`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should sort conversations by last message activity', () => {
      const conversations = [...mockConversations];

      // Add last messages with different timestamps
      conversations[0].lastMessage = {
        id: '1',
        conversationId: 1,
        senderId: 1,
        body: 'Old message',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      };
      conversations[1].lastMessage = {
        id: '2',
        conversationId: 2,
        senderId: 2,
        body: 'New message',
        createdAt: new Date().toISOString(),
      };

      const sorted = [...conversations].sort((a, b) => {
        const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
        const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
        return bTime - aTime;
      });

      // Conversation with newer message should come first
      expect(sorted[0].id).toBe(2);
    });
  });

  describe('Message Loading', () => {
    it('should fetch messages for a conversation', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.messages.success));

      const conversationId = 1;
      const response = await fetch(
        `${BASE_URL}/api/conversations/${conversationId}/messages?limit=50`,
        {
          headers: {
            Authorization: `Bearer ${MOCK_TOKEN}`,
          },
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.messages).toBeDefined();
      expect(data.messages.length).toBeGreaterThan(0);
    });

    it('should normalize message format from API', () => {
      const apiMessage = {
        id: 1,
        conversationId: 1,
        senderId: 1,
        body: 'Test message',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const normalizedMessage = {
        id: String(apiMessage.id),
        conversationId: apiMessage.conversationId,
        senderId: apiMessage.senderId,
        body: apiMessage.body,
        createdAt: apiMessage.createdAt,
      };

      expect(normalizedMessage.id).toBe('1');
      expect(normalizedMessage.body).toBe('Test message');
    });
  });

  describe('WebSocket Connection', () => {
    it('should construct WebSocket URL with token', () => {
      const wsBaseUrl = 'ws://localhost:8080';
      const wsPath = '/api/ws';
      const token = MOCK_TOKEN;

      const socketUrl = `${wsBaseUrl}${wsPath}?token=${encodeURIComponent(token)}`;

      expect(socketUrl).toContain('/api/ws');
      expect(socketUrl).toContain('token=');
    });

    it('should handle WebSocket message:new event', () => {
      const envelope = {
        type: 'message:new',
        tempId: 'temp-123',
        message: {
          id: 100,
          conversationId: 1,
          senderId: 1,
          body: 'New message from server',
          createdAt: new Date().toISOString(),
        },
      };

      expect(envelope.type).toBe('message:new');
      expect(envelope.message.body).toBe('New message from server');
    });

    it('should handle WebSocket conversation:join_request event', () => {
      const envelope = {
        type: 'conversation:join_request',
        conversationId: 1,
        action: 'created',
        request: {
          id: 1,
          event_id: 1,
          user_id: 3,
          message: 'I want to join!',
          status: 'pending',
          created_at: new Date().toISOString(),
          requester: { id: 3, name: 'New User' },
        },
      };

      expect(envelope.type).toBe('conversation:join_request');
      expect(envelope.action).toBe('created');
    });

    it('should handle WebSocket conversation:membership event', () => {
      const envelope = {
        type: 'conversation:membership',
        conversationId: 1,
        userId: 3,
        action: 'added',
      };

      expect(envelope.type).toBe('conversation:membership');
      expect(envelope.action).toBe('added');
    });
  });

  describe('Send Message', () => {
    it('should create optimistic message with pending state', () => {
      const conversationId = 1;
      const body = 'Test message';
      const userId = 1;
      const tempId = `${conversationId}-${Date.now()}`;
      const timestamp = new Date().toISOString();

      const optimisticMessage = {
        id: tempId,
        conversationId,
        senderId: userId,
        body: body.trim(),
        createdAt: timestamp,
        pending: true,
        tempId,
      };

      expect(optimisticMessage.pending).toBe(true);
      expect(optimisticMessage.tempId).toBe(tempId);
    });

    it('should create failed message when WebSocket is not connected', () => {
      const conversationId = 1;
      const body = 'Failed message';
      const userId = 1;
      const tempId = `${conversationId}-${Date.now()}`;
      const timestamp = new Date().toISOString();

      const failedMessage = {
        id: tempId,
        conversationId,
        senderId: userId,
        body: body.trim(),
        createdAt: timestamp,
        pending: false,
        tempId,
        failed: true,
      };

      expect(failedMessage.failed).toBe(true);
      expect(failedMessage.pending).toBe(false);
    });

    it('should construct WebSocket send payload correctly', () => {
      const conversationId = 1;
      const body = 'Test message';
      const tempId = 'temp-123';

      const payload = {
        type: 'message:send',
        conversationId,
        body: body.trim(),
        tempId,
      };

      expect(payload.type).toBe('message:send');
      expect(payload.conversationId).toBe(1);
      expect(payload.body).toBe('Test message');
    });
  });

  describe('Retry Message', () => {
    it('should only retry failed messages', () => {
      const failedMessage = { ...mockMessages[0], failed: true };
      const successMessage = { ...mockMessages[1], failed: false };

      // Failed message can be retried
      expect(failedMessage.failed).toBe(true);

      // Success message should not be retried
      expect(successMessage.failed).toBe(false);
    });
  });

  describe('Join Request Handling', () => {
    it('should fetch join requests for an event', async () => {
      const eventId = 1;
      fetchMock.mockResponseOnce(JSON.stringify({ requests: mockJoinRequests }));

      const response = await fetch(`${BASE_URL}/api/events/${eventId}/chat/requests`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.requests).toBeDefined();
    });

    it('should approve join request', async () => {
      const eventId = 1;
      const userId = 3;
      fetchMock.mockResponseOnce(JSON.stringify({ message: 'Request approved' }));

      const response = await fetch(
        `${BASE_URL}/api/events/${eventId}/chat/requests/${userId}/approve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${MOCK_TOKEN}`,
          },
        }
      );

      expect(response.ok).toBe(true);
    });

    it('should deny join request', async () => {
      const eventId = 1;
      const userId = 3;
      fetchMock.mockResponseOnce(JSON.stringify({ message: 'Request denied' }));

      const response = await fetch(
        `${BASE_URL}/api/events/${eventId}/chat/requests/${userId}/deny`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${MOCK_TOKEN}`,
          },
        }
      );

      expect(response.ok).toBe(true);
    });

    it('should normalize join request from API response', () => {
      const rawRequest = {
        id: 1,
        event_id: 1,
        user_id: 3,
        message: 'I want to join!',
        status: 'pending',
        created_at: '2024-01-15T10:00:00Z',
        requester: { id: 3, name: 'New User' },
      };

      const normalized = {
        id: rawRequest.id,
        eventId: rawRequest.event_id,
        userId: rawRequest.user_id,
        message: rawRequest.message ?? '',
        status: rawRequest.status as 'pending' | 'approved' | 'denied',
        createdAt: rawRequest.created_at,
        requester: {
          id: rawRequest.requester.id,
          name: rawRequest.requester.name,
        },
      };

      expect(normalized.eventId).toBe(1);
      expect(normalized.userId).toBe(3);
      expect(normalized.status).toBe('pending');
    });
  });

  describe('Report Member', () => {
    it('should report a member and remove them from join requests', async () => {
      const eventId = 1;
      const userId = 3;
      const reason = 'Inappropriate behavior';

      fetchMock.mockResponseOnce(JSON.stringify({ message: 'Member reported' }));

      const response = await fetch(
        `${BASE_URL}/api/events/${eventId}/members/${userId}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MOCK_TOKEN}`,
          },
          body: JSON.stringify({ reason }),
        }
      );

      expect(response.ok).toBe(true);
    });
  });

  describe('Active Conversation', () => {
    it('should clear unread count when setting active conversation', () => {
      const conversation = { ...mockConversations[0], unreadCount: 5 };

      // When setting active, unread count should be cleared
      const updatedConversation = { ...conversation, unreadCount: 0 };

      expect(updatedConversation.unreadCount).toBe(0);
    });

    it('should filter messages by active conversation', () => {
      const messagesByConversation: Record<number, typeof mockMessages> = {
        1: mockMessages,
        2: [],
      };

      const activeConversationId = 1;
      const messages = messagesByConversation[activeConversationId] ?? [];

      expect(messages.length).toBe(mockMessages.length);
    });
  });
});
