import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import { EventItemProps } from '@components/EventCard';

export type DateLabel = 'Today' | 'Tmrw';

export interface UserEvent extends EventItemProps {
  dateLabel: DateLabel;
  description?: string;
}

interface EventsContextValue {
  userEvents: UserEvent[];
  addUserEvent: (event: Omit<UserEvent, 'id'>) => void;
}

const EventsContext = createContext<EventsContextValue | undefined>(undefined);

export const EventsProvider = ({ children }: { children: ReactNode }) => {
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);

  const addUserEvent = (event: Omit<UserEvent, 'id'>) => {
    setUserEvents((prev) => [
      ...prev,
      {
        ...event,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }
    ]);
  };

  const value = useMemo(() => ({ userEvents, addUserEvent }), [userEvents]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
};

export const useEvents = () => {
  const context = useContext(EventsContext);

  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }

  return context;
};
