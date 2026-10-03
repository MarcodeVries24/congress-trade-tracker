import { useCallback, useState } from 'react';

// iOS leaves the pulled-down gap open when a refresh is turned off within a
// moment of starting, which is what happens when every request answers from
// cache. Holding the spinner this long lets the scroll view settle back.
const MIN_SPINNER_MS = 600;

/**
 * Pull-to-refresh state for a screen: `refreshing` stays on until every
 * reload passed to `onRefresh` has finished, and for at least MIN_SPINNER_MS,
 * then goes off once. Each screen's loaders stay unaware of it.
 */
export function useRefresh(reload: () => Promise<unknown>[]): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const started = Date.now();
    void Promise.allSettled(reload()).then(() => {
      const wait = Math.max(0, MIN_SPINNER_MS - (Date.now() - started));
      setTimeout(() => setRefreshing(false), wait);
    });
  }, [reload]);
  return { refreshing, onRefresh };
}
