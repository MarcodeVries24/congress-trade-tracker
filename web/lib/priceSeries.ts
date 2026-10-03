/**
 * A ticker's daily closes, for drawing a price chart.
 *
 * Fetched from the price source when a page asks rather than stored: charts
 * want every day, the database keeps only the closes trades need (see
 * price_points), and a cached series per ticker is cheap where three million
 * stored rows are not. The source is Yahoo's chart endpoint, the same one the
 * ingest's sync uses, chosen as the free option that works today.
 *
 * Next caches the response for six hours, so a popular company page asks the
 * source a handful of times a day however many people open it.
 */
export interface PricePoint {
  /** YYYY-MM-DD */
  d: string;
  /** Close, split-adjusted as of the fetch. */
  c: number;
}

const REVALIDATE_SECONDS = 6 * 60 * 60;

export function yahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

export async function getPriceSeries(ticker: string, fromDay: string): Promise<PricePoint[] | null> {
  const period1 = Math.floor(new Date(`${fromDay}T00:00:00Z`).getTime() / 1000);
  // Rounded to the day so the cache key is stable for six hours rather than
  // changing with every request.
  const period2 = Math.floor(Date.now() / 86_400_000) * 86_400 + 2 * 86_400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}` +
    `?period1=${period1}&period2=${period2}&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
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
    const points: PricePoint[] = [];
    result.timestamp.forEach((ts, i) => {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        points.push({
          d: new Date((ts + offset) * 1000).toISOString().slice(0, 10),
          c: Math.round(c * 100) / 100,
        });
      }
    });
    return points.length ? points : null;
  } catch {
    return null;
  }
}

/** YYYY-MM-DD for `days` ago. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
