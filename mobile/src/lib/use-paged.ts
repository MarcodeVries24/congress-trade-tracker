import { useCallback, useEffect, useRef, useState } from 'react';

import type { Page } from '@/lib/api';

export type PagedStatus = 'loading' | 'ready' | 'error';

/**
 * A paged list with pull-to-refresh and load-more, which the directory tabs
 * all need in exactly the same shape.
 *
 * `load` is expected to change identity whenever the query does (it is a
 * useCallback over the search text, sort and chamber), and a change reloads
 * from page one. A response that lands after the query has moved on is
 * dropped, so typing quickly cannot leave an older search's results showing.
 */
export function usePaged<T>(load: (page: number) => Promise<Page<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<PagedStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const mine = replace ? ++generation.current : generation.current;
      if (!replace && busy.current) return;
      busy.current = true;
      try {
        const res = await load(nextPage);
        if (mine !== generation.current) return;
        setItems((prev) => (replace ? res.data : [...prev, ...res.data]));
        setPage(res.page);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        setStatus('ready');
        setError(null);
      } catch (err) {
        if (mine !== generation.current) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        if (replace) setStatus('error');
      } finally {
        if (mine === generation.current) {
          busy.current = false;
          setRefreshing(false);
        }
      }
    },
    [load]
  );

  useEffect(() => {
    // Every state update in fetchPage is behind an await, so nothing is set
    // synchronously here; the rule cannot see that, as in the trades screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(1, true);
  }, [fetchPage]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void fetchPage(1, true);
  }, [fetchPage]);

  const retry = useCallback(() => {
    setStatus('loading');
    void fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (status === 'ready' && page < totalPages) void fetchPage(page + 1, false);
  }, [status, page, totalPages, fetchPage]);

  return { items, total, status, error, refreshing, refresh, retry, loadMore, hasMore: page < totalPages };
}

/** The value, but only once it has stopped changing for `ms`. For search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
