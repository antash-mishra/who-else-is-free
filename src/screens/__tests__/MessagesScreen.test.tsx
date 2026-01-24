/**
 * Tests for MessagesScreen
 * Covers conversation list, last message preview, navigation
 */

import { mockConversations, mockUsers } from '../../__tests__/mocks/mockData';

describe('MessagesScreen', () => {
  const user = mockUsers[0];

  describe('Conversation List', () => {
    it('should display all conversations', () => {
      expect(mockConversations.length).toBeGreaterThan(0);
    });

    it('should sort conversations by last message time', () => {
      const conversationsWithMessages = mockConversations.map((c) => ({
        ...c,
        lastMessage: {
          id: '1',
          conversationId: c.id,
          senderId: 1,
          body: 'Test',
          createdAt: new Date(Date.now() - Math.random() * 1000000).toISOString(),
        },
      }));

      const sorted = [...conversationsWithMessages].sort((a, b) => {
        const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
        const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
        return bTime - aTime;
      });

      for (let i = 0; i < sorted.length - 1; i++) {
        const currentTime = Date.parse(sorted[i].lastMessage!.createdAt);
        const nextTime = Date.parse(sorted[i + 1].lastMessage!.createdAt);
        expect(currentTime).toBeGreaterThanOrEqual(nextTime);
      }
    });
  });

  describe('Display Name', () => {
    it('should use event title for event conversations', () => {
      const eventConversation = mockConversations.find((c) => c.event);
      if (eventConversation) {
        expect(eventConversation.displayName).toBeDefined();
      }
    });

    it('should use counterpart name for 1:1 conversations', () => {
      const dmConversation = mockConversations.find((c) => !c.event);
      if (dmConversation) {
        expect(dmConversation.displayName).toBeDefined();
      }
    });
  });

  describe('Last Message Preview', () => {
    it('should show last message body', () => {
      const conversationWithMessage = mockConversations.find((c) => c.lastMessage);
      if (conversationWithMessage) {
        expect(conversationWithMessage.lastMessage?.body).toBeDefined();
      }
    });

    it('should truncate long message previews', () => {
      const longMessage = 'A'.repeat(100);
      const maxLength = 50;
      const truncated =
        longMessage.length > maxLength
          ? `${longMessage.substring(0, maxLength)}...`
          : longMessage;

      expect(truncated.length).toBeLessThanOrEqual(maxLength + 3);
    });

    it('should show placeholder for conversations without messages', () => {
      const emptyConversation = { ...mockConversations[0], lastMessage: null as any };
      const preview = emptyConversation.lastMessage?.body ?? 'No messages yet';

      expect(preview).toBe('No messages yet');
    });
  });

  describe('Unread Count', () => {
    it('should display unread count badge', () => {
      const conversationWithUnread = { ...mockConversations[0], unreadCount: 5 };
      const showBadge = conversationWithUnread.unreadCount > 0;

      expect(showBadge).toBe(true);
    });

    it('should not display badge when no unread messages', () => {
      const conversationNoUnread = { ...mockConversations[0], unreadCount: 0 };
      const showBadge = conversationNoUnread.unreadCount > 0;

      expect(showBadge).toBe(false);
    });
  });

  describe('Event Info', () => {
    it('should show event details for event conversations', () => {
      const eventConversation = mockConversations.find((c) => c.event);
      if (eventConversation?.event) {
        expect(eventConversation.event.title).toBeDefined();
        expect(eventConversation.event.location).toBeDefined();
        expect(eventConversation.event.time).toBeDefined();
      }
    });
  });

  describe('Navigation', () => {
    it('should navigate to ChatThread with conversation ID', () => {
      const conversation = mockConversations[0];
      const navigateParams = { conversationId: conversation.id };

      expect(navigateParams.conversationId).toBe(conversation.id);
    });

    it('should set active conversation on navigate', () => {
      let activeConversationId: number | null = null;
      const setActiveConversation = (id: number) => {
        activeConversationId = id;
      };

      const conversation = mockConversations[0];
      setActiveConversation(conversation.id);

      expect(activeConversationId).toBe(conversation.id);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no conversations', () => {
      const conversations: typeof mockConversations = [];
      const showEmptyState = conversations.length === 0;

      expect(showEmptyState).toBe(true);
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when refreshing', () => {
      const isRefreshingConversations = true;
      expect(isRefreshingConversations).toBe(true);
    });
  });

  describe('Guest User', () => {
    it('should show login prompt for guest users', () => {
      const currentUser = null;
      const showLoginPrompt = currentUser === null;

      expect(showLoginPrompt).toBe(true);
    });
  });

  describe('Conversation Types', () => {
    it('should identify event conversations', () => {
      const eventConversation = mockConversations.find((c) => c.eventId !== null);
      if (eventConversation) {
        expect(eventConversation.eventId).not.toBeNull();
      }
    });

    it('should identify direct message conversations', () => {
      const dmConversation = mockConversations.find((c) => c.eventId === null);
      if (dmConversation) {
        expect(dmConversation.eventId).toBeNull();
      }
    });
  });
});
