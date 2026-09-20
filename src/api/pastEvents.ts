/* global RequestInfo, RequestInit, Response, URL */

import { requestJson } from '@api/client';
import { ApiEvent } from '@api/mappers/events';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ApiPastEventsPage {
  data: ApiEvent[] | null;
  next_cursor: string | null;
}

export interface PastEventsPage {
  events: ApiEvent[];
  nextCursor: string | null;
}

export const PAST_EVENTS_PAGE_SIZE = 25;

export const listPastEvents = async (
  fetchImpl: FetchLike,
  cursor?: string | null,
): Promise<PastEventsPage> => {
  const query = [`limit=${PAST_EVENTS_PAGE_SIZE}`];
  if (cursor) {
    query.push(`cursor=${encodeURIComponent(cursor)}`);
  }

  const payload = await requestJson<ApiPastEventsPage>(`/api/events/past?${query.join('&')}`, {
    fetchImpl,
    errorMessage: "Couldn't load past plans.",
  });

  return {
    events: payload.data ?? [],
    nextCursor: payload.next_cursor ?? null,
  };
};
