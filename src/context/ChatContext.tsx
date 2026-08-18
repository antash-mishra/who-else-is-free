import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AppState, AppStateStatus } from 'react-native';

import { ApiError, requestJson } from '@api/client';
import { CHAT_ENABLED, WS_BASE_URL } from '@api/config';
import {
  ChatConversation,
  ChatJoinRequest,
  ChatMessage,
  normalizeConversation,
  normalizeJoinRequest,
  RawConversation,
  RawJoinRequest,
} from '@api/mappers/chat';
import { isAbortError } from '@api/request';
import { useAuth } from '@context/AuthContext';
import { trackEvent } from '@services/analytics';
import { logger } from '@services/logger';

export type { ChatConversation, ChatJoinRequest, ChatMessage };

interface ChatContextValue {
  conversations: ChatConversation[];
  activeConversationId: number | null;
  isConnecting: boolean;
  error: string | null;
  messages: ChatMessage[];
  joinRequestsByConversation: Record<number, ChatJoinRequest[]>;
  setActiveConversation: (conversationId: number | null) => void;
  refreshConversations: () => Promise<void>;
  sendMessage: (conversationId: number, body: string, replyTo?: ChatMessage['replyTo']) => void;
  retryMessage: (conversationId: number, message: ChatMessage) => void;
  refreshJoinRequests: (
    conversationId: number,
    eventId: number,
    options?: {
      includeApproved?: boolean;
    },
  ) => Promise<void>;
  approveJoinRequest: (conversationId: number, eventId: number, userId: number) => Promise<void>;
  denyJoinRequest: (conversationId: number, eventId: number, userId: number) => Promise<void>;
  reportMember: (eventId: number, userId: number, reason: string) => Promise<void>;
  isRefreshingConversations: boolean;
  hasUnseenMessages: boolean;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const WS_PATH = '/api/ws';
const REFRESH_TIMEOUT_MS = 10_000;

const sortConversationsByActivity = (items: ChatConversation[]) => {
  return [...items].sort((a, b) => {
    const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
    const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
    return bTime - aTime;
  });
};

type ServerEnvelope = {
  type: string;
  code?: string;
  tempId?: string;
  message?: {
    id: number;
    conversationId: number;
    senderId: number;
    body: string;
    kind?: 'user' | 'system';
    createdAt: string;
    replyTo?: {
      id: number;
      senderId: number;
      body: string;
      senderName: string;
    };
  };
  conversationId?: number;
  userId?: number;
  action?: string;
  request?: RawJoinRequest;
};

type ConversationsResponse = {
  conversations: RawConversation[];
};

type MessagesResponse = {
  messages: Array<{
    id: number;
    conversationId: number;
    senderId: number;
    body: string;
    kind?: 'user' | 'system';
    createdAt: string;
    replyTo?: {
      id: number;
      senderId: number;
      body: string;
      senderName: string;
    };
  }>;
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user, token, refreshSessionSilently, authFetch } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<number, ChatMessage[]>
  >({});
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const [joinRequestsByConversation, setJoinRequestsByConversation] = useState<
    Record<number, ChatJoinRequest[]>
  >({});
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuallyClosedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const activeConversationRef = useRef<number | null>(null);
  const userIdRef = useRef<number | null>(null);
  const tokenRef = useRef<string | null>(null);
  const authFetchRef = useRef(authFetch);
  const refreshSessionSilentlyRef = useRef(refreshSessionSilently);
  const conversationsRefreshRequestIdRef = useRef(0);
  const joinRequestsRefreshRequestIdRef = useRef<Record<number, number>>({});

  useEffect(() => {
    activeConversationRef.current = activeConversationId;

    // Send presence update over WebSocket so the server can suppress pushes
    // for the conversation the user is currently viewing.
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const presencePayload = {
        type: 'presence:active_conversation',
        conversationId: activeConversationId ?? 0,
      };
      socketRef.current.send(JSON.stringify(presencePayload));
    }
  }, [activeConversationId]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    tokenRef.current = token ?? null;
  }, [token]);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  useEffect(() => {
    refreshSessionSilentlyRef.current = refreshSessionSilently;
  }, [refreshSessionSilently]);

  const mapServerMessage = useCallback((payload: ServerEnvelope['message']): ChatMessage | null => {
    if (!payload) {
      return null;
    }
    return {
      id: String(payload.id),
      conversationId: payload.conversationId,
      senderId: payload.senderId,
      body: payload.body,
      kind: payload.kind === 'system' ? 'system' : 'user',
      createdAt: payload.createdAt,
      replyTo: payload.replyTo
        ? {
            id: String(payload.replyTo.id),
            senderId: payload.replyTo.senderId,
            body: payload.replyTo.body,
            senderName: payload.replyTo.senderName,
          }
        : undefined,
    };
  }, []);

  useEffect(() => {
    if (!user || !token) {
      setConversations([]);
      setMessagesByConversation({});
      setActiveConversationId(null);
      setJoinRequestsByConversation({});
      manuallyClosedRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }
  }, [token, user]);

  const refreshMessages = useCallback(
    async (conversationId: number) => {
      if (!token) {
        return;
      }
      const fetchClient = authFetchRef.current;
      if (!fetchClient) {
        return;
      }
      const activeToken = tokenRef.current;
      if (!activeToken) {
        return;
      }
      try {
        const payload = await requestJson<MessagesResponse>(
          `/api/conversations/${conversationId}/messages?limit=50`,
          {
            headers: { 'Content-Type': 'application/json' },
            token: activeToken,
            timeoutMs: null,
            fetchImpl: fetchClient,
            errorMessage: 'Failed to load messages',
          },
        );
        const normalized = payload.messages
          .slice()
          .reverse()
          .map((message) => ({
            id: String(message.id),
            conversationId: message.conversationId,
            senderId: message.senderId,
            body: message.body,
            kind: (message.kind === 'system' ? 'system' : 'user') as ChatMessage['kind'],
            createdAt: message.createdAt,
            replyTo: message.replyTo
              ? {
                  id: String(message.replyTo.id),
                  senderId: message.replyTo.senderId,
                  body: message.replyTo.body,
                  senderName: message.replyTo.senderName,
                }
              : undefined,
          }));

        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: normalized,
        }));

        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
          ),
        );
      } catch (err) {
        logger.error('Failed to refresh messages', err);
        setError((err as Error).message);
      }
    },
    [token],
  );

  const refreshConversations = useCallback(async () => {
    if (!user || !CHAT_ENABLED || !token) {
      return;
    }
    const fetchClient = authFetchRef.current;
    if (!fetchClient) {
      return;
    }
    const activeToken = tokenRef.current;
    if (!activeToken) {
      return;
    }
    const requestId = conversationsRefreshRequestIdRef.current + 1;
    conversationsRefreshRequestIdRef.current = requestId;
    setIsRefreshingConversations(true);
    try {
      const payload = await requestJson<ConversationsResponse>('/api/conversations', {
        headers: { 'Content-Type': 'application/json' },
        token: activeToken,
        timeoutMs: REFRESH_TIMEOUT_MS,
        fetchImpl: fetchClient,
        errorMessage: 'Unable to load conversations',
      });
      if (requestId !== conversationsRefreshRequestIdRef.current) {
        return;
      }
      setError(null);
      const normalized = (payload.conversations ?? []).map((conversation) =>
        normalizeConversation(conversation, user.id),
      );

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
          const unreadCount = Math.max(item.unreadCount ?? 0, previous?.unreadCount ?? 0);
          const event = item.event ?? previous?.event;
          const eventId = item.eventId ?? previous?.eventId ?? null;
          return {
            ...item,
            lastMessage,
            unreadCount,
            event,
            eventId,
            createdBy: item.createdBy ?? previous?.createdBy ?? 0,
          };
        });
      });

      const normalizedIds = normalized.map((conversation) => conversation.id);
      const currentActiveConversationId = activeConversationRef.current;
      if (
        currentActiveConversationId !== null &&
        !normalizedIds.includes(currentActiveConversationId)
      ) {
        setActiveConversationId(null);
      }
    } catch (err) {
      if (requestId !== conversationsRefreshRequestIdRef.current) {
        return;
      }
      logger.error('Failed to load conversations', err);
      if (isAbortError(err)) {
        setError('Unable to load conversations');
      } else {
        setError((err as Error).message);
      }
    } finally {
      if (requestId === conversationsRefreshRequestIdRef.current) {
        setIsRefreshingConversations(false);
      }
    }
  }, [token, user]);

  const refreshJoinRequests = useCallback(
    async (
      conversationId: number,
      eventId: number,
      options?: {
        includeApproved?: boolean;
      },
    ) => {
      const fetchClient = authFetchRef.current;
      if (!fetchClient) {
        throw new Error('Not authenticated');
      }
      const activeToken = tokenRef.current;
      if (!activeToken) {
        throw new Error('Not authenticated');
      }
      const includeApproved = options?.includeApproved === true;
      const query = includeApproved ? '?include_approved=1' : '';
      const requestId = (joinRequestsRefreshRequestIdRef.current[eventId] ?? 0) + 1;
      joinRequestsRefreshRequestIdRef.current[eventId] = requestId;
      try {
        const payload = await requestJson<{ requests?: RawJoinRequest[] }>(
          `/api/events/${eventId}/chat/requests${query}`,
          {
            token: activeToken,
            timeoutMs: REFRESH_TIMEOUT_MS,
            fetchImpl: fetchClient,
            errorMessage: 'Failed to load join requests',
          },
        );
        const normalized = (payload?.requests ?? []).map(normalizeJoinRequest);
        if (joinRequestsRefreshRequestIdRef.current[eventId] !== requestId) {
          return;
        }
        setJoinRequestsByConversation((prev) => ({
          ...prev,
          [conversationId]: normalized,
          [-eventId]: normalized,
        }));
      } catch (err) {
        if (joinRequestsRefreshRequestIdRef.current[eventId] !== requestId) {
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          // Event may have been deleted while polling host requests; treat as empty.
          setJoinRequestsByConversation((prev) => ({
            ...prev,
            [conversationId]: [],
          }));
          return;
        }
        logger.error('Failed to load join requests', err);
        throw err;
      }
    },
    [],
  );

  const performJoinRequestAction = useCallback(
    async (conversationId: number, eventId: number, userId: number, action: 'approve' | 'deny') => {
      const path =
        action === 'approve'
          ? `/api/events/${eventId}/chat/requests/${userId}/approve`
          : `/api/events/${eventId}/chat/requests/${userId}/deny`;
      const fetchClient = authFetchRef.current;
      if (!fetchClient) {
        throw new Error('Not authenticated');
      }
      const activeToken = tokenRef.current;
      if (!activeToken) {
        throw new Error('Not authenticated');
      }
      await requestJson(path, {
        method: 'POST',
        token: activeToken,
        timeoutMs: null,
        fetchImpl: fetchClient,
        errorMessage:
          action === 'approve' ? 'Unable to approve join request.' : 'Unable to deny join request.',
      });
      setJoinRequestsByConversation((prev) => {
        const eventScopedKey = -eventId;
        const existingByConversation = prev[conversationId] ?? [];
        const existingByEvent = prev[eventScopedKey] ?? [];
        const nextByConversation = existingByConversation.filter((item) => item.userId !== userId);
        const nextByEvent = existingByEvent.filter((item) => item.userId !== userId);
        if (
          existingByConversation.length === nextByConversation.length &&
          existingByEvent.length === nextByEvent.length
        ) {
          return prev;
        }
        return {
          ...prev,
          [conversationId]: nextByConversation,
          [eventScopedKey]: nextByEvent,
        };
      });
    },
    [],
  );

  const approveJoinRequest = useCallback(
    async (conversationId: number, eventId: number, userId: number) => {
      await performJoinRequestAction(conversationId, eventId, userId, 'approve');
    },
    [performJoinRequestAction],
  );

  const denyJoinRequest = useCallback(
    async (conversationId: number, eventId: number, userId: number) => {
      await performJoinRequestAction(conversationId, eventId, userId, 'deny');
    },
    [performJoinRequestAction],
  );

  const reportMember = useCallback(async (eventId: number, userId: number, reason: string) => {
    const fetchClient = authFetchRef.current;
    if (!fetchClient) {
      throw new Error('Not authenticated');
    }
    const activeToken = tokenRef.current;
    if (!activeToken) {
      throw new Error('Not authenticated');
    }

    await requestJson(`/api/events/${eventId}/members/${userId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
      token: activeToken,
      timeoutMs: null,
      fetchImpl: fetchClient,
      errorMessage: 'Unable to report member',
    });

    // The backend also denies the join request, so we need to update local state
    // This is similar to denyJoinRequest behavior
    // Find the conversationId for this user and remove them from joinRequestsByConversation
    setJoinRequestsByConversation((prev) => {
      const updated = { ...prev };
      for (const [convId, requests] of Object.entries(updated)) {
        updated[Number(convId)] = requests.filter(
          (req) => !(req.eventId === eventId && req.userId === userId),
        );
      }
      return updated;
    });
  }, []);

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
    if (conversationId != null) {
      refreshMessages(conversationId).catch(() => undefined);
    }
  }, [activeConversationId, refreshMessages, token, user]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const cleanupSocket = useCallback(() => {
    clearReconnectTimeout();
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [clearReconnectTimeout]);

  const handleServerEnvelope = useCallback(
    (envelope: ServerEnvelope) => {
      const currentUserId = userIdRef.current;
      const currentActiveConversationId = activeConversationRef.current;

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
            [message.conversationId]: [...nextMessages, message],
          };
        });

        setConversations((prev) => {
          const preview: ChatMessage = {
            ...message,
            pending: false,
            tempId: envelope.tempId,
          };
          const updated = prev.map((conversation) =>
            conversation.id === message.conversationId
              ? {
                  ...conversation,
                  lastMessage: preview,
                  unreadCount:
                    message.kind === 'system' ||
                    message.senderId === currentUserId ||
                    conversation.id === currentActiveConversationId
                      ? 0
                      : (conversation.unreadCount ?? 0) + 1,
                }
              : conversation,
          );

          // If sender is not in participants, refresh to get updated list
          if (message.senderId !== currentUserId) {
            const convo = prev.find((c) => c.id === message.conversationId);
            if (convo && !convo.participants?.some((p) => p.id === message.senderId)) {
              refreshConversations().catch(() => undefined);
            }
          }

          return sortConversationsByActivity(updated);
        });

        if (message.senderId === currentUserId && envelope.tempId) {
          trackEvent('message_sent').catch(() => undefined);
        }
        return;
      }

      if (envelope.type === 'system:error') {
        trackEvent('message_send_failed', {
          failure_stage: envelope.code ?? 'server_error',
        }).catch(() => undefined);
        return;
      }

      if (envelope.type === 'conversation:join_request') {
        const { conversationId, action, request } = envelope;
        if (!conversationId || !request || !action) {
          return;
        }

        setJoinRequestsByConversation((prev) => {
          const normalized = normalizeJoinRequest(request);
          const eventScopedKey = normalized.eventId > 0 ? -normalized.eventId : null;
          const existing = prev[conversationId] ?? [];
          const eventScopedExisting = eventScopedKey != null ? (prev[eventScopedKey] ?? []) : [];

          const upsertByID = (
            items: ChatJoinRequest[],
            nextItem: ChatJoinRequest,
          ): ChatJoinRequest[] => {
            const filtered = items.filter((item) => item.id !== nextItem.id);
            return [...filtered, nextItem];
          };

          const removeByID = (items: ChatJoinRequest[], targetID: number): ChatJoinRequest[] =>
            items.filter((item) => item.id !== targetID);

          if (action === 'created') {
            const nextByConversation = upsertByID(existing, normalized);
            const next = {
              ...prev,
              [conversationId]: nextByConversation,
            };
            if (eventScopedKey != null) {
              next[eventScopedKey] = upsertByID(eventScopedExisting, normalized);
            }
            return {
              ...next,
            };
          }
          if (action === 'approved' || action === 'denied') {
            const nextByConversation = removeByID(existing, normalized.id);
            const conversationChanged = nextByConversation.length !== existing.length;
            const nextByEvent =
              eventScopedKey != null ? removeByID(eventScopedExisting, normalized.id) : [];
            const eventChanged =
              eventScopedKey != null && nextByEvent.length !== eventScopedExisting.length;
            if (!conversationChanged && !eventChanged) {
              return prev;
            }
            const next: Record<number, ChatJoinRequest[]> = {
              ...prev,
              [conversationId]: nextByConversation,
            };
            if (eventScopedKey != null) {
              next[eventScopedKey] = nextByEvent;
            }
            return next;
          }
          return prev;
        });
        return;
      }

      if (envelope.type === 'conversation:membership') {
        const { conversationId, userId, action } = envelope;
        if (!conversationId || !action) {
          return;
        }

        if (action === 'added') {
          refreshConversations().catch(() => undefined);
          return;
        }

        if (action === 'removed') {
          if (userId === currentUserId) {
            setConversations((prev) =>
              prev.filter((conversation) => conversation.id !== conversationId),
            );
            setMessagesByConversation((prev) => {
              if (!(conversationId in prev)) {
                return prev;
              }
              const { [conversationId]: _removed, ...rest } = prev;
              return rest;
            });
            if (currentActiveConversationId === conversationId) {
              setActiveConversationId(null);
            }
          } else {
            refreshConversations().catch(() => undefined);
          }
        }
      }
    },
    [mapServerMessage, refreshConversations],
  );

  const connectSocket = useCallback(() => {
    if (!user || !CHAT_ENABLED || !token) {
      return;
    }
    const activeToken = tokenRef.current;
    if (!activeToken) {
      return;
    }

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocolBase = `${WS_BASE_URL}${WS_PATH}`;
    const socketUrl = `${protocolBase}?token=${encodeURIComponent(activeToken)}`;
    setIsConnecting(true);
    setError(null);

    clearReconnectTimeout();

    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;
    manuallyClosedRef.current = false;

    socket.onopen = () => {
      setIsConnecting(false);
      refreshConversations().catch(() => undefined);
      const conversationId = activeConversationRef.current;
      if (conversationId != null) {
        refreshMessages(conversationId).catch(() => undefined);
      }
    };

    socket.onerror = async () => {
      setError('Failed to connect to chat.');
      setIsConnecting(false);
      const refreshedToken = await refreshSessionSilentlyRef.current?.();
      if (refreshedToken) {
        tokenRef.current = refreshedToken;
      }
    };

    socket.onclose = async () => {
      socketRef.current = null;
      setIsConnecting(false);
      if (!manuallyClosedRef.current && user && token) {
        clearReconnectTimeout();
        const refreshedToken = await refreshSessionSilentlyRef.current?.();
        if (refreshedToken) {
          tokenRef.current = refreshedToken;
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connectSocket();
        }, 1000);
      }
    };

    socket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(String(event.data)) as ServerEnvelope;
        handleServerEnvelope(envelope);
      } catch (err) {
        logger.error('Failed to parse WS message', err);
      }
    };
  }, [
    clearReconnectTimeout,
    handleServerEnvelope,
    refreshConversations,
    refreshMessages,
    token,
    user,
  ]);

  useEffect(() => {
    if (!user || !CHAT_ENABLED || !token) {
      manuallyClosedRef.current = true;
      cleanupSocket();
      return;
    }

    connectSocket();

    return () => {
      manuallyClosedRef.current = true;
      cleanupSocket();
    };
  }, [cleanupSocket, connectSocket, token, user]);

  useEffect(() => {
    if (!CHAT_ENABLED) {
      return;
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;

      if (!user || !token) {
        return;
      }

      if (nextState === 'active' && (previous === 'inactive' || previous === 'background')) {
        manuallyClosedRef.current = false;
        connectSocket();
        refreshConversations().catch(() => undefined);
        const conversationId = activeConversationRef.current;
        if (conversationId != null) {
          refreshMessages(conversationId).catch(() => undefined);
        }
        return;
      }

      if (nextState === 'background' || nextState === 'inactive') {
        manuallyClosedRef.current = true;
        cleanupSocket();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [cleanupSocket, connectSocket, refreshConversations, refreshMessages, token, user]);

  const sendMessage = useCallback(
    (conversationId: number, body: string, replyTo?: ChatMessage['replyTo']) => {
      const trimmed = body.trim();
      if (!trimmed) {
        return;
      }

      const tempId = `${conversationId}-${Date.now()}`;
      const timestamp = new Date().toISOString();

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setError('Chat connection is not ready.');
        connectSocket();

        const failedMessage: ChatMessage = {
          id: tempId,
          conversationId,
          senderId: user?.id ?? 0,
          body: trimmed,
          createdAt: timestamp,
          kind: 'user',
          pending: false,
          tempId,
          failed: true,
          replyTo,
        };

        setMessagesByConversation((prev) => {
          const existing = prev[conversationId] ?? [];
          return {
            ...prev,
            [conversationId]: [...existing, failedMessage],
          };
        });

        setConversations((prev) => {
          const updated = prev.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, lastMessage: failedMessage, unreadCount: 0 }
              : conversation,
          );
          return sortConversationsByActivity(updated);
        });
        trackEvent('message_send_failed', {
          failure_stage: 'socket_unavailable',
        }).catch(() => undefined);
        return;
      }

      const optimisticMessage: ChatMessage = {
        id: tempId,
        conversationId,
        senderId: user?.id ?? 0,
        body: trimmed,
        createdAt: timestamp,
        kind: 'user',
        pending: true,
        tempId,
        replyTo,
      };

      setMessagesByConversation((prev) => {
        const existing = prev[conversationId] ?? [];
        return {
          ...prev,
          [conversationId]: [...existing, optimisticMessage],
        };
      });

      setConversations((prev) => {
        const updated = prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                lastMessage: optimisticMessage,
                unreadCount: 0,
              }
            : conversation,
        );
        return sortConversationsByActivity(updated);
      });

      const payload = {
        type: 'message:send',
        conversationId,
        body: trimmed,
        tempId,
        ...(replyTo ? { replyToMessageId: Number(replyTo.id) } : {}),
      };

      try {
        socketRef.current.send(JSON.stringify(payload));
      } catch (error) {
        trackEvent('message_send_failed', {
          failure_stage: 'socket_send_error',
        }).catch(() => undefined);
        throw error;
      }
    },
    [connectSocket, user],
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
          [conversationId]: existing.filter((item) => item.id !== message.id),
        };
      });

      sendMessage(conversationId, message.body, message.replyTo);
    },
    [sendMessage],
  );

  const setActiveConversation = useCallback((conversationId: number | null) => {
    setActiveConversationId(conversationId);
    if (conversationId !== null) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ),
      );
    }
  }, []);

  const messages = useMemo(() => {
    if (activeConversationId == null) {
      return [];
    }
    return messagesByConversation[activeConversationId] ?? [];
  }, [activeConversationId, messagesByConversation]);

  const hasUnseenMessages = useMemo(
    () => conversations.some((c) => (c.unreadCount ?? 0) > 0),
    [conversations],
  );

  const value = useMemo(
    () => ({
      conversations,
      activeConversationId,
      isConnecting,
      error,
      messages,
      joinRequestsByConversation,
      setActiveConversation,
      refreshConversations,
      sendMessage,
      retryMessage,
      refreshJoinRequests,
      approveJoinRequest,
      denyJoinRequest,
      reportMember,
      isRefreshingConversations,
      hasUnseenMessages,
    }),
    [
      conversations,
      activeConversationId,
      isConnecting,
      error,
      messages,
      joinRequestsByConversation,
      refreshConversations,
      sendMessage,
      retryMessage,
      refreshJoinRequests,
      approveJoinRequest,
      denyJoinRequest,
      reportMember,
      isRefreshingConversations,
      hasUnseenMessages,
    ],
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
