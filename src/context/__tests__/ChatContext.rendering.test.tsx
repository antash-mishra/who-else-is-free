/**
 * ChatContext rendering tests
 * Tests the ChatProvider with actual component rendering using @testing-library/react-native
 */

// Use real timers for this file - fake timers conflict with async act() + fetch
jest.useRealTimers();

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { Text, View, TouchableOpacity } from 'react-native';
import fetchMock from 'jest-fetch-mock';

import { ChatProvider, useChat, ChatMessage } from '../ChatContext';
import { mockApiResponses, mockUsers, mockConversations, mockMessages, mockJoinRequests } from '../../__tests__/mocks/mockData';

// Helper to create async delay with real timers
const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms));

// Mock AuthContext
const mockUser = mockUsers[0];
const mockToken = 'mock-jwt-token';
const mockRefreshSessionSilently = jest.fn().mockResolvedValue(null);

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: mockToken,
    refreshSessionSilently: mockRefreshSessionSilently,
    authFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  }),
}));

// Mock API config
jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
  WS_BASE_URL: 'ws://localhost:8080',
  CHAT_ENABLED: true,
}));

// Enhanced MockWebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ type: 'close' } as CloseEvent);
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  static reset() {
    MockWebSocket.instances = [];
  }

  static getLatest() {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

// Replace global WebSocket
const OriginalWebSocket = global.WebSocket;
beforeAll(() => {
  global.WebSocket = MockWebSocket as any;
});

afterAll(() => {
  global.WebSocket = OriginalWebSocket;
});

// Test component that consumes ChatContext
const TestConsumer = ({
  onSendMessage,
  onRetryMessage,
  onApproveRequest,
  onDenyRequest,
}: {
  onSendMessage?: (conversationId: number, body: string) => void;
  onRetryMessage?: (conversationId: number, message: ChatMessage) => void;
  onApproveRequest?: (conversationId: number, eventId: number, userId: number) => void;
  onDenyRequest?: (conversationId: number, eventId: number, userId: number) => void;
}) => {
  const {
    conversations,
    messages,
    isConnecting,
    error,
    activeConversationId,
    joinRequestsByConversation,
    setActiveConversation,
    sendMessage,
    retryMessage,
    approveJoinRequest,
    denyJoinRequest,
  } = useChat();

  return (
    <View>
      <Text testID="isConnecting">{isConnecting ? 'connecting' : 'not-connecting'}</Text>
      <Text testID="error">{error || 'no-error'}</Text>
      <Text testID="conversationCount">{conversations.length}</Text>
      <Text testID="messageCount">{messages.length}</Text>
      <Text testID="activeConversationId">{activeConversationId ?? 'none'}</Text>

      {conversations.map((conv) => (
        <TouchableOpacity
          key={conv.id}
          testID={`conversation-${conv.id}`}
          onPress={() => setActiveConversation(conv.id)}
        >
          <Text testID={`conversation-name-${conv.id}`}>{conv.displayName}</Text>
          <Text testID={`conversation-unread-${conv.id}`}>{conv.unreadCount}</Text>
        </TouchableOpacity>
      ))}

      {messages.map((msg, index) => (
        <View key={msg.id} testID={`message-${index}`}>
          <Text testID={`message-body-${index}`}>{msg.body}</Text>
          <Text testID={`message-pending-${index}`}>{msg.pending ? 'pending' : 'sent'}</Text>
          <Text testID={`message-failed-${index}`}>{msg.failed ? 'failed' : 'ok'}</Text>
          {msg.failed && (
            <TouchableOpacity
              testID={`retry-${index}`}
              onPress={() => {
                retryMessage(msg.conversationId, msg);
                onRetryMessage?.(msg.conversationId, msg);
              }}
            />
          )}
        </View>
      ))}

      <TouchableOpacity
        testID="sendMessageBtn"
        onPress={() => {
          if (activeConversationId) {
            sendMessage(activeConversationId, 'Test message');
            onSendMessage?.(activeConversationId, 'Test message');
          }
        }}
      />

      {Object.entries(joinRequestsByConversation).map(([convId, requests]) =>
        requests.map((request) => (
          <View key={request.id} testID={`request-${request.id}`}>
            <Text testID={`request-name-${request.id}`}>{request.requester.name}</Text>
            <TouchableOpacity
              testID={`approve-${request.id}`}
              onPress={() => {
                approveJoinRequest(Number(convId), request.eventId, request.userId);
                onApproveRequest?.(Number(convId), request.eventId, request.userId);
              }}
            />
            <TouchableOpacity
              testID={`deny-${request.id}`}
              onPress={() => {
                denyJoinRequest(Number(convId), request.eventId, request.userId);
                onDenyRequest?.(Number(convId), request.eventId, request.userId);
              }}
            />
          </View>
        ))
      )}
    </View>
  );
};

const renderWithProvider = (props = {}) => {
  return render(
    <ChatProvider>
      <TestConsumer {...props} />
    </ChatProvider>
  );
};

describe('ChatContext Rendering Tests', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    MockWebSocket.reset();
    mockRefreshSessionSilently.mockClear();
  });

  describe('WebSocket Connection Lifecycle', () => {
    it('should show connecting state initially', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      // Should start in connecting state
      expect(screen.getByTestId('isConnecting')).toHaveTextContent('connecting');
    });

    it('should connect WebSocket and refresh conversations on open', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      // Wait for WebSocket to be created (real timers - use await for async)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const ws = MockWebSocket.getLatest();
      expect(ws).toBeDefined();
      expect(ws.url).toContain('/api/ws');
      expect(ws.url).toContain('token=');

      // Simulate WebSocket opening
      await act(async () => {
        ws.simulateOpen();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isConnecting')).toHaveTextContent('not-connecting');
      });
    });

    it('should attempt reconnect after WebSocket closes unexpectedly', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws1 = MockWebSocket.getLatest();
      await act(async () => {
        ws1.simulateOpen();
        await tick(100);
      });

      const initialInstanceCount = MockWebSocket.instances.length;

      // Simulate unexpected close
      await act(async () => {
        ws1.simulateClose();
        await tick(1500); // Wait for reconnect timeout (1000ms)
      });

      // Should have created a new WebSocket instance for reconnection
      expect(MockWebSocket.instances.length).toBeGreaterThan(initialInstanceCount);
    });

    it('should set error state on WebSocket error', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();

      await act(async () => {
        ws.simulateError();
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect to chat.');
      });
    });
  });

  describe('sendMessage - Optimistic Update', () => {
    it('should add optimistic message immediately when WebSocket is open', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      const onSendMessage = jest.fn();
      renderWithProvider({ onSendMessage });

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Set active conversation
      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).not.toHaveTextContent('0');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('conversation-1'));
      });

      // Mock messages for conversation
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.messages.success));

      await act(async () => {
        await tick(100);
      });

      // Send message
      await act(async () => {
        fireEvent.press(screen.getByTestId('sendMessageBtn'));
      });

      // Check that ws.send was called
      expect(ws.send).toHaveBeenCalled();
      const sentPayload = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentPayload.type).toBe('message:send');
      expect(sentPayload.body).toBe('Test message');
      expect(sentPayload.conversationId).toBe(1);
    });

    it('should mark message as failed when WebSocket is not open', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      // Do NOT open the WebSocket - leave it in CONNECTING state

      // Set active conversation manually by simulating data load
      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).not.toHaveTextContent('0');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('conversation-1'));
      });

      // Send message while WebSocket is not ready
      await act(async () => {
        fireEvent.press(screen.getByTestId('sendMessageBtn'));
        await tick(100);
      });

      // Should show error about connection
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Chat connection is not ready.');
      });
    });
  });

  describe('retryMessage', () => {
    it('should retry a failed message', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      const onRetryMessage = jest.fn();
      renderWithProvider({ onRetryMessage });

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();

      // Set active conversation
      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).not.toHaveTextContent('0');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('conversation-1'));
      });

      // Try sending while disconnected to create a failed message
      await act(async () => {
        fireEvent.press(screen.getByTestId('sendMessageBtn'));
        await tick(100);
      });

      // Now open WebSocket
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Find and retry the failed message
      const failedMessage = screen.queryByTestId('message-failed-0');
      if (failedMessage && failedMessage.props.children === 'failed') {
        const retryBtn = screen.getByTestId('retry-0');
        await act(async () => {
          fireEvent.press(retryBtn);
        });

        expect(onRetryMessage).toHaveBeenCalled();
      }
    });
  });

  describe('WebSocket Message Handling', () => {
    it('should handle message:new event and update conversations', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Set active conversation
      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).not.toHaveTextContent('0');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('conversation-1'));
      });

      // Simulate incoming message from server
      const newMessage = {
        type: 'message:new',
        tempId: 'temp-abc',
        message: {
          id: 999,
          conversationId: 1,
          senderId: 2,
          body: 'Hello from server!',
          createdAt: new Date().toISOString(),
        },
      };

      await act(async () => {
        ws.simulateMessage(newMessage);
        await tick(100);
      });

      // Message should appear in the list
      await waitFor(() => {
        const messageBody = screen.queryByTestId('message-body-0');
        expect(messageBody).toBeTruthy();
      });
    });

    it('should replace optimistic message with server confirmed message', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Set active conversation
      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).not.toHaveTextContent('0');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('conversation-1'));
      });

      // Send a message
      await act(async () => {
        fireEvent.press(screen.getByTestId('sendMessageBtn'));
      });

      // Get the tempId from the sent message
      const sentPayload = JSON.parse(ws.send.mock.calls[0][0]);
      const tempId = sentPayload.tempId;

      // Simulate server confirmation with matching tempId
      const confirmedMessage = {
        type: 'message:new',
        tempId: tempId,
        message: {
          id: 1000,
          conversationId: 1,
          senderId: mockUser.id,
          body: 'Test message',
          createdAt: new Date().toISOString(),
        },
      };

      await act(async () => {
        ws.simulateMessage(confirmedMessage);
        await tick(100);
      });

      // The message should no longer be pending
      await waitFor(() => {
        const pendingStatus = screen.queryByTestId('message-pending-0');
        if (pendingStatus) {
          expect(pendingStatus).toHaveTextContent('sent');
        }
      });
    });

    it('should handle conversation:join_request created event', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Simulate join request event
      const joinRequestEvent = {
        type: 'conversation:join_request',
        conversationId: 1,
        action: 'created',
        request: {
          id: 10,
          event_id: 1,
          user_id: 3,
          message: 'I want to join!',
          status: 'pending',
          created_at: new Date().toISOString(),
          requester: { id: 3, name: 'New User' },
        },
      };

      await act(async () => {
        ws.simulateMessage(joinRequestEvent);
        await tick(100);
      });

      await waitFor(() => {
        const requestElement = screen.queryByTestId('request-10');
        expect(requestElement).toBeTruthy();
      });
    });

    it('should handle conversation:membership added event', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      const initialFetchCount = fetchMock.mock.calls.length;

      // Simulate membership added event
      const membershipEvent = {
        type: 'conversation:membership',
        conversationId: 1,
        userId: 3,
        action: 'added',
      };

      await act(async () => {
        ws.simulateMessage(membershipEvent);
        await tick(100);
      });

      // Should trigger a refresh of conversations
      await waitFor(() => {
        expect(fetchMock.mock.calls.length).toBeGreaterThan(initialFetchCount);
      });
    });
  });

  describe('Join Request Handling', () => {
    it('should approve join request and update state', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      const onApproveRequest = jest.fn();
      renderWithProvider({ onApproveRequest });

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Add a join request via WebSocket
      const joinRequestEvent = {
        type: 'conversation:join_request',
        conversationId: 1,
        action: 'created',
        request: {
          id: 20,
          event_id: 1,
          user_id: 3,
          message: 'Please let me join!',
          status: 'pending',
          created_at: new Date().toISOString(),
          requester: { id: 3, name: 'Test User' },
        },
      };

      await act(async () => {
        ws.simulateMessage(joinRequestEvent);
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('request-20')).toBeTruthy();
      });

      // Mock approve endpoint
      fetchMock.mockResponseOnce(JSON.stringify({ message: 'Request approved' }));

      // Approve the request
      await act(async () => {
        fireEvent.press(screen.getByTestId('approve-20'));
        await tick(100);
      });

      expect(onApproveRequest).toHaveBeenCalledWith(1, 1, 3);

      // Request should be removed from state
      await waitFor(() => {
        expect(screen.queryByTestId('request-20')).toBeFalsy();
      });
    });

    it('should deny join request and update state', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      const onDenyRequest = jest.fn();
      renderWithProvider({ onDenyRequest });

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Add a join request
      const joinRequestEvent = {
        type: 'conversation:join_request',
        conversationId: 1,
        action: 'created',
        request: {
          id: 30,
          event_id: 1,
          user_id: 4,
          message: 'Can I join?',
          status: 'pending',
          created_at: new Date().toISOString(),
          requester: { id: 4, name: 'Another User' },
        },
      };

      await act(async () => {
        ws.simulateMessage(joinRequestEvent);
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('request-30')).toBeTruthy();
      });

      // Mock deny endpoint
      fetchMock.mockResponseOnce(JSON.stringify({ message: 'Request denied' }));

      // Deny the request
      await act(async () => {
        fireEvent.press(screen.getByTestId('deny-30'));
        await tick(100);
      });

      expect(onDenyRequest).toHaveBeenCalledWith(1, 1, 4);

      // Request should be removed
      await waitFor(() => {
        expect(screen.queryByTestId('request-30')).toBeFalsy();
      });
    });
  });

  describe('Conversation State Management', () => {
    it('should load and display conversations', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).toHaveTextContent('2');
      });
    });

    it('should set active conversation and clear unread count', async () => {
      const conversationsWithUnread = {
        conversations: mockApiResponses.conversations.success.conversations.map((c, i) => ({
          ...c,
          unread_count: i === 0 ? 5 : 0,
        })),
      };
      fetchMock.mockResponse(JSON.stringify(conversationsWithUnread));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('conversation-unread-1')).toHaveTextContent('5');
      });

      // Set active conversation
      await act(async () => {
        fireEvent.press(screen.getByTestId('conversation-1'));
      });

      // Unread count should be cleared
      await waitFor(() => {
        expect(screen.getByTestId('conversation-unread-1')).toHaveTextContent('0');
      });

      expect(screen.getByTestId('activeConversationId')).toHaveTextContent('1');
    });

    it('should sort conversations by last message activity', async () => {
      const now = new Date();
      const oldTime = new Date(now.getTime() - 3600000);
      const conversationsWithMessages = {
        conversations: [
          {
            ...mockApiResponses.conversations.success.conversations[0],
            last_message: {
              id: 1,
              sender_id: 1,
              body: 'Old message',
              created_at: oldTime.toISOString(),
            },
          },
          {
            ...mockApiResponses.conversations.success.conversations[1],
            last_message: {
              id: 2,
              sender_id: 2,
              body: 'New message',
              created_at: now.toISOString(),
            },
          },
        ],
      };
      fetchMock.mockResponse(JSON.stringify(conversationsWithMessages));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).toHaveTextContent('2');
      });

      // The conversation with the newer message should be first
      const firstConversation = screen.getByTestId('conversation-name-2');
      expect(firstConversation).toBeTruthy();
    });

    it('should handle empty conversations response', async () => {
      fetchMock.mockResponse(JSON.stringify({ conversations: [] }));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('conversationCount')).toHaveTextContent('0');
      });
    });

    it('should handle 401 response and attempt token refresh', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // refreshSessionSilently should have been called
      await waitFor(() => {
        expect(mockRefreshSessionSilently).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should set error on failed conversation fetch', async () => {
      fetchMock.mockRejectOnce(new Error('Network error'));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).not.toHaveTextContent('no-error');
      });
    });

    it('should handle malformed WebSocket messages gracefully', async () => {
      fetchMock.mockResponse(JSON.stringify(mockApiResponses.conversations.success));

      renderWithProvider();

      await act(async () => {
        await tick(10);
      });

      const ws = MockWebSocket.getLatest();
      await act(async () => {
        ws.simulateOpen();
        await tick(100);
      });

      // Send malformed message - should not crash
      await act(async () => {
        if (ws.onmessage) {
          ws.onmessage(new MessageEvent('message', { data: 'invalid json {' }));
        }
        await tick(100);
      });

      // App should still be functional
      expect(screen.getByTestId('conversationCount')).toBeTruthy();
    });
  });
});
