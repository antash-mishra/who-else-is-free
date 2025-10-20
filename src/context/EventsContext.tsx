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
// TODO: replace in-memory state with persisted cache for offline support when API integration stabilises.

import { EventItemProps } from '@components/EventCard';
import { API_BASE_URL } from '@api/config';
import { useAuth } from '@context/AuthContext';

export type DateLabel = 'Today' | 'Tmrw';

export interface UserEvent extends EventItemProps {
  dateLabel: DateLabel;
  description?: string;
  ownerId: number;
  hostName: string;
  gender: string;
  minAge: number;
  maxAge: number;
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
  imageUri?: string;
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
  imageUri?: string;
}

interface EventsContextValue {
  events: UserEvent[];
  userEvents: UserEvent[];
  isLoading: boolean;
  error: string | null;
  refreshEvents: () => Promise<void>;
  addUserEvent: (event: CreateEventInput) => Promise<string>;
  updateUserEvent: (eventId: string, event: UpdateEventInput) => Promise<void>;
  deleteUserEvent: (eventId: string) => Promise<void>;
  queueGuestEvent: (draft: GuestEventDraft) => void;
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
};

interface EventMeta {
  badgeLabel?: string;
  imageUri?: string;
}

export const DEFAULT_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=400&q=80';

const formatAudience = (gender: string, minAge: number, maxAge: number) => {
  const genderLabel = gender.toLowerCase() === 'any' ? 'Any gender' : gender;
  return `${genderLabel}, ${minAge} to ${maxAge} years`;
};

const mapApiEvent = (event: ApiEvent, meta: EventMeta | undefined): UserEvent => ({
  id: String(event.id),
  title: event.title,
  location: event.location,
  time: event.time,
  audience: formatAudience(event.gender, event.min_age, event.max_age),
  imageUri: meta?.imageUri ?? DEFAULT_EVENT_IMAGE,
  badgeLabel: meta?.badgeLabel,
  dateLabel: event.date_label,
  description: event.description,
  ownerId: event.user_id,
  hostName: event.host_name,
  gender: event.gender,
  minAge: event.min_age,
  maxAge: event.max_age
});

export const EventsProvider = ({ children }: { children: ReactNode }) => {
  const { user, token } = useAuth();
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGuestEvent, setPendingGuestEvent] = useState<GuestEventDraft | null>(null);
  const metaRef = useRef<Record<string, EventMeta>>({});

  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload: { data: ApiEvent[] } = await response.json();
      const nextEvents = payload.data.map((event) =>
        mapApiEvent(event, metaRef.current[String(event.id)])
      );
      setEvents(nextEvents);
    } catch (err) {
      console.error('Failed to fetch events', err);
      setError('Unable to load events. Pull to refresh.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addUserEvent = useCallback(
    async (event: CreateEventInput) => {
      const payload = {
        title: event.title,
        location: event.location,
        time: event.time,
        description: event.description ?? '',
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        date_label: event.dateLabel,
        user_id: event.userId
      };

      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
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
          imageUri: event.imageUri ?? DEFAULT_EVENT_IMAGE
        }
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
        host_name: event.hostName
      };

      setEvents((prev) => {
        const withoutNew = prev.filter((item) => item.id !== eventId);
        return [mapApiEvent(optimisticEvent, metaRef.current[eventId]), ...withoutNew];
      });

      await refreshEvents();

      return eventId;
    },
    [refreshEvents]
  );

  const updateUserEvent = useCallback(
    async (eventId: string, event: UpdateEventInput) => {
      const payload = {
        title: event.title,
        location: event.location,
        time: event.time,
        description: event.description ?? '',
        gender: event.gender,
        min_age: event.minAge,
        max_age: event.maxAge,
        date_label: event.dateLabel
      };

      if (!token) {
        throw new Error('You must be signed in to update an event.');
      }

      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      await refreshEvents();
    },
    [refreshEvents, token]
  );

  const deleteUserEvent = useCallback(
    async (eventId: string) => {
      if (!token) {
        throw new Error('You must be signed in to delete an event.');
      }

      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const message = `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      await refreshEvents();
    },
    [refreshEvents, token]
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
          imageUri: pendingGuestEvent.imageUri ?? DEFAULT_EVENT_IMAGE,
          userId: user.id,
          hostName: user.name
        });
      } catch (err) {
        console.error('Failed to submit queued guest event', err);
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
  }, [addUserEvent, pendingGuestEvent, user]);

  useEffect(() => {
    refreshEvents().catch(() => undefined);
  }, [refreshEvents]);

  const userEvents = useMemo(() => {
    if (!user) {
      return [];
    }

    return events.filter((event) => event.ownerId === user.id);
  }, [events, user]);

  const value = useMemo(
    () => ({
      events,
      userEvents,
      isLoading,
      error,
      refreshEvents,
      addUserEvent,
      updateUserEvent,
      deleteUserEvent,
      queueGuestEvent
    }),
    [events, userEvents, isLoading, error, refreshEvents, addUserEvent, updateUserEvent, deleteUserEvent, queueGuestEvent]
  );

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
};

export const useEvents = () => {
  const context = useContext(EventsContext);

  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }

  return context;
};
