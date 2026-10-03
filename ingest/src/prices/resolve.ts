import type { DailyClose } from "./source.js";

/**
 * The close that answers "what was the price on `day`": the last one on or
 * before it, because trades and filings land on weekends and holidays too.
 *
 * Returns null for a day before the series starts (the symbol was not trading
 * yet, or the source does not go back that far) and for a day after it ends
 * (that close does not exist yet), so neither is written down as an answer.
 */
export function closeOn(closes: DailyClose[], day: string): DailyClose | null {
  if (!closes.length || day < closes[0].day || day > closes[closes.length - 1].day) {
    // After the last close is only answerable once that day has closed. The
    // one exception is a weekend or holiday right after it, which the caller
    // handles by asking again on the next run.
    return null;
  }
  let lo = 0;
  let hi = closes.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (closes[mid].day <= day) lo = mid;
    else hi = mid - 1;
  }
  return closes[lo];
}
