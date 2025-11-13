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
import {
  CoverKey,
  DEFAULT_COVER_KEY,
  resolveCoverUri,
} from "@constants/covers";

export type DateLabel = "Today" | "Tmrw";

export interface UserEvent extends EventItemProps {
  dateLabel: DateLabel;
  description?: string;
  ownerId: number;
  hostName: string;
  gender: string;
  minAge: number;
  maxAge: number;
  coverKey?: CoverKey | null;
}

interface CreateEventInput {
  title: string;
  location: string;
  time: string;
  description?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  dateLabel: DateLabel;
  badgeLabel?: string;
  coverKey: CoverKey;
  userId: number;
  hostName: string;
}

interface UpdateEventInput {
  title: string;
  location: string;
  time: string;
  description?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  dateLabel: DateLabel;
  badgeLabel?: string | null;
  coverKey?: CoverKey | null;
}

export interface GuestEventDraft {
  title: string;
  location: string;
  time: string;
  description?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  dateLabel: DateLabel;
  badgeLabel?: string;
  coverKey: CoverKey;
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
  date_label: DateLabel;
  user_id: number;
  host_name: string;
  cover_key?: CoverKey | null;
};

interface EventMeta {
  badgeLabel?: string;
}

const formatAudience = (gender: string, minAge: number, maxAge: number) => {
  const genderLabel = gender.toLowerCase() === "any" ? "Any gender" : gender;
  return `${genderLabel}, ${minAge} to ${maxAge} years`;
};

const mapApiEvent = (
  event: ApiEvent,
  meta: EventMeta | undefined,
): UserEvent => ({
  id: String(event.id),
  title: event.title,
  location: event.location,
  time: event.time,
  audience: formatAudience(event.gender, event.min_age, event.max_age),
  imageUri: resolveCoverUri(event.cover_key),
  badgeLabel: meta?.badgeLabel,
  dateLabel: event.date_label,
  description: event.description,
  ownerId: event.user_id,
  hostName: event.host_name,
  gender: event.gender,
  minAge: event.min_age,
  maxAge: event.max_age,
  coverKey: event.cover_key ?? null,
});

export const EventsProvider = ({ children }: { children: ReactNode }) => {
  const { user, token } = useAuth();
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGuestEvent, setPendingGuestEvent] =
    useState<GuestEventDraft | null>(null);
  const metaRef = useRef<Record<string, EventMeta>>({});
  const [requestedEventIds, setRequestedEventIds] = useState<Set<string>>(
    () => new Set(),
  );

  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload: { data: ApiEvent[] } = await response.json();
      const nextEvents = payload.data.map((event) =>
        mapApiEvent(event, metaRef.current[String(event.id)]),
      );
      setEvents(nextEvents);
    } catch (err) {
      console.error("Failed to fetch events", err);
      setError("Unable to load events. Pull to refresh.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const refreshRequestedEvents = useCallback(async () => {
    if (!user || !token) {
      setRequestedEventIds(new Set());
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/requests/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
      setRequestedEventIds(ids);
    } catch (err) {
      console.error("Failed to fetch requested events", err);
      setRequestedEventIds(new Set());
    }
  }, [token, user]);

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

  const addUserEvent = useCallback(
    async (event: CreateEventInput) => {
      if (!token) {
        throw new Error("You must be signed in to create an event.");
      }

      const payload = {
        title: event.title,
        location: event.location,
        time: event.time,
        description: event.description ?? "",
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        date_label: event.dateLabel,
        user_id: event.userId,
        cover_key: event.coverKey ?? DEFAULT_COVER_KEY,
      };

      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      const { id } = (await response.json()) as { id: number };
      const eventId = String(id);

      metaRef.current = {
        ...metaRef.current,
        [eventId]: {
          badgeLabel: event.badgeLabel,
        },
      };

      const optimisticEvent: ApiEvent = {
        id,
        title: event.title,
        location: event.location,
        time: event.time,
        description: event.description,
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        date_label: event.dateLabel,
        user_id: event.userId,
        host_name: event.hostName,
        cover_key: event.coverKey ?? DEFAULT_COVER_KEY,
      };

      setEvents((prev) => {
        const withoutNew = prev.filter((item) => item.id !== eventId);
        return [
          mapApiEvent(optimisticEvent, metaRef.current[eventId]),
          ...withoutNew,
        ];
      });

      await refreshEvents();

      return eventId;
    },
    [refreshEvents, token],
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
        date_label: event.dateLabel,
        ...(event.coverKey !== undefined ? { cover_key: event.coverKey } : {}),
      };

      if (!token) {
        throw new Error("You must be signed in to update an event.");
      }

      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
          ...(event.badgeLabel !== undefined
            ? { badgeLabel: event.badgeLabel ?? undefined }
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

      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
          description: pendingGuestEvent.description,
          gender: pendingGuestEvent.gender,
          minAge: pendingGuestEvent.minAge,
          maxAge: pendingGuestEvent.maxAge,
          dateLabel: pendingGuestEvent.dateLabel,
          badgeLabel: pendingGuestEvent.badgeLabel,
          coverKey: pendingGuestEvent.coverKey ?? DEFAULT_COVER_KEY,
          userId: user.id,
          hostName: user.name,
        });
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
  }, [refreshEvents]);

  useEffect(() => {
    if (!user || !token) {
      setRequestedEventIds(new Set());
      return;
    }
    refreshRequestedEvents().catch(() => undefined);
  }, [refreshRequestedEvents, token, user]);

  const userEvents = useMemo(() => {
    if (!user) {
      return [];
    }

    return events.filter((event) => event.ownerId === user.id);
  }, [events, user]);

  const requestedEvents = useMemo(() => {
    if (!requestedEventIds.size) {
      return [];
    }
    return events.filter((event) => requestedEventIds.has(event.id));
  }, [events, requestedEventIds]);

  const value = useMemo(
    () => ({
      events,
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
    }),
    [
      events,
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
