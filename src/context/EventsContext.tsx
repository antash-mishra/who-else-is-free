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
}

interface EventsContextValue {
  events: UserEvent[];
  userEvents: UserEvent[];
  isLoading: boolean;
  error: string | null;
  refreshEvents: () => Promise<void>;
  addUserEvent: (event: CreateEventInput) => Promise<string>;
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
  ownerId: event.user_id
});

export const EventsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        user_id: event.userId
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
    () => ({ events, userEvents, isLoading, error, refreshEvents, addUserEvent }),
    [events, userEvents, isLoading, error, refreshEvents, addUserEvent]
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
