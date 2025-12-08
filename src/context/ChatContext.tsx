import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppState, AppStateStatus } from "react-native";

import { API_BASE_URL, CHAT_ENABLED, WS_BASE_URL } from "@api/config";
import { useAuth } from "@context/AuthContext";

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

type ConversationEventApi = {
  id: number;
  title: string;
  location: string;
  time: string;
  date_label: string;
  event_date?: string;
  group_type?: string;
};

export type ChatConversation = {
  id: number;
  createdBy: number;
  title?: string | null;
  memberIds: number[];
  participants: ConversationParticipant[];
  displayName: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
  eventId: number | null;
  event?: {
    id: number;
    title: string;
    location: string;
    time: string;
    dateLabel: string;
    eventDate?: string;
    groupType?: string;
  };
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

export type ChatJoinRequest = {
  id: number;
  eventId: number;
  userId: number;
  message: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  requester: ConversationParticipant;
};

interface ChatContextValue {
  conversations: ChatConversation[];
  activeConversationId: number | null;
  isConnecting: boolean;
  error: string | null;
  messages: ChatMessage[];
  joinRequestsByConversation: Record<number, ChatJoinRequest[]>;
  setActiveConversation: (conversationId: number | null) => void;
  refreshConversations: () => Promise<void>;
  sendMessage: (conversationId: number, body: string) => void;
  retryMessage: (conversationId: number, message: ChatMessage) => void;
  refreshJoinRequests: (
    conversationId: number,
    eventId: number,
  ) => Promise<void>;
  approveJoinRequest: (
    conversationId: number,
    eventId: number,
    userId: number,
  ) => Promise<void>;
  denyJoinRequest: (
    conversationId: number,
    eventId: number,
    userId: number,
  ) => Promise<void>;
  isRefreshingConversations: boolean;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const WS_PATH = "/api/ws";

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
  conversationId?: number;
  userId?: number;
  action?: string;
  request?: {
    id: number;
    eventId?: number;
    event_id?: number;
    userId?: number;
    user_id?: number;
    message?: string;
    status?: string;
    createdAt?: string;
    created_at?: string;
    requester?: ConversationParticipant;
  };
};

type ConversationsResponse = {
  conversations: Array<{
    id: number;
    created_by: number;
    title?: string | null;
    member_ids: number[];
    participants: ConversationParticipant[];
    last_message?: ConversationLastMessage;
    unread_count?: number;
    event?: ConversationEventApi;
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
  const { user, token, refreshSessionSilently } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<number, ChatMessage[]>
  >({});
  const [activeConversationId, setActiveConversationId] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] =
    useState(false);
  const [joinRequestsByConversation, setJoinRequestsByConversation] = useState<
    Record<number, ChatJoinRequest[]>
  >({});
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const manuallyClosedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const activeConversationRef = useRef<number | null>(null);
  const userIdRef = useRef<number | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    tokenRef.current = token ?? null;
  }, [token]);

  const mapServerMessage = useCallback(
    (payload: ServerEnvelope["message"]): ChatMessage | null => {
      if (!payload) {
        return null;
      }
      return {
        id: String(payload.id),
        conversationId: payload.conversationId,
        senderId: payload.senderId,
        body: payload.body,
        createdAt: payload.createdAt,
      };
    },
    [],
  );

  const normalizeJoinRequest = useCallback((raw: any): ChatJoinRequest => {
    const eventId = raw.eventId ?? raw.event_id ?? 0;
    const userId = raw.userId ?? raw.user_id ?? 0;
    const createdAt =
      raw.createdAt ?? raw.created_at ?? new Date().toISOString();
    const requester = raw.requester ?? {};
    return {
      id: raw.id,
      eventId,
      userId,
      message: raw.message ?? "",
      status: (raw.status ?? "pending") as ChatJoinRequest["status"],
      createdAt,
      requester: {
        id: requester.id ?? userId,
        name: requester.name ?? requester.full_name ?? "",
      },
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
      const activeToken = tokenRef.current;
      if (!activeToken) {
        return;
      }
      try {
        let response = await fetch(
          `${API_BASE_URL}/api/conversations/${conversationId}/messages?limit=50`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${activeToken}`,
            },
          },
        );
        if (response.status === 401) {
          const refreshedToken = await refreshSessionSilently();
          if (refreshedToken) {
            tokenRef.current = refreshedToken;
            response = await fetch(
              `${API_BASE_URL}/api/conversations/${conversationId}/messages?limit=50`,
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${refreshedToken}`,
                },
              },
            );
          }
        }
        if (!response.ok) {
          throw new Error("Failed to load messages");
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
            createdAt: message.createdAt,
          }));

        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: normalized,
        }));

        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
      } catch (err) {
        console.error("Failed to refresh messages", err);
        setError((err as Error).message);
      }
    },
    [token, refreshSessionSilently],
  );

  const refreshConversations = useCallback(async () => {
    if (!user || !CHAT_ENABLED || !token) {
      return;
    }
    const activeToken = tokenRef.current;
    if (!activeToken) {
      return;
    }
    setIsRefreshingConversations(true);
    try {
      let response = await fetch(`${API_BASE_URL}/api/conversations`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
      });
      if (response.status === 401) {
        const refreshedToken = await refreshSessionSilently();
        if (refreshedToken) {
          tokenRef.current = refreshedToken;
          response = await fetch(`${API_BASE_URL}/api/conversations`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshedToken}`,
            },
          });
        }
      }
      if (!response.ok) {
        throw new Error("Unable to load conversations");
      }
      const payload = (await response.json()) as ConversationsResponse;
      const normalized = payload.conversations.map((conversation) => {
        const participants = conversation.participants ?? [];
        const counterpart = participants.find(
          (participant) => participant.id !== user.id,
        );
        const event = conversation.event
          ? {
              id: conversation.event.id,
              title: conversation.event.title,
              location: conversation.event.location,
              time: conversation.event.time,
              dateLabel: conversation.event.date_label,
              eventDate: conversation.event.event_date,
              groupType: conversation.event.group_type,
            }
          : undefined;
        const memberCount =
          conversation.member_ids?.length ?? participants.length;
        const hasEvent = !!event;
        const isGroup =
          hasEvent || memberCount > 2 || (!!conversation.title && memberCount > 1);
        const fallbackName =
          conversation.title ?? participants[0]?.name ?? "Conversation";
        const displayName = hasEvent
          ? event?.title ?? fallbackName
          : counterpart?.name ?? fallbackName;
        const lastMessage = conversation.last_message
          ? {
              id: String(conversation.last_message.id),
              conversationId: conversation.id,
              senderId: conversation.last_message.sender_id,
              body: conversation.last_message.body,
              createdAt: conversation.last_message.created_at,
            }
          : undefined;

        return {
          id: conversation.id,
          createdBy: conversation.created_by,
          title: conversation.title ?? null,
          memberIds: conversation.member_ids,
          participants,
          displayName,
          lastMessage,
          unreadCount: conversation.unread_count ?? 0,
          eventId: event?.id ?? null,
          event,
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
      if (
        activeConversationId !== null &&
        !normalizedIds.includes(activeConversationId)
      ) {
        setActiveConversationId(null);
      }
    } catch (err) {
      console.error("Failed to load conversations", err);
      setError((err as Error).message);
    } finally {
      setIsRefreshingConversations(false);
    }
  }, [token, user]);

  const refreshJoinRequests = useCallback(
    async (conversationId: number, eventId: number) => {
      const authToken = tokenRef.current;
      if (!authToken) {
        throw new Error("Not authenticated");
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/events/${eventId}/chat/requests`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );
        if (!response.ok) {
          throw new Error("Failed to load join requests");
        }
        const payload = (await response.json().catch(() => ({}))) as {
          requests?: any[];
        };
        const normalized = (payload.requests ?? []).map(normalizeJoinRequest);
        setJoinRequestsByConversation((prev) => ({
          ...prev,
          [conversationId]: normalized,
        }));
      } catch (err) {
        console.error("Failed to load join requests", err);
        throw err;
      }
    },
    [normalizeJoinRequest],
  );

  const performJoinRequestAction = useCallback(
    async (
      conversationId: number,
      eventId: number,
      userId: number,
      action: "approve" | "deny",
    ) => {
      const authToken = tokenRef.current;
      if (!authToken) {
        throw new Error("Not authenticated");
      }
      const path =
        action === "approve"
          ? `${API_BASE_URL}/api/events/${eventId}/chat/requests/${userId}/approve`
          : `${API_BASE_URL}/api/events/${eventId}/chat/requests/${userId}/deny`;
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!response.ok) {
        const message =
          action === "approve"
            ? "Unable to approve join request."
            : "Unable to deny join request.";
        throw new Error(message);
      }
      setJoinRequestsByConversation((prev) => {
        const existing = prev[conversationId];
        if (!existing) {
          return prev;
        }
        const next = existing.filter((item) => item.userId !== userId);
        return {
          ...prev,
          [conversationId]: next,
        };
      });
    },
    [],
  );

  const approveJoinRequest = useCallback(
    async (conversationId: number, eventId: number, userId: number) => {
      await performJoinRequestAction(
        conversationId,
        eventId,
        userId,
        "approve",
      );
    },
    [performJoinRequestAction],
  );

  const denyJoinRequest = useCallback(
    async (conversationId: number, eventId: number, userId: number) => {
      await performJoinRequestAction(conversationId, eventId, userId, "deny");
    },
    [performJoinRequestAction],
  );

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

      if (envelope.type === "message:new") {
        const message = mapServerMessage(envelope.message);
        if (!message) {
          return;
        }

        setMessagesByConversation((prev) => {
          const existing = prev[message.conversationId] ?? [];
          let nextMessages = existing;

          if (envelope.tempId) {
            nextMessages = existing.filter(
              (item) => item.tempId !== envelope.tempId,
            );
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
                    message.senderId === currentUserId ||
                    conversation.id === currentActiveConversationId
                      ? 0
                      : (conversation.unreadCount ?? 0) + 1,
                }
              : conversation,
          );
          return sortConversationsByActivity(updated);
        });
        return;
      }

      if (envelope.type === "conversation:join_request") {
        const { conversationId, action, request } = envelope;
        if (!conversationId || !request || !action) {
          return;
        }

        setJoinRequestsByConversation((prev) => {
          const normalized = normalizeJoinRequest(request);
          const existing = prev[conversationId] ?? [];
          if (action === "created") {
            const filtered = existing.filter(
              (item) => item.id !== normalized.id,
            );
            return {
              ...prev,
              [conversationId]: [...filtered, normalized],
            };
          }
          if (action === "approved" || action === "denied") {
            if (!existing.length) {
              return prev;
            }
            const filtered = existing.filter(
              (item) => item.id !== normalized.id,
            );
            if (filtered.length === existing.length) {
              return prev;
            }
            return {
              ...prev,
              [conversationId]: filtered,
            };
          }
          return prev;
        });
        return;
      }

      if (envelope.type === "conversation:membership") {
        const { conversationId, userId, action } = envelope;
        if (!conversationId || !action) {
          return;
        }

        if (action === "added") {
          refreshConversations().catch(() => undefined);
          return;
        }

        if (action === "removed") {
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
    [mapServerMessage, normalizeJoinRequest, refreshConversations],
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
      setError("Failed to connect to chat.");
      setIsConnecting(false);
      const refreshedToken = await refreshSessionSilently();
      if (refreshedToken) {
        tokenRef.current = refreshedToken;
      }
    };

    socket.onclose = async () => {
      socketRef.current = null;
      setIsConnecting(false);
      if (!manuallyClosedRef.current && user && token) {
        clearReconnectTimeout();
        const refreshedToken = await refreshSessionSilently();
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
        console.error("Failed to parse WS message", err);
      }
    };
  }, [
    clearReconnectTimeout,
    handleServerEnvelope,
    refreshConversations,
    refreshMessages,
    refreshSessionSilently,
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

      if (
        nextState === "active" &&
        (previous === "inactive" || previous === "background")
      ) {
        manuallyClosedRef.current = false;
        connectSocket();
        refreshConversations().catch(() => undefined);
        const conversationId = activeConversationRef.current;
        if (conversationId != null) {
          refreshMessages(conversationId).catch(() => undefined);
        }
        return;
      }

      if (nextState === "background" || nextState === "inactive") {
        manuallyClosedRef.current = true;
        cleanupSocket();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => {
      subscription.remove();
    };
  }, [
    cleanupSocket,
    connectSocket,
    refreshConversations,
    refreshMessages,
    token,
    user,
  ]);

  const sendMessage = useCallback(
    (conversationId: number, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) {
        return;
      }

      const tempId = `${conversationId}-${Date.now()}`;
      const timestamp = new Date().toISOString();

      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN
      ) {
        setError("Chat connection is not ready.");
        connectSocket();

        const failedMessage: ChatMessage = {
          id: tempId,
          conversationId,
          senderId: user?.id ?? 0,
          body: trimmed,
          createdAt: timestamp,
          pending: false,
          tempId,
          failed: true,
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
        return;
      }

      const optimisticMessage: ChatMessage = {
        id: tempId,
        conversationId,
        senderId: user?.id ?? 0,
        body: trimmed,
        createdAt: timestamp,
        pending: true,
        tempId,
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
        type: "message:send",
        conversationId,
        body: trimmed,
        tempId,
      };

      socketRef.current.send(JSON.stringify(payload));
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

      sendMessage(conversationId, message.body);
    },
    [sendMessage],
  );

  const setActiveConversation = useCallback((conversationId: number | null) => {
    setActiveConversationId(conversationId);
    if (conversationId !== null) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation,
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
      isRefreshingConversations,
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
      isRefreshingConversations,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
