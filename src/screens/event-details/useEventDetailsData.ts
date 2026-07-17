import { useEffect, useMemo, useState } from 'react';

import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { API_BASE_URL } from '@api/config';
import { useAuth } from '@context/AuthContext';
import { ChatJoinRequest, useChat } from '@context/ChatContext';
import { useEvents, UserEvent } from '@context/EventsContext';
import { RootStackParamList } from '@navigation/types';
import { getEventAnalyticsParams } from '@services/analytics';
import { logger } from '@services/logger';

export type EventDetailsRoute = RouteProp<
  RootStackParamList,
  'EventDetails' | 'EventDetailsOverlay'
>;
export type EventDetailsNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'EventDetails' | 'EventDetailsOverlay'
>;

export type EventDetailMember = {
  id: number;
  name: string;
  avatar?: string | null;
};

type UseEventDetailsDataArgs = {
  initialEventSnapshot: UserEvent;
  routeEventId: string;
  readOnly: boolean;
  isOverlay: boolean;
  isFocused: boolean;
};

/**
 * Event Details data layer: event snapshot lookup/sync, conversation lookup,
 * request store keys, derived owner/member/request state, going participants,
 * host request polling, read-only members fetch, and the viewer's intro
 * message fetch.
 */
export const useEventDetailsData = ({
  initialEventSnapshot,
  routeEventId,
  readOnly,
  isOverlay,
  isFocused,
}: UseEventDetailsDataArgs) => {
  const { events, isEventRequested } = useEvents();
  const { user, token, authFetch } = useAuth();
  const { conversations, joinRequestsByConversation, refreshJoinRequests, refreshConversations } =
    useChat();

  const rawEvent = useMemo(
    () => events.find((item) => item.id === routeEventId),
    [events, routeEventId],
  );
  const [eventSnapshot, setEventSnapshot] = useState<UserEvent | null>(
    () => rawEvent ?? initialEventSnapshot,
  );
  useEffect(() => {
    if (rawEvent) {
      setEventSnapshot(rawEvent);
    } else {
      setEventSnapshot((prev) => (prev?.id === routeEventId ? prev : initialEventSnapshot));
    }
  }, [initialEventSnapshot, rawEvent, routeEventId]);
  const event = eventSnapshot;

  const [hasPendingRequest, setHasPendingRequest] = useState(() =>
    eventSnapshot ? isEventRequested(eventSnapshot.id) : false,
  );

  useEffect(() => {
    if (!eventSnapshot) {
      setHasPendingRequest(false);
      return;
    }
    setHasPendingRequest(isEventRequested(eventSnapshot.id));
  }, [eventSnapshot, isEventRequested]);

  const [userIntroMessage, setUserIntroMessage] = useState<string | null>(null);
  const [disableHostRequestPolling, setDisableHostRequestPolling] = useState(false);
  const [readOnlyMembers, setReadOnlyMembers] = useState<EventDetailMember[]>([]);
  const [isFetchingReadOnlyMembers, setIsFetchingReadOnlyMembers] = useState(false);
  const [readOnlyMembersError, setReadOnlyMembersError] = useState<string | null>(null);

  useEffect(() => {
    setDisableHostRequestPolling(false);
  }, [routeEventId]);

  const isOwner = event ? user?.id === event.ownerId : false;
  const isSingleEvent = event?.groupType === 'Single';
  const eventAnalyticsParams = getEventAnalyticsParams({
    groupType: event?.groupType,
    gender: event?.gender,
    minAge: event?.minAge,
    maxAge: event?.maxAge,
    scheduledAt: event?.scheduledAt,
  });

  const eventNumericId = useMemo(() => {
    const parsed = Number(event?.id);
    return Number.isNaN(parsed) ? null : parsed;
  }, [event?.id]);
  const eventConversation = useMemo(() => {
    if (eventNumericId == null) {
      return null;
    }
    return conversations.find((conversation) => conversation.eventId === eventNumericId);
  }, [conversations, eventNumericId]);

  useEffect(() => {
    if (!readOnly || isOverlay) {
      setReadOnlyMembers([]);
      setReadOnlyMembersError(null);
      setIsFetchingReadOnlyMembers(false);
      return;
    }
    if (eventNumericId == null || !token) {
      setReadOnlyMembers([]);
      setReadOnlyMembersError(null);
      setIsFetchingReadOnlyMembers(false);
      return;
    }

    let isCancelled = false;
    setIsFetchingReadOnlyMembers(true);
    setReadOnlyMembersError(null);

    const fetchMembers = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/events/${eventNumericId}/members`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload: { data?: EventDetailMember[] } = await response.json().catch(() => ({}));
        if (!isCancelled) {
          setReadOnlyMembers(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (err) {
        if (!isCancelled) {
          logger.error('Failed to fetch event members', err);
          setReadOnlyMembers([]);
          setReadOnlyMembersError('Unable to load members right now.');
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingReadOnlyMembers(false);
        }
      }
    };

    fetchMembers();
    return () => {
      isCancelled = true;
    };
  }, [authFetch, eventNumericId, isOverlay, readOnly, token]);

  const eventConversationId = eventConversation?.id ?? null;
  const requestStoreKey = useMemo(() => {
    if (eventNumericId == null) {
      return null;
    }
    if (eventConversationId != null) {
      return eventConversationId;
    }
    // For 1:1 host flows, pending requests may exist before any conversation exists.
    return isSingleEvent ? -eventNumericId : null;
  }, [eventConversationId, eventNumericId, isSingleEvent]);
  const eventScopedRequestStoreKey = useMemo(() => {
    if (eventNumericId == null) {
      return null;
    }
    // Event-scoped cache key used as a stable fallback for host request state.
    return -eventNumericId;
  }, [eventNumericId]);
  const hostRequestStoreKey = useMemo(() => {
    if (!isOwner) {
      return requestStoreKey;
    }
    return requestStoreKey ?? eventScopedRequestStoreKey;
  }, [isOwner, requestStoreKey, eventScopedRequestStoreKey]);

  const isConversationMember = useMemo(() => {
    if (!user || !eventConversation) {
      return false;
    }
    return eventConversation.memberIds.includes(user.id);
  }, [eventConversation, user]);
  const fallbackHostParticipant = useMemo(
    () =>
      event
        ? {
            id: event.ownerId,
            name: event.hostName,
            avatar: event.hostAvatar,
          }
        : null,
    [event?.hostAvatar, event?.ownerId, event?.hostName],
  );
  const goingParticipants = useMemo(() => {
    if (eventConversation?.participants?.length) {
      const memberSet = new Set(eventConversation.memberIds ?? []);
      return eventConversation.participants.filter((p) => memberSet.has(p.id));
    }
    return fallbackHostParticipant ? [fallbackHostParticipant] : [];
  }, [eventConversation, fallbackHostParticipant]);
  const goingCount = useMemo(() => {
    if (!eventConversation) {
      return 1;
    }
    const memberCount =
      eventConversation.memberIds?.length ?? eventConversation.participants?.length ?? 0;
    return memberCount > 0 ? memberCount : 1;
  }, [eventConversation]);

  useEffect(() => {
    if (isConversationMember) {
      setHasPendingRequest(false);
    }
  }, [isConversationMember]);

  // Keep host-side requests fresh while viewing details.
  useEffect(() => {
    const shouldLoadAcceptedOverlay = isOverlay && isSingleEvent;
    if (
      !isFocused ||
      !rawEvent ||
      !isOwner ||
      !event ||
      hostRequestStoreKey == null ||
      eventNumericId == null ||
      disableHostRequestPolling ||
      (readOnly && !shouldLoadAcceptedOverlay)
    ) {
      return;
    }

    const refreshHostRequests = () => {
      refreshConversations().catch((err) => {
        logger.error('Failed to refresh conversations for host details', err);
      });
      refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
        includeApproved: isSingleEvent,
      }).catch((err: unknown) => {
        const status =
          typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          typeof (err as { status?: unknown }).status === 'number'
            ? ((err as { status?: number }).status ?? undefined)
            : undefined;
        if (status === 404) {
          setDisableHostRequestPolling(true);
        }
      });
    };

    refreshHostRequests();
    const interval = setInterval(() => {
      refreshHostRequests();
    }, 5000);
    return () => clearInterval(interval);
  }, [
    isFocused,
    rawEvent,
    isOwner,
    event,
    hostRequestStoreKey,
    eventNumericId,
    refreshJoinRequests,
    refreshConversations,
    isOverlay,
    isSingleEvent,
    disableHostRequestPolling,
    readOnly,
  ]);

  const hostRequests = useMemo(() => {
    if (hostRequestStoreKey == null) {
      return [];
    }
    const primary = joinRequestsByConversation[hostRequestStoreKey] ?? [];
    if (eventScopedRequestStoreKey == null || eventScopedRequestStoreKey === hostRequestStoreKey) {
      return primary;
    }

    const fallback = joinRequestsByConversation[eventScopedRequestStoreKey] ?? [];
    if (fallback.length === 0) {
      return primary;
    }
    if (primary.length === 0) {
      return fallback;
    }

    const merged = new Map<number, ChatJoinRequest>();
    for (const item of fallback) {
      merged.set(item.id, item);
    }
    for (const item of primary) {
      merged.set(item.id, item);
    }
    return Array.from(merged.values());
  }, [joinRequestsByConversation, hostRequestStoreKey, eventScopedRequestStoreKey]);
  const pendingRequests = useMemo(
    () => hostRequests.filter((request) => request.status === 'pending'),
    [hostRequests],
  );
  const acceptedRequests = useMemo(
    () => hostRequests.filter((request) => request.status === 'approved'),
    [hostRequests],
  );

  // Get confirmed members (excluding host)
  const confirmedMembers = useMemo(() => {
    if (!eventConversation || !user) return [];
    const memberSet = new Set(eventConversation.memberIds ?? []);
    return eventConversation.participants.filter((p) => p.id !== user.id && memberSet.has(p.id));
  }, [eventConversation, user]);

  // Overlay: all members with host sorted to top (for group events)
  const overlayMembers = useMemo(() => {
    if (!eventConversation) return [];
    const memberSet = new Set(eventConversation.memberIds ?? []);
    const allMembers = eventConversation.participants.filter((p) => memberSet.has(p.id));
    const hostId = event?.ownerId;
    return [...allMembers].sort((a, b) => {
      if (a.id === hostId) return -1;
      if (b.id === hostId) return 1;
      return 0;
    });
  }, [eventConversation, event?.ownerId]);

  // Fetch the user's introduction message when they have a pending request or are a member
  useEffect(() => {
    const shouldFetch = (hasPendingRequest || isConversationMember) && !isOwner && !readOnly;
    if (!shouldFetch || !token || !event) {
      setUserIntroMessage(null);
      return;
    }

    const fetchUserRequest = async () => {
      try {
        const response = await authFetch(
          `${API_BASE_URL}/api/chat/requests/me?include_approved=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => ({}));
        const requests = payload.requests ?? [];
        const matchingRequest = requests.find(
          (req: { event_id?: number; eventId?: number }) =>
            (req.event_id ?? req.eventId) === Number(event.id),
        );
        if (matchingRequest?.message) {
          setUserIntroMessage(matchingRequest.message);
        }
      } catch (err) {
        logger.error('Failed to fetch user join request', err);
      }
    };

    fetchUserRequest();
  }, [authFetch, hasPendingRequest, isConversationMember, token, event, isOwner]);

  return {
    rawEvent,
    event,
    isOwner,
    isSingleEvent,
    eventAnalyticsParams,
    eventNumericId,
    eventConversation,
    requestStoreKey,
    hostRequestStoreKey,
    isConversationMember,
    goingParticipants,
    goingCount,
    pendingRequests,
    acceptedRequests,
    confirmedMembers,
    overlayMembers,
    hasPendingRequest,
    setHasPendingRequest,
    userIntroMessage,
    setUserIntroMessage,
    setDisableHostRequestPolling,
    readOnlyMembers,
    isFetchingReadOnlyMembers,
    readOnlyMembersError,
  };
};
