import { act, renderHook, waitFor } from '@testing-library/react-native';

import { listPastEvents, PastEventItem, PastEventsPage } from '@api/pastEvents';
import { usePastEvents } from '@hooks/usePastEvents';

jest.mock('@api/pastEvents', () => ({ listPastEvents: jest.fn() }));
const mockAuth = { user: { id: 1 }, token: 'token', authFetch: jest.fn() };
jest.mock('@context/AuthContext', () => ({ useAuth: () => mockAuth }));

const mockList = jest.mocked(listPastEvents);
const item = (id: string): PastEventItem => ({
  id,
  title: `Plan ${id}`,
  location: 'Park',
  time: '10:00',
  audience: '',
  metaLine: 'Group',
  imageUri: '',
  ownerId: 1,
  eventDate: '2020-01-01',
});
const page = (ids: string[], nextCursor: string | null = null): PastEventsPage => ({
  events: ids.map(item),
  nextCursor,
});
const pendingPage = () => {
  let resolve!: (value: PastEventsPage) => void;
  const promise = new Promise<PastEventsPage>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('usePastEvents', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockAuth.user = { id: 1 };
    mockAuth.token = 'token';
  });

  it('loads once, serializes repeated end callbacks, de-duplicates and stops at the last page', async () => {
    mockList.mockResolvedValueOnce(page(['1'], 'next'));
    const next = pendingPage();
    mockList.mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => usePastEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    await act(async () => {
      next.resolve(page(['1', '2', '2']));
    });
    expect(result.current.events.map((event) => event.id)).toEqual(['1', '2']);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded rows on a page failure and waits for an explicit retry', async () => {
    mockList
      .mockResolvedValueOnce(page(['1'], 'next'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page(['2']));
    const { result } = renderHook(() => usePastEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.loadMoreError).toBe("Couldn't load more past plans.");
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    await act(async () => {
      await result.current.retryLoadMore();
    });
    expect(result.current.events).toHaveLength(2);
    expect(result.current.loadMoreError).toBeNull();
  });

  it('aborts an old page when refreshing and ignores its late result', async () => {
    const old = pendingPage();
    mockList
      .mockResolvedValueOnce(page(['1'], 'old'))
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page(['3'], 'fresh'));
    const { result } = renderHook(() => usePastEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      void result.current.loadMore();
    });
    const oldSignal = mockList.mock.calls[1][4];
    await act(async () => {
      await result.current.refresh();
      old.resolve(page(['2']));
    });
    expect(oldSignal?.aborted).toBe(true);
    expect(result.current.events.map((event) => event.id)).toEqual(['3']);
    expect(result.current.nextCursor).toBe('fresh');
  });

  it('preserves pages on an immediate return from details without refetching', async () => {
    mockList.mockResolvedValueOnce(page(['1'], 'next')).mockResolvedValueOnce(page(['2']));
    const { result, rerender } = renderHook(
      ({ focused }: { focused: boolean }) => usePastEvents(focused),
      {
        initialProps: { focused: true },
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    rerender({ focused: false });
    rerender({ focused: true });
    expect(result.current.events).toHaveLength(2);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('reconciles the loaded depth on a stale focus return', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      mockList
        .mockResolvedValueOnce(page(['1'], 'next'))
        .mockResolvedValueOnce(page(['2']))
        .mockResolvedValueOnce(page(['3'], 'fresh'))
        .mockResolvedValueOnce(page(['4']));
      const { result, rerender } = renderHook(
        ({ focused }: { focused: boolean }) => usePastEvents(focused),
        {
          initialProps: { focused: true },
        },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.loadMore();
      });
      rerender({ focused: false });
      clock.mockReturnValue(62_000);
      rerender({ focused: true });
      await waitFor(() =>
        expect(result.current.events.map((event) => event.id)).toEqual(['3', '4']),
      );
      expect(mockList).toHaveBeenCalledTimes(4);
    } finally {
      clock.mockRestore();
    }
  });

  it('clears another session history and aborts outstanding requests on logout', async () => {
    const old = pendingPage();
    mockList.mockResolvedValueOnce(page(['1'], 'next')).mockReturnValueOnce(old.promise);
    const { result, rerender } = renderHook(() => usePastEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      void result.current.loadMore();
    });
    const signal = mockList.mock.calls[1][4];
    mockAuth.token = '';
    rerender({});
    await act(async () => {
      old.resolve(page(['2']));
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.events).toEqual([]);
  });

  it('keeps cached data when a refresh fails and rejects a cursor that does not advance', async () => {
    mockList
      .mockResolvedValueOnce(page(['1'], 'same'))
      .mockResolvedValueOnce(page(['2'], 'same'))
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => usePastEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.loadMoreError).toBeTruthy();
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.events.map((event) => event.id)).toEqual(['1']);
    expect(result.current.error).toBe("Couldn't load past plans.");
  });

  it('reuses unchanged items and preserves the array on an equal refresh', async () => {
    mockList.mockResolvedValueOnce(page(['1'])).mockResolvedValueOnce(page(['1']));
    const { result } = renderHook(() => usePastEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const events = result.current.events;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.events).toBe(events);
  });
});
