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
// TODO: replace in-memory state with persisted cache for offline support when API integration stabilises.

import { EventItemProps } from "@components/EventCard";
import { API_BASE_URL } from "@api/config";
import { useAuth } from "@context/AuthContext";
import { getEventAnalyticsParams, trackEvent } from "@services/analytics";
import {
  CoverKey,
  DEFAULT_COVER_KEY,
  resolveCoverUri,
} from "@constants/covers";
import {
  getLegacyDateLabel,
  getScheduleDisplay,
  parseDateKey,
  timeStringToMinutes,
} from "@utils/dateTime";
import { formatAudienceLabel } from "@utils/eventDisplay";
import { navigationRef } from "../navigation/navigationRef";

export type DateLabel = string;

export interface UserEvent extends EventItemProps {
  dateLabel: DateLabel;
  eventDate: string;
  description?: string;
  ownerId: number;
  hostName: string;
  hostAvatar?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  groupType: "Single" | "Group";
  coverKey?: CoverKey | null;
  scheduledAt?: string; // ISO 8601 UTC timestamp
  createdAt?: string; // ISO 8601 UTC timestamp
}

interface CreateEventInput {
  title: string;
  location: string;
  time: string;
  eventDate: string;
  dateLabel?: DateLabel;
  description?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  groupType: "Single" | "Group";
  badgeLabel?: string;
  coverKey: CoverKey;
  userId: number;
  hostName: string;
  scheduledAt?: string; // ISO 8601 UTC timestamp
}

interface UpdateEventInput {
  title: string;
  location: string;
  time: string;
  eventDate: string;
  dateLabel?: DateLabel;
  description?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  groupType: "Single" | "Group";
  badgeLabel?: string | null;
  coverKey?: CoverKey | null;
  scheduledAt?: string; // ISO 8601 UTC timestamp
}

export interface GuestEventDraft {
  title: string;
  location: string;
  time: string;
  eventDate: string;
  dateLabel?: DateLabel;
  description?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  groupType: "Single" | "Group";
  badgeLabel?: string;
  coverKey: CoverKey;
  scheduledAt?: string; // ISO 8601 UTC timestamp
}

interface EventsContextValue {
  events: UserEvent[];
  userEvents: UserEvent[];
  requestedEvents: UserEvent[];
  isLoading: boolean;
  error: string | null;
  refreshEvents: () => Promise<void>;
  refreshRequestedEvents: () => Promise<void>;
  addUserEvent: (event: CreateEventInput) => Promise<string>;
  updateUserEvent: (eventId: string, event: UpdateEventInput) => Promise<void>;
  deleteUserEvent: (eventId: string) => Promise<void>;
  queueGuestEvent: (draft: GuestEventDraft) => void;
  markEventRequested: (eventId: string) => void;
  isEventRequested: (eventId: string) => boolean;
  unmarkEventRequested: (eventId: string) => void;
  markEventReported: (eventId: string) => void;
  isEventReported: (eventId: string) => boolean;
}

const EventsContext = createContext<EventsContextValue | undefined>(undefined);

type ApiEvent = {
  id: number;
  title: string;
  location: string;
  time: string;
  description?: string;
  gender: string;
  min_age: number;
  max_age: number;
  date_label: string;
  event_date: string;
  group_type?: "Single" | "Group";
  user_id: number;
  host_name: string;
  host_avatar?: string | null;
  cover_key?: CoverKey | null;
  scheduled_at?: string; // ISO 8601 UTC timestamp
  created_at?: string; // ISO 8601 UTC timestamp
};

interface EventMeta {
  badgeLabel?: string;
}

const REFRESH_TIMEOUT_MS = 10_000;

const createRequestTimeout = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
};

const isAbortError = (err: unknown) =>
  err instanceof Error && err.name === "AbortError";

const deriveDateLabelFromDate = (eventDate: string): DateLabel => {
  return getLegacyDateLabel(eventDate);
};

const getScheduledAtMillis = (scheduledAt?: string) => {
  if (!scheduledAt) {
    return null;
  }
  const parsed = Date.parse(scheduledAt);
  return Number.isNaN(parsed) ? null : parsed;
};

const isUpcomingEvent = (eventDate: string, _timeLabel: string, scheduledAt?: string) => {
  const scheduledTime = getScheduledAtMillis(scheduledAt);
  if (scheduledTime != null) {
    return scheduledTime > Date.now();
  }

  // Fall back to legacy date-only check
  const parsedDate = parseDateKey(eventDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!parsedDate) {
    return false;
  }
  return parsedDate.getTime() >= today.getTime();
};

const sortEventsBySchedule = (a: UserEvent, b: UserEvent) => {
  const scheduledTimeA = getScheduledAtMillis(a.scheduledAt);
  const scheduledTimeB = getScheduledAtMillis(b.scheduledAt);
  if (scheduledTimeA != null && scheduledTimeB != null) {
    return scheduledTimeA - scheduledTimeB;
  }
  if (a.eventDate === b.eventDate) {
    const timeA = timeStringToMinutes(a.time) ?? 0;
    const timeB = timeStringToMinutes(b.time) ?? 0;
    if (timeA === timeB) {
      return 0;
    }
    return timeA - timeB;
  }
  return a.eventDate.localeCompare(b.eventDate);
};

const mapApiEvent = (
  event: ApiEvent,
  meta: EventMeta | undefined,
): UserEvent => {
  const groupType = event.group_type ?? "Single";
  const schedule = getScheduleDisplay({
    scheduledAt: event.scheduled_at,
    eventDate: event.event_date,
    time: event.time,
    dateLabel: event.date_label,
  });

  return {
    id: String(event.id),
    title: event.title,
    location: event.location,
    time: schedule.displayTime,
    audience: formatAudienceLabel({
      gender: event.gender,
      minAge: event.min_age,
      maxAge: event.max_age,
    }),
    imageUri: resolveCoverUri(event.cover_key),
    badgeLabel: groupType === "Group" ? "Group" : meta?.badgeLabel,
    dateLabel: schedule.displayLabel,
    eventDate: schedule.displayDate,
    description: event.description,
    ownerId: event.user_id,
    hostName: event.host_name,
    hostAvatar: event.host_avatar ?? undefined,
    gender: event.gender,
    minAge: event.min_age,
    maxAge: event.max_age,
    groupType,
    coverKey: event.cover_key ?? null,
    scheduledAt: event.scheduled_at,
    createdAt: event.created_at,
  };
};

export const EventsProvider = ({ children }: { children: ReactNode }) => {
  const { user, token, authFetch } = useAuth();
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGuestEvent, setPendingGuestEvent] =
    useState<GuestEventDraft | null>(null);
  const metaRef = useRef<Record<string, EventMeta>>({});
  const [requestedEventIds, setRequestedEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [reportedEventIds, setReportedEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const eventsRequestIdRef = useRef(0);
  const requestedEventsRequestIdRef = useRef(0);
  const resetRequestedEventIds = useCallback(() => {
    setRequestedEventIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      return new Set();
    });
  }, []);
  const authFetchRef = useRef(authFetch);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const refreshEvents = useCallback(async () => {
    const requestId = eventsRequestIdRef.current + 1;
    eventsRequestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);
    const fetchClient = authFetchRef.current;
    if (!fetchClient) {
      if (requestId === eventsRequestIdRef.current) {
        setIsLoading(false);
      }
      return;
    }
    const timeout = createRequestTimeout(REFRESH_TIMEOUT_MS);
    try {
      const response = await fetchClient(`${API_BASE_URL}/api/events`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
        signal: timeout.signal,
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload: { data: ApiEvent[] | null } = await response.json();
      const nextEvents = (payload.data ?? [])
        .map((event) => mapApiEvent(event, metaRef.current[String(event.id)]))
        .filter((event) => isUpcomingEvent(event.eventDate, event.time, event.scheduledAt))
        .sort(sortEventsBySchedule);
      if (requestId !== eventsRequestIdRef.current) {
        return;
      }
      setEvents(nextEvents);
    } catch (err) {
      if (requestId !== eventsRequestIdRef.current) {
        return;
      }
      console.error("Failed to fetch events", err);
      if (isAbortError(err)) {
        setError("Unable to load events. Request timed out.");
      } else {
        setError("Unable to load events. Pull to refresh.");
      }
    } finally {
      timeout.clear();
      if (requestId === eventsRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [token]);

  const refreshRequestedEvents = useCallback(async () => {
    const requestId = requestedEventsRequestIdRef.current + 1;
    requestedEventsRequestIdRef.current = requestId;
    if (!user || !token) {
      resetRequestedEventIds();
      return;
    }
    const fetchClient = authFetchRef.current;
    if (!fetchClient) {
      resetRequestedEventIds();
      return;
    }
    const timeout = createRequestTimeout(REFRESH_TIMEOUT_MS);
    try {
      const response = await fetchClient(`${API_BASE_URL}/api/chat/requests/me`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
        signal: timeout.signal,
      });

      if (response.status === 401) {
        // authFetch already attempted refresh; treat remaining 401 as session transition.
        if (requestId !== requestedEventsRequestIdRef.current) {
          return;
        }
        resetRequestedEventIds();
        return;
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = (await response.json().catch(() => ({}))) as {
        requests?: Array<{ eventId?: number; event_id?: number }>;
      };
      const ids = new Set<string>();
      (payload.requests ?? []).forEach((request) => {
        const idValue = request.eventId ?? request.event_id;
        if (idValue != null) {
          ids.add(String(idValue));
        }
      });
      if (requestId !== requestedEventsRequestIdRef.current) {
        return;
      }
      setRequestedEventIds(ids);
    } catch (err) {
      if (requestId !== requestedEventsRequestIdRef.current) {
        return;
      }
      console.error("Failed to fetch requested events", err);
      resetRequestedEventIds();
    } finally {
      timeout.clear();
    }
  }, [resetRequestedEventIds, token, user]);

  const markEventRequested = useCallback((eventId: string) => {
    setRequestedEventIds((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  }, []);

  const isEventRequested = useCallback(
    (eventId: string) => requestedEventIds.has(eventId),
    [requestedEventIds],
  );

  const unmarkEventRequested = useCallback((eventId: string) => {
    setRequestedEventIds((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }, []);

  const markEventReported = useCallback((eventId: string) => {
    setReportedEventIds((prev) => new Set(prev).add(eventId));
  }, []);

  const isEventReported = useCallback(
    (eventId: string) => reportedEventIds.has(eventId),
    [reportedEventIds],
  );

  const addUserEvent = useCallback(
    async (event: CreateEventInput) => {
      if (!token) {
        throw new Error("You must be signed in to create an event.");
      }
      const fetchClient = authFetchRef.current;
      if (!fetchClient) {
        throw new Error("Unable to submit event at this time.");
      }

      const derivedLabel = deriveDateLabelFromDate(event.eventDate);
      const payload = {
        title: event.title,
        location: event.location,
        time: event.time,
        description: event.description ?? "",
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        event_date: event.eventDate,
        date_label: event.dateLabel ?? derivedLabel,
        group_type: event.groupType,
        cover_key: event.coverKey ?? DEFAULT_COVER_KEY,
        ...(event.scheduledAt ? { scheduled_at: event.scheduledAt } : {}),
      };
      const analyticsParams = getEventAnalyticsParams({
        groupType: event.groupType,
        gender: event.gender,
        minAge: event.minAge,
        maxAge: event.maxAge,
        scheduledAt: event.scheduledAt,
      });

      trackEvent("event_create_submitted", analyticsParams).catch(
        () => undefined,
      );

      let response: Response;
      try {
        response = await fetchClient(`${API_BASE_URL}/api/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        trackEvent("event_create_failed", {
          ...analyticsParams,
          reason_category: "network_error",
        }).catch(() => undefined);
        throw error;
      }

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) {
            message = data.error;
          }
        } catch {
          // ignore JSON parse errors and fall back to generic message
        }
        trackEvent("event_create_failed", {
          ...analyticsParams,
          status_code: response.status,
          reason_category: "api_error",
        }).catch(() => undefined);
        throw new Error(message);
      }

      const { id } = (await response.json()) as { id: number };
      const eventId = String(id);

      trackEvent("event_create_succeeded", analyticsParams).catch(
        () => undefined,
      );

      metaRef.current = {
        ...metaRef.current,
        [eventId]: {
          badgeLabel: event.groupType === "Group" ? "Group" : event.badgeLabel,
        },
      };

      const optimisticEvent: ApiEvent = {
        id,
        title: event.title,
        location: event.location,
        time: event.time,
        event_date: event.eventDate,
        description: event.description,
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        date_label: event.dateLabel ?? derivedLabel,
        group_type: event.groupType,
        user_id: event.userId,
        host_name: event.hostName,
        host_avatar: user?.avatar,
        cover_key: event.coverKey ?? DEFAULT_COVER_KEY,
        scheduled_at: event.scheduledAt,
      };

      setEvents((prev) => {
        const withoutNew = prev.filter((item) => item.id !== eventId);
        const optimistic = mapApiEvent(optimisticEvent, metaRef.current[eventId]);
        const next = [optimistic, ...withoutNew].filter((item) =>
          isUpcomingEvent(item.eventDate, item.time, item.scheduledAt),
        );
        next.sort(sortEventsBySchedule);
        return next;
      });

      await refreshEvents();

      return eventId;
    },
    [refreshEvents, token, user?.avatar],
  );

  const updateUserEvent = useCallback(
    async (eventId: string, event: UpdateEventInput) => {
      const payload = {
        title: event.title,
        location: event.location,
        time: event.time,
        description: event.description ?? "",
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        event_date: event.eventDate,
        date_label: event.dateLabel ?? deriveDateLabelFromDate(event.eventDate),
        group_type: event.groupType,
        ...(event.coverKey !== undefined ? { cover_key: event.coverKey } : {}),
        ...(event.scheduledAt ? { scheduled_at: event.scheduledAt } : {}),
      };

      if (!token) {
        throw new Error("You must be signed in to update an event.");
      }

      const fetchClient = authFetchRef.current;
      if (!fetchClient) {
        throw new Error("Unable to update event at this time.");
      }

      const response = await fetchClient(`${API_BASE_URL}/api/events/${eventId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      metaRef.current = {
        ...metaRef.current,
        [eventId]: {
          ...metaRef.current[eventId],
          ...(event.groupType !== undefined
            ? {
                badgeLabel:
                  event.groupType === "Group"
                    ? "Group"
                    : event.badgeLabel ?? undefined,
              }
            : {}),
        },
      };

      await refreshEvents();
    },
    [refreshEvents, token],
  );

  const deleteUserEvent = useCallback(
    async (eventId: string) => {
      if (!token) {
        throw new Error("You must be signed in to delete an event.");
      }

      const fetchClient = authFetchRef.current;
      if (!fetchClient) {
        throw new Error("Unable to delete event at this time.");
      }

      const response = await fetchClient(`${API_BASE_URL}/api/events/${eventId}`, {
        method: "DELETE",
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      if (!response.ok) {
        const message = `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      await refreshEvents();
    },
    [refreshEvents, token],
  );

  const queueGuestEvent = useCallback((draft: GuestEventDraft) => {
    setPendingGuestEvent(draft);
  }, []);

  useEffect(() => {
    if (!user || !pendingGuestEvent) {
      return;
    }

    let cancelled = false;

    const submitGuestEvent = async () => {
      try {
        await addUserEvent({
          title: pendingGuestEvent.title,
          location: pendingGuestEvent.location,
          time: pendingGuestEvent.time,
          eventDate: pendingGuestEvent.eventDate,
          dateLabel: pendingGuestEvent.dateLabel,
          description: pendingGuestEvent.description,
          gender: pendingGuestEvent.gender,
          minAge: pendingGuestEvent.minAge,
          maxAge: pendingGuestEvent.maxAge,
          groupType: pendingGuestEvent.groupType,
          badgeLabel: pendingGuestEvent.badgeLabel,
          coverKey: pendingGuestEvent.coverKey ?? DEFAULT_COVER_KEY,
          userId: user.id,
          hostName: user.name,
          scheduledAt: pendingGuestEvent.scheduledAt,
        });

        if (navigationRef.isReady()) {
          (navigationRef as any).navigate("Main", {
            screen: "MyEvents",
            params: { showEventCreatedBadge: true },
          });
        }
      } catch (err) {
        console.error("Failed to submit queued guest event", err);
      } finally {
        if (!cancelled) {
          setPendingGuestEvent(null);
        }
      }
    };

    submitGuestEvent().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [addUserEvent, pendingGuestEvent, token, user]);

  useEffect(() => {
    refreshEvents().catch(() => undefined);
  }, [refreshEvents, token]);

  useEffect(() => {
    if (!user || !token) {
      resetRequestedEventIds();
      return;
    }
    refreshRequestedEvents().catch(() => undefined);
  }, [refreshRequestedEvents, resetRequestedEventIds, token, user]);

  const visibleEvents = useMemo(() => {
    if (reportedEventIds.size === 0) return events;
    return events.filter((event) => !reportedEventIds.has(event.id));
  }, [events, reportedEventIds]);

  const userEvents = useMemo(() => {
    if (!user) {
      return [];
    }

    return visibleEvents.filter((event) => event.ownerId === user.id);
  }, [visibleEvents, user]);

  const requestedEvents = useMemo(() => {
    if (!requestedEventIds.size) {
      return [];
    }
    return visibleEvents.filter((event) => requestedEventIds.has(event.id));
  }, [visibleEvents, requestedEventIds]);

  const value = useMemo(
    () => ({
      events: visibleEvents,
      userEvents,
      requestedEvents,
      isLoading,
      error,
      refreshEvents,
      refreshRequestedEvents,
      addUserEvent,
      updateUserEvent,
      deleteUserEvent,
      queueGuestEvent,
      markEventRequested,
      isEventRequested,
      unmarkEventRequested,
      markEventReported,
      isEventReported,
    }),
    [
      visibleEvents,
      userEvents,
      requestedEvents,
      isLoading,
      error,
      refreshEvents,
      refreshRequestedEvents,
      addUserEvent,
      updateUserEvent,
      deleteUserEvent,
      queueGuestEvent,
      markEventRequested,
      isEventRequested,
      unmarkEventRequested,
      markEventReported,
      isEventReported,
    ],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
};

export const useEvents = () => {
  const context = useContext(EventsContext);

  if (!context) {
    throw new Error("useEvents must be used within an EventsProvider");
  }

  return context;
};
