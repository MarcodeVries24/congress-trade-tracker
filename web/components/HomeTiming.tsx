"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeaturedTimedTrade, NOT_ADVICE, TimedTradeList, TimingFacts } from "@/components/TimingFeature";
import type { PricePoint } from "@/lib/priceSeries";
import type { TimingOverview } from "@/lib/timing";

const DAYS = 90;
const MARGIN_DAYS = 30;

function offset(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The home page's "Before the public knew": the best-timed trade disclosed
 * in the last 90 days with its chart, the next four beside it, and a line on
 * how often that happens across everyone. The whole ranking is at
 * /before-disclosure.
 *
 * Renders nothing until it has something, and nothing at all if the timing
 * data fails to load: the rest of the home page does not depend on it.
 */
export function HomeTiming() {
  const [data, setData] = useState<TimingOverview | null>(null);
  const [points, setPoints] = useState<PricePoint[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/timing?days=${DAYS}`)
      .then((r) => (r.ok ? (r.json() as Promise<TimingOverview>) : null))
      .then(async (overview) => {
        if (!live || !overview) return;
        setData(overview);
        const top = overview.trades[0];
        if (!top?.ticker || !top.transaction_date || !top.filing_date) return;
        // Up to a month past the disclosure: the close-up the trade page opens on.
        const res = await fetch(`/api/prices/${encodeURIComponent(top.ticker)}?from=${offset(top.transaction_date, -MARGIN_DAYS)}`);
        if (!res.ok || !live) return;
        const end = offset(top.filing_date, MARGIN_DAYS);
        const series = ((await res.json()) as { points: PricePoint[] }).points.filter((p) => p.d <= end);
        setPoints(series);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!data || !data.trades.length) return null;
  const [top, ...rest] = data.trades;

  return (
    <section className="mb-6 sm:mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink sm:text-xl">Before the public knew</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">
            Members of Congress can take up to 45 days to disclose a trade. We show what the stock did in the meantime,
            for every trade, as soon as it&rsquo;s filed.
          </p>
        </div>
        <Link href="/before-disclosure" className="text-sm font-medium text-accent hover:underline">
          See the full ranking →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FeaturedTimedTrade trade={top} points={points} />
        </div>
        <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel lg:col-span-2">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Best-timed trades, disclosed in the past {DAYS} days
          </div>
          <TimedTradeList trades={rest.slice(0, 5)} start={2} />
          <div className="mt-auto space-y-1.5 border-t border-line px-4 py-3">
            {data.summary ? <TimingFacts summary={data.summary} days={DAYS} /> : null}
            <p className="text-[11px] text-ink-faint">{NOT_ADVICE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
