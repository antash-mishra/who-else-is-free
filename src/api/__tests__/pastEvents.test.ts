/* global Response */
import { listPastEvents } from '@api/pastEvents';

jest.mock('@api/config', () => ({ API_BASE_URL: 'http://localhost:8080' }));

const raw = {
  id: 1,
  title: 'Plan',
  location: 'Park',
  time: '10:00',
  gender: 'Any',
  min_age: 18,
  max_age: 60,
  event_date: '2020-01-01',
  date_label: 'Today',
  group_type: 'Group',
  user_id: 1,
  host_name: 'Host',
};
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status });

describe('past events API', () => {
  it('requests bounded pages with encoded cursors, auth, compact metadata and host badges', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ data: [raw], next_cursor: 'next' }));
    const page = await listPastEvents(fetchImpl, 1, 'token', 'cursor /?');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8080/api/events/past?limit=25&cursor=cursor%20%2F%3F',
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
    );
    expect(page.events[0]).toMatchObject({ id: '1', metaLine: 'Group', badgeLabel: 'Hosting' });
    expect(page.nextCursor).toBe('next');
  });

  it('supports null empty history and servers without pagination metadata', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ data: null }))
      .mockResolvedValueOnce(response({ data: [{ ...raw, user_id: 2 }] }));
    await expect(listPastEvents(fetchImpl, 1, 'token')).resolves.toEqual({
      events: [],
      nextCursor: null,
    });
    const page = await listPastEvents(fetchImpl, 1, 'token');
    expect(page.nextCursor).toBeNull();
    expect(page.events[0].badgeLabel).toBe('Joined');
  });

  it('rejects missing history and malformed cursor metadata', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ data: [], next_cursor: 123 }));
    await expect(listPastEvents(fetchImpl, 1, 'token')).rejects.toThrow(
      'Invalid past events response',
    );
    await expect(listPastEvents(fetchImpl, 1, 'token')).rejects.toThrow(
      'Invalid past events response',
    );
  });

  it('rejects malformed and failed responses instead of treating them as an empty history', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ data: {} }))
      .mockResolvedValueOnce(response({ error: 'private' }, 500));
    await expect(listPastEvents(fetchImpl, 1, 'token')).rejects.toThrow(
      'Invalid past events response',
    );
    await expect(listPastEvents(fetchImpl, 1, 'token')).rejects.toThrow(
      "Couldn't load past plans.",
    );
  });
});
