/* global AbortController */
import { useCallback, useEffect, useRef, useState } from 'react';

import { listPastEvents, PastEventItem } from '@api/pastEvents';
import { useAuth } from '@context/AuthContext';

const FOCUS_REFRESH_INTERVAL_MS = 60_000;

interface PastEventsState {
  events: PastEventItem[];
  hasLoaded: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  nextCursor: string | null;
}

export interface UsePastEventsResult extends PastEventsState {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  retryLoadMore: () => Promise<void>;
}

const initialState: PastEventsState = {
  events: [],
  hasLoaded: false,
  loading: true,
  refreshing: false,
  loadingMore: false,
  error: null,
  loadMoreError: null,
  nextCursor: null,
};

const appendUnique = (current: PastEventItem[], incoming: PastEventItem[]) => {
  const ids = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
  return added.length ? [...current, ...added] : current;
};

const reconcileItems = (current: PastEventItem[], incoming: PastEventItem[]) => {
  const previous = new Map(current.map((item) => [item.id, item]));
  const keys: (keyof PastEventItem)[] = [
    'id',
    'title',
    'location',
    'time',
    'audience',
    'metaLine',
    'imageUri',
    'badgeLabel',
    'ownerId',
    'eventDate',
  ];
  const reconciled = incoming.map((item) => {
    const existing = previous.get(item.id);
    return existing && keys.every((key) => existing[key] === item[key]) ? existing : item;
  });
  return reconciled.length === current.length &&
    reconciled.every((item, index) => item === current[index])
    ? current
    : reconciled;
};

/** Owns pages and request lifetime; the screen only groups and renders the resulting items. */
export const usePastEvents = (isFocused: boolean): UsePastEventsResult => {
  const { user, token, authFetch } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<PastEventsState>(initialState);
  const stateRef = useRef(state);
  const updateState = useCallback(
    (update: PastEventsState | ((current: PastEventsState) => PastEventsState)) => {
      const next = typeof update === 'function' ? update(stateRef.current) : update;
      stateRef.current = next;
      setState(next);
    },
    [],
  );
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refreshedAt = useRef(0);

  const cancel = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);

  const refreshPages = useCallback(
    async (preserveDepth = false) => {
      if (!token || userId == null) return;
      cancel();
      const version = generation.current;
      const controller = new AbortController();
      request.current = controller;
      const depth = preserveDepth ? stateRef.current.events.length : 0;
      updateState((current) => ({
        ...current,
        loading: !current.hasLoaded,
        refreshing: current.hasLoaded,
        loadingMore: false,
        error: null,
        loadMoreError: null,
      }));
      try {
        let page = await listPastEvents(authFetch, userId, token, null, controller.signal);
        let events = appendUnique([], page.events);
        const cursors = new Set<string>();
        // A stale focus refresh reconciles the loaded depth, so returning cannot truncate the list.
        while (events.length < depth && page.nextCursor && !cursors.has(page.nextCursor)) {
          if (version !== generation.current) return;
          cursors.add(page.nextCursor);
          page = await listPastEvents(authFetch, userId, token, page.nextCursor, controller.signal);
          events = appendUnique(events, page.events);
        }
        if (page.nextCursor && cursors.has(page.nextCursor)) {
          throw new Error('Past events cursor did not advance');
        }
        if (version !== generation.current) return;
        refreshedAt.current = Date.now();
        updateState((current) => ({
          ...current,
          events: reconcileItems(current.events, events),
          nextCursor: page.nextCursor,
          hasLoaded: true,
          error: null,
        }));
      } catch {
        if (version !== generation.current) return;
        updateState((current) => ({
          ...current,
          hasLoaded: true,
          error: "Couldn't load past plans.",
        }));
      } finally {
        if (version === generation.current) {
          request.current = null;
          updateState((current) => ({ ...current, loading: false, refreshing: false }));
        }
      }
    },
    [authFetch, cancel, token, updateState, userId],
  );

  const loadPage = useCallback(
    async (retry = false) => {
      const current = stateRef.current;
      if (
        !isFocused ||
        !token ||
        userId == null ||
        !current.nextCursor ||
        request.current ||
        (!retry && current.loadMoreError)
      )
        return;
      const version = generation.current;
      const cursor = current.nextCursor;
      const controller = new AbortController();
      request.current = controller;
      updateState((value) => ({ ...value, loadingMore: true, loadMoreError: null }));
      try {
        const page = await listPastEvents(authFetch, userId, token, cursor, controller.signal);
        if (version !== generation.current) return;
        if (page.nextCursor === cursor) throw new Error('Past events cursor did not advance');
        updateState((value) => ({
          ...value,
          events: appendUnique(value.events, page.events),
          nextCursor: page.nextCursor,
        }));
      } catch {
        if (version !== generation.current) return;
        updateState((value) => ({ ...value, loadMoreError: "Couldn't load more past plans." }));
      } finally {
        if (version === generation.current) {
          request.current = null;
          updateState((value) => ({ ...value, loadingMore: false }));
        }
      }
    },
    [authFetch, isFocused, token, updateState, userId],
  );

  useEffect(() => {
    cancel();
    refreshedAt.current = 0;
    // Discard server state when the external session changes.
    updateState({ ...initialState, loading: !!token && userId != null });
    return cancel;
  }, [cancel, token, updateState, userId]);

  useEffect(() => {
    if (!isFocused) return;
    if (
      !stateRef.current.hasLoaded ||
      Date.now() - refreshedAt.current >= FOCUS_REFRESH_INTERVAL_MS
    ) {
      void refreshPages(true);
    }
    return () => {
      cancel();
      updateState((current) => ({
        ...current,
        loading: false,
        refreshing: false,
        loadingMore: false,
      }));
    };
  }, [cancel, isFocused, refreshPages, updateState]);

  const refresh = useCallback(() => refreshPages(), [refreshPages]);
  const loadMore = useCallback(() => loadPage(), [loadPage]);
  const retryLoadMore = useCallback(() => loadPage(true), [loadPage]);
  return { ...state, refresh, loadMore, retryLoadMore };
};
