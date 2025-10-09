import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { API_BASE_URL, CHAT_ENABLED, WS_BASE_URL } from '@api/config';
import { useAuth } from '@context/AuthContext';

type ConversationParticipant = {
  id: number;
  name: string;
};

type ConversationLastMessage = {
  id: number;
  sender_id: number;
  body: string;
  created_at: string;
};

export type ChatConversation = {
  id: number;
  title?: string | null;
  memberIds: number[];
  participants: ConversationParticipant[];
  displayName: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
  pending?: boolean;
  tempId?: string;
  failed?: boolean;
};

interface ChatContextValue {
  conversations: ChatConversation[];
  activeConversationId: number | null;
  isConnecting: boolean;
  error: string | null;
  messages: ChatMessage[];
  setActiveConversation: (conversationId: number | null) => void;
  refreshConversations: () => Promise<void>;
  sendMessage: (conversationId: number, body: string) => void;
  retryMessage: (conversationId: number, message: ChatMessage) => void;
  isRefreshingConversations: boolean;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const WS_PATH = '/api/ws';

const sortConversationsByActivity = (items: ChatConversation[]) => {
  return [...items].sort((a, b) => {
    const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
    const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
    return bTime - aTime;
  });
};

type ServerEnvelope = {
  type: string;
  tempId?: string;
  message?: {
    id: number;
    conversationId: number;
    senderId: number;
    body: string;
    createdAt: string;
  };
};

type ConversationsResponse = {
  conversations: Array<{
    id: number;
    title?: string | null;
    member_ids: number[];
    participants: ConversationParticipant[];
    last_message?: ConversationLastMessage;
    unread_count?: number;
  }>;
};

type MessagesResponse = {
  messages: Array<{
    id: number;
    conversationId: number;
    senderId: number;
    body: string;
    createdAt: string;
  }>;
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user, token } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, ChatMessage[]>>({});
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const mapServerMessage = useCallback((payload: ServerEnvelope['message']): ChatMessage | null => {
    if (!payload) {
      return null;
    }
    return {
      id: String(payload.id),
      conversationId: payload.conversationId,
      senderId: payload.senderId,
      body: payload.body,
      createdAt: payload.createdAt
    };
  }, []);

  useEffect(() => {
    if (!user || !token) {
      setConversations([]);
      setMessagesByConversation({});
      setActiveConversationId(null);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    }
  }, [token, user]);

  const authHeaders = useMemo(() => {
    if (!token) {
      return undefined;
    }
    return {
      Authorization: `Bearer ${token}`
    } as const;
  }, [token]);

  const refreshMessages = useCallback(
    async (conversationId: number) => {
      if (!authHeaders) {
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/conversations/${conversationId}/messages?limit=50`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders
            }
          }
        );
        if (!response.ok) {
          throw new Error('Failed to load messages');
        }
        const payload = (await response.json()) as MessagesResponse;
        const normalized = payload.messages
          .slice()
          .reverse()
          .map((message) => ({
            id: String(message.id),
            conversationId: message.conversationId,
            senderId: message.senderId,
            body: message.body,
            createdAt: message.createdAt
          }));

        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: normalized
        }));

        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
          )
        );
      } catch (err) {
        console.error('Failed to refresh messages', err);
        setError((err as Error).message);
      }
    },
    [authHeaders]
  );

  const refreshConversations = useCallback(async () => {
    if (!user || !CHAT_ENABLED || !token) {
      return;
    }
    setIsRefreshingConversations(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Unable to load conversations');
      }
      const payload = (await response.json()) as ConversationsResponse;
      const normalized = payload.conversations.map((conversation) => {
        const participants = conversation.participants ?? [];
        const counterpart = participants.find((participant) => participant.id !== user.id);
        const fallbackName = participants[0]?.name ?? conversation.title ?? 'Conversation';
        const displayName = counterpart?.name ?? fallbackName;
        const lastMessage = conversation.last_message
          ? {
              id: String(conversation.last_message.id),
              conversationId: conversation.id,
              senderId: conversation.last_message.sender_id,
              body: conversation.last_message.body,
              createdAt: conversation.last_message.created_at
            }
          : undefined;

        return {
          id: conversation.id,
          title: conversation.title ?? null,
          memberIds: conversation.member_ids,
          participants,
          displayName,
          lastMessage,
          unreadCount: conversation.unread_count ?? 0
        } as ChatConversation;
      });

      normalized.sort((a, b) => {
        const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
        const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
        return bTime - aTime;
      });

      setConversations((prev) => {
        const prevMap = new Map(prev.map((item) => [item.id, item] as const));
        return normalized.map((item) => {
          const previous = prevMap.get(item.id);
          const lastMessage = item.lastMessage ?? previous?.lastMessage;
          const unreadCount = item.unreadCount ?? previous?.unreadCount ?? 0;
          return {
            ...item,
            lastMessage,
            unreadCount
          };
        });
      });

      const normalizedIds = normalized.map((conversation) => conversation.id);
      if (activeConversationId !== null && !normalizedIds.includes(activeConversationId)) {
        setActiveConversationId(null);
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
      setError((err as Error).message);
    } finally {
      setIsRefreshingConversations(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (!user || !CHAT_ENABLED || !token) {
      return;
    }
    refreshConversations();
  }, [user, token, refreshConversations]);

  useEffect(() => {
    if (!user || !CHAT_ENABLED || !token) {
      return;
    }
    const conversationId = activeConversationId;
    if (conversationId != null && !messagesByConversation[conversationId]) {
      refreshMessages(conversationId).catch(() => undefined);
    }
  }, [activeConversationId, messagesByConversation, refreshMessages, user]);

  useEffect(() => {
    if (!user || !CHAT_ENABLED || !token) {
      return () => undefined;
    }

    const protocolBase = `${WS_BASE_URL}${WS_PATH}`;
    const socketUrl = `${protocolBase}?token=${encodeURIComponent(token)}`;
    setIsConnecting(true);
    setError(null);

    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnecting(false);
    };

    socket.onerror = () => {
      setError('Failed to connect to chat.');
      setIsConnecting(false);
    };

    socket.onclose = () => {
      setIsConnecting(false);
    };

    socket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(String(event.data)) as ServerEnvelope;
        if (envelope.type === 'message:new') {
          const message = mapServerMessage(envelope.message);
          if (!message) {
            return;
          }

          setMessagesByConversation((prev) => {
            const existing = prev[message.conversationId] ?? [];
            let nextMessages = existing;

            if (envelope.tempId) {
              nextMessages = existing.filter((item) => item.tempId !== envelope.tempId);
            }

            return {
              ...prev,
              [message.conversationId]: [...nextMessages, message]
            };
          });

      setConversations((prev) => {
        const preview: ChatMessage = {
          ...message,
          pending: false,
          tempId: envelope.tempId
        };
        const updated = prev.map((conversation) =>
          conversation.id === message.conversationId
            ? {
                ...conversation,
                lastMessage: preview,
                unreadCount:
                  message.senderId === user?.id || conversation.id === activeConversationId
                    ? 0
                    : (conversation.unreadCount ?? 0) + 1
              }
            : conversation
        );
        return sortConversationsByActivity(updated);
      });
    }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [activeConversationId, token, user, mapServerMessage]);

  const sendMessage = useCallback(
    (conversationId: number, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) {
        return;
      }

      const tempId = `${conversationId}-${Date.now()}`;
      const timestamp = new Date().toISOString();

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setError('Chat connection is not ready.');

        const failedMessage: ChatMessage = {
          id: tempId,
          conversationId,
          senderId: user?.id ?? 0,
          body: trimmed,
          createdAt: timestamp,
          pending: false,
          tempId,
          failed: true
        };

        setMessagesByConversation((prev) => {
          const existing = prev[conversationId] ?? [];
          return {
            ...prev,
            [conversationId]: [...existing, failedMessage]
          };
        });

        setConversations((prev) => {
          const updated = prev.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, lastMessage: failedMessage, unreadCount: 0 }
              : conversation
          );
          return sortConversationsByActivity(updated);
        });
        return;
      }

      const optimisticMessage: ChatMessage = {
        id: tempId,
        conversationId,
        senderId: user?.id ?? 0,
        body: trimmed,
        createdAt: timestamp,
        pending: true,
        tempId
      };

      setMessagesByConversation((prev) => {
        const existing = prev[conversationId] ?? [];
        return {
          ...prev,
          [conversationId]: [...existing, optimisticMessage]
        };
      });

      setConversations((prev) => {
        const updated = prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, lastMessage: optimisticMessage, unreadCount: 0 }
            : conversation
        );
        return sortConversationsByActivity(updated);
      });

      const payload = {
        type: 'message:send',
        conversationId,
        body: trimmed,
        tempId
      };

      socketRef.current.send(JSON.stringify(payload));
    },
    [user]
  );

  const retryMessage = useCallback(
    (conversationId: number, message: ChatMessage) => {
      if (!message.failed) {
        return;
      }

      setMessagesByConversation((prev) => {
        const existing = prev[conversationId] ?? [];
        return {
          ...prev,
          [conversationId]: existing.filter((item) => item.id !== message.id)
        };
      });

      sendMessage(conversationId, message.body);
    },
    [sendMessage]
  );

  const setActiveConversation = useCallback((conversationId: number | null) => {
    setActiveConversationId(conversationId);
    if (conversationId !== null) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
        )
      );
    }
  }, []);

  const messages = useMemo(() => {
    if (activeConversationId == null) {
      return [];
    }
    return messagesByConversation[activeConversationId] ?? [];
  }, [activeConversationId, messagesByConversation]);

  const value = useMemo(
    () => ({
      conversations,
      activeConversationId,
      isConnecting,
      error,
      messages,
      setActiveConversation,
      refreshConversations,
      sendMessage,
      retryMessage,
      isRefreshingConversations
    }),
    [
      conversations,
      activeConversationId,
      isConnecting,
      error,
      messages,
      refreshConversations,
      sendMessage,
      retryMessage,
      isRefreshingConversations
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
