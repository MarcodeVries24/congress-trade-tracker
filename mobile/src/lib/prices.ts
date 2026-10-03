import { API_BASE } from '@/lib/api';

/**
 * What a stock did around a trade, the same arithmetic as the website's
 * lib/priceMath.ts so a move reads identically on both.
 *
 * The three closes arrive on every trade from the API (the ingest keeps them):
 * on the day of the trade, on the day it was disclosed, and the latest. The
 * move between the first two is the stretch only the member knew about.
 */
export interface TradePrices {
  price_at_trade?: number | null;
  price_at_filing?: number | null;
  price_now?: number | null;
  price_now_day?: string | null;
}

export function change(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || !(from > 0)) return null;
  return to / from - 1;
}

export const moveBeforeDisclosure = (t: TradePrices) => change(t.price_at_trade, t.price_at_filing);
export const moveSinceDisclosure = (t: TradePrices) => change(t.price_at_filing, t.price_now);
export const moveSinceTrade = (t: TradePrices) => change(t.price_at_trade, t.price_now);

/**
 * Whether a move went the way the trade bet: up after a purchase, down after
 * a sale. Null for exchanges and anything else without a direction.
 */
export function inTheirFavour(transactionType: string, move: number | null): boolean | null {
  if (move === null || move === 0) return null;
  if (/^P/i.test(transactionType)) return move > 0;
  if (/^S/i.test(transactionType)) return move < 0;
  return null;
}

/** +4.5%, −12.0%: a real minus sign, so the columns line up. */
export function formatMove(move: number, digits = 1): string {
  const pct = (move * 100).toFixed(digits);
  return move > 0 ? `+${pct}%` : move < 0 ? `−${pct.replace('-', '')}%` : `${pct}%`;
}

export function formatPrice(n: number): string {
  return n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(2)}`;
}

export interface PricePoint {
  /** YYYY-MM-DD */
  d: string;
  /** Split-adjusted close. */
  c: number;
}

// Daily closes change once a day; one fetch per ticker and range per session.
const cache = new Map<string, Promise<PricePoint[] | null>>();

/** Daily closes from `fromDay` to the latest, or null when the source has none. */
export function fetchPriceSeries(ticker: string, fromDay: string): Promise<PricePoint[] | null> {
  const key = `${ticker}:${fromDay}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`${API_BASE}/api/prices/${encodeURIComponent(ticker)}?from=${fromDay}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { points: PricePoint[] }).points : null))
      .catch(() => null);
    // A failure is not remembered, so the next visit tries again.
    void hit.then((v) => v === null && cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

export function dayOffset(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
