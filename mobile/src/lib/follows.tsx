import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { haptic } from '@/lib/haptics';

/**
 * The members this person follows: their Watchlist. Kept on the device, the
 * way a like or a saved listing is, so following is instant and needs no
 * account round trip.
 *
 * Each follow carries enough to draw its row without a request (name, photo,
 * party), so the Watchlist opens full rather than as a column of spinners.
 *
 * Members only, on purpose: the app follows people, and a stock is something
 * to search or set an alert for rather than to hold.
 */
export type FollowedMember = {
  slug: string;
  name: string;
  photo_url: string | null;
  party: string | null;
  subtitle: string | null;
};

type Store = {
  loaded: boolean;
  members: FollowedMember[];
  isFollowingMember: (slug: string) => boolean;
  toggleMember: (member: FollowedMember) => boolean;
  addMembers: (members: FollowedMember[]) => void;
  clear: () => void;
};

const KEY = 'congtrade.follows.v1';
const FollowsContext = createContext<Store | null>(null);

export function FollowsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState<FollowedMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled || !raw) return;
        // Older saves also held stocks; they are simply not read any more.
        const saved = JSON.parse(raw) as { members?: FollowedMember[] };
        setMembers(saved.members ?? []);
      } catch {
        // Unreadable storage is an empty watchlist, not a crash.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void AsyncStorage.setItem(KEY, JSON.stringify({ members })).catch(() => {});
  }, [loaded, members]);

  const isFollowingMember = useCallback((slug: string) => members.some((m) => m.slug === slug), [members]);

  const toggleMember = useCallback(
    (member: FollowedMember) => {
      const following = members.some((m) => m.slug === member.slug);
      haptic.commit();
      setMembers((prev) => (following ? prev.filter((m) => m.slug !== member.slug) : [member, ...prev]));
      return !following;
    },
    [members]
  );

  const addMembers = useCallback((incoming: FollowedMember[]) => {
    setMembers((prev) => [...prev, ...incoming.filter((m) => !prev.some((p) => p.slug === m.slug))]);
  }, []);

  const clear = useCallback(() => setMembers([]), []);

  const value = useMemo(
    () => ({ loaded, members, isFollowingMember, toggleMember, addMembers, clear }),
    [loaded, members, isFollowingMember, toggleMember, addMembers, clear]
  );
  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>;
}

export function useFollows(): Store {
  const value = useContext(FollowsContext);
  if (!value) throw new Error('useFollows must be used inside FollowsProvider');
  return value;
}
