/**
 * Where daily closing prices come from, behind one small interface.
 *
 * Today that is Yahoo Finance's chart endpoint: free, complete back to the
 * oldest trade on file, and unofficial, with no contract and terms that speak
 * of personal use. It was chosen knowing that, as the thing that works now; a
 * licensed end-of-day provider can replace it by implementing this interface,
 * and nothing that reads the stored prices would notice.
 */
export interface DailyClose {
  /** The trading day, YYYY-MM-DD, in the exchange's own calendar. */
  day: string;
  close: number;
}

export interface DailySeries {
  closes: DailyClose[];
  /** Days a split took effect, so stored closes from before can be rewritten. */
  splits: string[];
}

export interface PriceSource {
  readonly name: string;
  /**
   * Daily closes from `fromDay` to today, oldest first. Resolves null when
   * the source has no such symbol (delisted, foreign, or not a listed
   * security), and throws on anything that might succeed if tried again.
   */
  daily(ticker: string, fromDay: string): Promise<DailySeries | null>;
}

/** A failure worth retrying later: a rate limit, an outage, a timeout. */
export class TransientPriceError extends Error {}
