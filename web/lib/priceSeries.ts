import { unstable_cache } from "next/cache";

/**
 * A ticker's daily closes, for drawing a price chart.
 *
 * Fetched from the price source when a page asks rather than stored: charts
 * want every day, the database keeps only the closes trades need (see
 * price_points), and a cached series per ticker is cheap where three million
 * stored rows are not. The source is Yahoo's chart endpoint, the same one the
 * ingest's sync uses, chosen as the free option that works today.
 *
 * Cached once per ticker for twelve hours, as the closes alone in a compact
 * form (see CompactSeries). On Vercel every cache write counts as ISR writes,
 * in 8 KB units. This used to cache Yahoo's raw answer instead: twelve years
 * of open, high, low, close, volume and adjusted close, a few hundred KB, under
 * a key that also changed every day, rewritten up to four times a day for
 * every ticker anyone (or any crawler rendering a company page) looked at.
 * That was most of the ISR writes.
 */
export interface PricePoint {
  /** YYYY-MM-DD */
  d: string;
  /** Close, split-adjusted as of the fetch. */
  c: number;
}

// Closes move once a weekday evening; twice a day keeps a chart at most half
// a day behind.
const REVALIDATE_SECONDS = 12 * 60 * 60;

export function yahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

// Every chart cuts its days from the same series per ticker, from here on.
// Asking the source from each chart's own start date made a cache entry per
// trade (a month before each trade date), so nearly every trade page fetched
// afresh; one series per ticker is fetched a few times a day at most.
export const SERIES_START = "2014-01-01";

/**
 * A series as it is cached: day numbers (days since 1970-01-01) stored as the
 * gap from the previous day, nearly always 1 or 3, and closes in cents. About
 * 30 KB for twelve years, against some 250 KB for Yahoo's answer.
 */
interface CompactSeries {
  /** Day number of the first close. */
  first: number;
  /** Gap in days from the previous close; the first entry is 0. */
  gaps: number[];
  /** Closes in cents. */
  cents: number[];
}

/** A ticker's daily closes from `fromDay`, cut from its one cached series. */
export async function getPriceSeries(ticker: string, fromDay: string): Promise<PricePoint[] | null> {
  let compact: CompactSeries | null;
  try {
    compact = await cachedSeries(yahooSymbol(ticker));
  } catch {
    return null;
  }
  if (!compact) return null;
  const points: PricePoint[] = [];
  let day = compact.first;
  for (let i = 0; i < compact.gaps.length; i++) {
    day += compact.gaps[i];
    const d = new Date(day * 86_400_000).toISOString().slice(0, 10);
    if (d >= fromDay) points.push({ d, c: compact.cents[i] / 100 });
  }
  return points.length ? points : null;
}

// The ticker is part of the key (unstable_cache adds the arguments). A null,
// for a ticker Yahoo does not know, is cached too, so it is not asked again on
// every visit; any other failure throws, which caches nothing, so the next
// visit tries again.
const cachedSeries = unstable_cache(fetchSeries, ["price-series-v2"], { revalidate: REVALIDATE_SECONDS });

async function fetchSeries(symbol: string): Promise<CompactSeries | null> {
  const period1 = Math.floor(new Date(`${SERIES_START}T00:00:00Z`).getTime() / 1000);
  // Two days ahead of today, so today's close is always inside the range.
  const period2 = Math.floor(Date.now() / 1000) + 2 * 86_400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d`;
  // Not cached by fetch itself (Next 15 does not by default): only the compact
  // result is.
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Yahoo answered ${res.status} for ${symbol}`);
  const body = (await res.json()) as {
    chart?: {
      result?: {
        meta?: { gmtoffset?: number };
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };
  const result = body.chart?.result?.[0];
  if (!result?.timestamp) return null;
  const offset = result.meta?.gmtoffset ?? 0;
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const gaps: number[] = [];
  const cents: number[] = [];
  let first = 0;
  let prev = 0;
  result.timestamp.forEach((ts, i) => {
    const c = closes[i];
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) return;
    const day = Math.floor((ts + offset) / 86_400);
    if (gaps.length && day <= prev) return;
    if (!gaps.length) first = day;
    gaps.push(gaps.length ? day - prev : 0);
    cents.push(Math.round(c * 100));
    prev = day;
  });
  return gaps.length ? { first, gaps, cents } : null;
}

/** YYYY-MM-DD for `days` ago. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
