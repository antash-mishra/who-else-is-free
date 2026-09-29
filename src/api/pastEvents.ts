/* global AbortSignal */
import { EventItemProps } from '@components/EventCard';
import { toEventCardItem } from '@components/events/eventListSections';

import { requestJson, RequestJsonOptions } from './client';
import { ApiEvent, mapApiEventToUserEvent } from './mappers/events';

export interface PastEventItem extends EventItemProps {
  ownerId: number;
  eventDate: string;
}

export interface PastEventsPage {
  events: PastEventItem[];
  nextCursor: string | null;
}

interface PastEventsPayload {
  data?: ApiEvent[] | null;
  next_cursor?: string | null;
}

export const PAST_EVENTS_PAGE_SIZE = 25;

/** The no-query legacy API remains available to installed clients. New clients opt into pages. */
export const listPastEvents = async (
  fetchImpl: NonNullable<RequestJsonOptions['fetchImpl']>,
  userId: number,
  token: string,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<PastEventsPage> => {
  const query = `limit=${PAST_EVENTS_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const payload = await requestJson<PastEventsPayload>(`/api/events/past?${query}`, {
    fetchImpl,
    token,
    signal,
    errorMessage: "Couldn't load past plans.",
  });
  if (
    !payload ||
    !Object.prototype.hasOwnProperty.call(payload, 'data') ||
    (payload.data != null && !Array.isArray(payload.data)) ||
    (payload.next_cursor != null &&
      (typeof payload.next_cursor !== 'string' || !payload.next_cursor))
  ) {
    throw new Error('Invalid past events response');
  }
  return {
    events: (payload.data ?? []).map((raw) => {
      const event = mapApiEventToUserEvent(raw);
      return {
        ...toEventCardItem(event, event.ownerId === userId ? 'Hosting' : 'Joined'),
        ownerId: event.ownerId,
        eventDate: event.eventDate,
      };
    }),
    // Older servers omit this field and return their complete history.
    nextCursor: payload.next_cursor ?? null,
  };
};
