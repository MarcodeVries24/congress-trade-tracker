import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { haptic } from '@/lib/haptics';

/**
 * Who and what this person follows: members (the Watchlist) and stocks (the
 * Holdings they track). Kept on the device, the way a like or a saved listing
 * is, so following is instant and needs no account round trip.
 *
 * Each follow carries enough to draw its row without a request (name, photo,
 * party) so Portfolio opens full rather than as a column of spinners.
 */
export type FollowedMember = {
  slug: string;
  name: string;
  photo_url: string | null;
  party: string | null;
  subtitle: string | null;
};

export type FollowedStock = {
  ticker: string;
  slug: string;
  company_name: string | null;
};

type Store = {
  loaded: boolean;
  members: FollowedMember[];
  stocks: FollowedStock[];
  isFollowingMember: (slug: string) => boolean;
  isFollowingStock: (ticker: string) => boolean;
  toggleMember: (member: FollowedMember) => boolean;
  toggleStock: (stock: FollowedStock) => boolean;
  addMembers: (members: FollowedMember[]) => void;
  clear: () => void;
};

const KEY = 'congtrade.follows.v1';
const FollowsContext = createContext<Store | null>(null);

export function FollowsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState<FollowedMember[]>([]);
  const [stocks, setStocks] = useState<FollowedStock[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as { members?: FollowedMember[]; stocks?: FollowedStock[] };
        setMembers(saved.members ?? []);
        setStocks(saved.stocks ?? []);
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
    void AsyncStorage.setItem(KEY, JSON.stringify({ members, stocks })).catch(() => {});
  }, [loaded, members, stocks]);

  const isFollowingMember = useCallback((slug: string) => members.some((m) => m.slug === slug), [members]);
  const isFollowingStock = useCallback(
    (ticker: string) => stocks.some((s) => s.ticker.toUpperCase() === ticker.toUpperCase()),
    [stocks]
  );

  const toggleMember = useCallback(
    (member: FollowedMember) => {
      const following = members.some((m) => m.slug === member.slug);
      haptic.commit();
      setMembers((prev) => (following ? prev.filter((m) => m.slug !== member.slug) : [member, ...prev]));
      return !following;
    },
    [members]
  );

  const toggleStock = useCallback(
    (stock: FollowedStock) => {
      const following = stocks.some((s) => s.ticker.toUpperCase() === stock.ticker.toUpperCase());
      haptic.commit();
      setStocks((prev) =>
        following ? prev.filter((s) => s.ticker.toUpperCase() !== stock.ticker.toUpperCase()) : [stock, ...prev]
      );
      return !following;
    },
    [stocks]
  );

  const addMembers = useCallback((incoming: FollowedMember[]) => {
    setMembers((prev) => [...prev, ...incoming.filter((m) => !prev.some((p) => p.slug === m.slug))]);
  }, []);

  const clear = useCallback(() => {
    setMembers([]);
    setStocks([]);
  }, []);

  const value = useMemo(
    () => ({
      loaded,
      members,
      stocks,
      isFollowingMember,
      isFollowingStock,
      toggleMember,
      toggleStock,
      addMembers,
      clear,
    }),
    [loaded, members, stocks, isFollowingMember, isFollowingStock, toggleMember, toggleStock, addMembers, clear]
  );
  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>;
}

export function useFollows(): Store {
  const value = useContext(FollowsContext);
  if (!value) throw new Error('useFollows must be used inside FollowsProvider');
  return value;
}
