import { TransientPriceError, type DailyClose, type DailySeries, type PriceSource } from "./source.js";

/**
 * Yahoo's chart endpoint, one request per ticker for any range.
 *
 * Symbols differ in one way that matters here: share classes are written with
 * a dot in filings (BRK.B) and a hyphen at Yahoo (BRK-B).
 *
 * The response's closes are split-adjusted as of the request; `events=split`
 * asks for the split dates too, which is how the sync knows to rewrite a
 * ticker's stored closes after one.
 */
export function yahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

interface ChartResponse {
  chart?: {
    result?: {
      meta?: { gmtoffset?: number; currentTradingPeriod?: { regular?: { start?: number; end?: number } } };
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
      events?: { splits?: Record<string, { date: number }> };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

// Yahoo turns away some clients outright; the short browser token is the one
// that has been answered consistently.
const USER_AGENT = "Mozilla/5.0";

function dayOf(epochSeconds: number, gmtOffset: number): string {
  return new Date((epochSeconds + gmtOffset) * 1000).toISOString().slice(0, 10);
}

export const yahoo: PriceSource = {
  name: "yahoo",
  async daily(ticker, fromDay) {
    const period1 = Math.floor(new Date(`${fromDay}T00:00:00Z`).getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86_400;
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}` +
      `?period1=${period1}&period2=${period2}&interval=1d&events=split&includePrePost=false`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    } catch (err) {
      throw new TransientPriceError(`network: ${(err as Error).message}`);
    }
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) throw new TransientPriceError(`HTTP ${res.status}`);

    const body = (await res.json().catch(() => null)) as ChartResponse | null;
    const error = body?.chart?.error;
    if (error) {
      if (error.code === "Not Found") return null;
      throw new TransientPriceError(`${error.code}: ${error.description}`);
    }
    if (!res.ok) throw new TransientPriceError(`HTTP ${res.status}`);

    const result = body?.chart?.result?.[0];
    if (!result) return null;
    const offset = result.meta?.gmtoffset ?? 0;
    const stamps = result.timestamp ?? [];
    const raw = result.indicators?.quote?.[0]?.close ?? [];

    const byDay = new Map<string, number>();
    stamps.forEach((ts, i) => {
      const close = raw[i];
      // Null closes are halted or not-yet-settled days; a zero is never real.
      if (typeof close === "number" && Number.isFinite(close) && close > 0) byDay.set(dayOf(ts, offset), close);
    });
    // While the exchange is open, the last bar is the live price, not a close.
    // Stored, it would judge a filing made that day against an intraday
    // number, so today's bar waits until the session has ended.
    const session = result.meta?.currentTradingPeriod?.regular;
    if (session?.start && session.end && Date.now() / 1000 < session.end) {
      byDay.delete(dayOf(session.start, offset));
    }
    const closes: DailyClose[] = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, close]) => ({ day, close }));
    const splits = Object.values(result.events?.splits ?? {}).map((s) => dayOf(s.date, offset));
    return { closes, splits } satisfies DailySeries;
  },
};
