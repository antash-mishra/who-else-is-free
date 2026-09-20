/* global Response */

import { listPastEvents, PAST_EVENTS_PAGE_SIZE } from '@api/pastEvents';

jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
  WS_BASE_URL: 'ws://localhost:8080',
  CHAT_ENABLED: true,
}));

const response = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('past events API', () => {
  it('loads a bounded page and encodes its cursor', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      response({
        data: [{ id: 1, title: 'Past plan' }],
        next_cursor: 'next page',
      }),
    );

    const page = await listPastEvents(fetchImpl, 'current page');

    expect(page.events).toHaveLength(1);
    expect(page.nextCursor).toBe('next page');
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `http://localhost:8080/api/events/past?limit=${PAST_EVENTS_PAGE_SIZE}&cursor=current%20page`,
    );
  });

  it('normalizes an empty server page', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ data: null, next_cursor: null }));

    await expect(listPastEvents(fetchImpl)).resolves.toEqual({
      events: [],
      nextCursor: null,
    });
  });
});
