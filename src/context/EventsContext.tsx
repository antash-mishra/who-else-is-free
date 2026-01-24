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
  eventDate: string;
  description?: string;
  ownerId: number;
  hostName: string;
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
  event_date: string;
  group_type?: "Single" | "Group";
  user_id: number;
  host_name: string;
  cover_key?: CoverKey | null;
  scheduled_at?: string; // ISO 8601 UTC timestamp
  created_at?: string; // ISO 8601 UTC timestamp
};

interface EventMeta {
  badgeLabel?: string;
}

const formatAudience = (gender: string, minAge: number, maxAge: number) => {
  const genderLabel = gender.toLowerCase() === "any" ? "Any gender" : gender;
  return `${genderLabel}, ${minAge} to ${maxAge} years`;
};

const parseTimeToMinutes = (timeLabel: string) => {
  const match = timeLabel.trim().toLowerCase().match(/(\d{1,2}):(\d{2})(am|pm)?/);
  if (!match) {
    return null;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3];

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  if (meridiem) {
    if (meridiem === "pm" && hours !== 12) {
      hours += 12;
    }
    if (meridiem === "am" && hours === 12) {
      hours = 0;
    }
  }

  return hours * 60 + minutes;
};

const deriveDateLabelFromDate = (eventDate: string): DateLabel => {
  const [year, month, day] = eventDate.split("-").map((part) => Number(part));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    day < 1
  ) {
    return "Today";
  }
  const parsed = new Date(year, month - 1, day);
  const diffDays = Math.floor(
    (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diffDays === 1 ? "Tmrw" : "Today";
};

const isUpcomingEvent = (eventDate: string, _timeLabel: string, scheduledAt?: string) => {
  // If scheduled_at is present, use it for precise time comparison
  if (scheduledAt) {
    const scheduledTime = new Date(scheduledAt).getTime();
    return scheduledTime > Date.now();
  }

  // Fall back to legacy date-only check
  const [year, month, day] = eventDate.split("-").map((part) => Number(part));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    day < 1
  ) {
    return false;
  }
  const parsedDate = new Date(year, month - 1, day);
  const diffDays = Math.floor(
    (parsedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (Number.isNaN(diffDays)) {
    return false;
  }
  if (diffDays < 0 || diffDays > 1) {
    return false;
  }
  // We intentionally avoid filtering by time-of-day here. The mobile app
  // already guides users to choose a future time, and relying on the device
  // timezone avoids discrepancies with the server clock. Treat any event for
  // today or tomorrow as "upcoming" so it always appears in the list.
  return true;
};

const sortEventsBySchedule = (a: UserEvent, b: UserEvent) => {
  if (a.eventDate === b.eventDate) {
    const timeA = parseTimeToMinutes(a.time) ?? 0;
    const timeB = parseTimeToMinutes(b.time) ?? 0;
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

  // If scheduled_at is present, derive display values from it (in local timezone)
  let displayTime = event.time;
  let displayDate = event.event_date;
  let displayLabel: DateLabel;

  if (event.scheduled_at) {
    const utcDate = new Date(event.scheduled_at);
    // Format time in local timezone (24-hour format)
    displayTime = utcDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    // Format date in local timezone (YYYY-MM-DD)
    displayDate = `${utcDate.getFullYear()}-${String(utcDate.getMonth() + 1).padStart(2, "0")}-${String(utcDate.getDate()).padStart(2, "0")}`;
    displayLabel = deriveDateLabelFromDate(displayDate);
  } else {
    displayLabel = deriveDateLabelFromDate(event.event_date);
  }

  return {
    id: String(event.id),
    title: event.title,
    location: event.location,
    time: displayTime,
    audience: formatAudience(event.gender, event.min_age, event.max_age),
    imageUri: resolveCoverUri(event.cover_key),
    badgeLabel: groupType === "Group" ? "Group" : meta?.badgeLabel,
    dateLabel: displayLabel,
    eventDate: displayDate,
    description: event.description,
    ownerId: event.user_id,
    hostName: event.host_name,
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
  const { user, token, refreshSessionSilently } = useAuth();
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

      const payload: { data: ApiEvent[] | null } = await response.json();
      const nextEvents = (payload.data ?? [])
        .map((event) => mapApiEvent(event, metaRef.current[String(event.id)]))
        .filter((event) => isUpcomingEvent(event.eventDate, event.time, event.scheduledAt))
        .sort(sortEventsBySchedule);
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
      let response = await fetch(`${API_BASE_URL}/api/chat/requests/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle 401 by refreshing token and retrying
      if (response.status === 401) {
        const refreshedToken = await refreshSessionSilently();
        if (refreshedToken) {
          response = await fetch(`${API_BASE_URL}/api/chat/requests/me`, {
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
            },
          });
        }
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
      setRequestedEventIds(ids);
    } catch (err) {
      console.error("Failed to fetch requested events", err);
      setRequestedEventIds(new Set());
    }
  }, [token, user, refreshSessionSilently]);

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

  const addUserEvent = useCallback(
    async (event: CreateEventInput) => {
      if (!token) {
        throw new Error("You must be signed in to create an event.");
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

      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

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
        throw new Error(message);
      }

      const { id } = (await response.json()) as { id: number };
      const eventId = String(id);

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
        event_date: event.eventDate,
        date_label: event.dateLabel ?? deriveDateLabelFromDate(event.eventDate),
        group_type: event.groupType,
        ...(event.coverKey !== undefined ? { cover_key: event.coverKey } : {}),
        ...(event.scheduledAt ? { scheduled_at: event.scheduledAt } : {}),
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
      unmarkEventRequested,
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
      unmarkEventRequested,
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
