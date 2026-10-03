/**
 * The arithmetic of a price move, with nothing server-side in it, so the
 * trades browser (a client component) can use it without pulling the database
 * client into the browser. lib/prices.ts re-exports all of it next to the
 * SQL that fetches the closes.
 */
export interface TradePrices {
  price_at_trade: number | null;
  price_at_filing: number | null;
  price_now: number | null;
  price_now_day: string | null;
}

/** The change from one close to another, as a fraction (0.112 for +11.2%). */
export function change(from: number | null | undefined, to: number | null | undefined): number | null {
  if (typeof from !== "number" || typeof to !== "number" || !(from > 0) || !(to > 0)) return null;
  return to / from - 1;
}

/** From the trade to its disclosure: the move the public could not see. */
export function moveBeforeDisclosure(t: Partial<TradePrices>): number | null {
  return change(t.price_at_trade, t.price_at_filing);
}

/** From the disclosure to the latest close: what acting on it would have done. */
export function moveSinceDisclosure(t: Partial<TradePrices>): number | null {
  return change(t.price_at_filing, t.price_now);
}

/** From the trade to the latest close. */
export function moveSinceTrade(t: Partial<TradePrices>): number | null {
  return change(t.price_at_trade, t.price_now);
}

/**
 * Whether a move went the trader's way: up after a purchase, down after a
 * sale. Null for anything that is neither (exchanges) or has no move. This is
 * a description of what the price did, not a claim about why.
 */
export function inTheirFavour(transactionType: string, move: number | null): boolean | null {
  if (move === null || move === 0) return null;
  if (/^P/i.test(transactionType)) return move > 0;
  if (/^S/i.test(transactionType)) return move < 0;
  return null;
}

/** "+11.2%", "−3.0%", with a real minus sign. */
export function formatMove(move: number | null, digits = 1): string {
  if (move === null) return "–";
  const pct = move * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/** The explanation behind every "before disclosure" figure, for its ⓘ. */
export const DISCLOSURE_MOVE_NOTE =
  "How the stock's price moved between the day of the trade and the day it was publicly disclosed: the stretch when only the member knew about it. " +
  "“Their way” means the price rose after a purchase or fell after a sale. Daily closing prices, split-adjusted. It describes timing, not profit or intent.";
