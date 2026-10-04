import { useAuth } from '@clerk/clerk-expo';
import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { API_BASE } from '@/lib/api';

/**
 * Whether this person may use the app, as the server sees it.
 *
 * - `loading`: not answered yet, so nothing may redirect on it.
 * - `signed-out` and `free`: the paywall.
 * - `pro`: in. From any source: the App Store, Google Play, a website
 *   subscription, or an admin account such as the one store review uses.
 * - `unknown`: the server could not be reached. Let through on purpose. Every
 *   screen past the paywall loads its data from that same server, which checks
 *   Pro again on each request, so an offline phone gets nothing it should not
 *   have, and a paying subscriber on a train is not shown a paywall.
 */
export type AccessStatus = 'loading' | 'signed-out' | 'free' | 'pro' | 'unknown';
export type RenewingProvider = 'stripe' | 'apple' | 'google';

type Access = {
  status: AccessStatus;
  /** Subscriptions that will charge again, for the account deletion warning. */
  renewing: RenewingProvider[];
  /** Whether the paywall must be shown: a definite no from the server. */
  locked: boolean;
  /** Asks again, after a purchase or a restore. */
  refresh: () => Promise<void>;
  /**
   * Development builds only, and undefined in anything shipped. The local web
   * preview has no store to buy from, so without this nobody could get past
   * the paywall to work on the rest of the app.
   */
  skipForDevelopment?: () => void;
};

const AccessContext = createContext<Access | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  // The server's answer, tagged with whose it is. An answer for someone who
  // has since signed out or switched accounts is not an answer for this person.
  const [answer, setAnswer] = useState<{ userId: string; status: AccessStatus; renewing: RenewingProvider[] } | null>(
    null
  );
  const [devSkipped, setDevSkipped] = useState(false);
  const getTokenRef = useRef(getToken);
  const userIdRef = useRef(userId);
  useEffect(() => {
    getTokenRef.current = getToken;
    userIdRef.current = userId;
  }, [getToken, userId]);

  const refresh = useCallback(async () => {
    const forUser = userIdRef.current;
    if (!forUser) return;
    const settle = (status: AccessStatus, renewing: RenewingProvider[] = []) =>
      setAnswer({ userId: forUser, status, renewing });
    try {
      const token = await getTokenRef.current();
      if (!token) return settle('signed-out');
      const res = await fetch(`${API_BASE}/api/account`, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401) return settle('signed-out');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { pro?: boolean; renewing?: RenewingProvider[] };
      settle(data.pro ? 'pro' : 'free', data.renewing ?? []);
    } catch {
      settle('unknown');
    }
  }, []);

  // Re-asked whenever the signed-in person changes, which covers signing in,
  // signing out and deleting the account without each screen remembering to.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void refresh();
  }, [isLoaded, isSignedIn, userId, refresh]);

  // And whenever the app comes back to the front: a subscription that ran out
  // while it sat in the background locks it then, not at the next cold start.
  // At most once every few minutes, so flicking between apps costs nothing.
  const askedAt = useRef(0);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - askedAt.current < 5 * 60_000) return;
      askedAt.current = Date.now();
      void refresh();
    });
    return () => sub.remove();
  }, [isLoaded, isSignedIn, refresh]);

  // Signed out needs no request, so it is derived rather than stored.
  const current = answer && answer.userId === userId ? answer : null;
  const status: AccessStatus = !isLoaded ? 'loading' : !isSignedIn ? 'signed-out' : (current?.status ?? 'loading');
  const renewing = useMemo(() => current?.renewing ?? [], [current]);

  const locked = !devSkipped && (status === 'signed-out' || status === 'free');
  const skipForDevelopment = useCallback(() => setDevSkipped(true), []);
  const value = useMemo(
    () => ({ status, renewing, locked, refresh, skipForDevelopment: __DEV__ ? skipForDevelopment : undefined }),
    [status, renewing, locked, refresh, skipForDevelopment]
  );
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): Access {
  const value = useContext(AccessContext);
  if (!value) throw new Error('useAccess must be used inside AccessProvider');
  return value;
}
