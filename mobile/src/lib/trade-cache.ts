import type { Trade } from '@/lib/api';

/**
 * The trades the feed has already loaded, so a detail screen can open instantly.
 *
 * There is no /api/trades/:id on the website, because nothing there needs one:
 * a trade page is a row in a table. Rather than add an endpoint for P0, the
 * feed remembers what it fetched and the detail screen reads from that.
 *
 * The limit of this is deliberate and known: a deep link, which is how a push
 * notification will open a trade, arrives with an empty cache. That is why the
 * detail screen has a "not loaded" state rather than assuming a hit, and why an
 * endpoint becomes necessary when notifications land in P3.
 */
const cache = new Map<number, Trade>();

export function rememberTrades(trades: Trade[]): void {
  for (const t of trades) cache.set(t.id, t);
}

export function recallTrade(id: number): Trade | undefined {
  return cache.get(id);
}
