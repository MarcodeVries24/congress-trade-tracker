"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NOT_ADVICE, TimedTradeList } from "@/components/TimingFeature";
import type { TimingOverview } from "@/lib/timing";

const WINDOWS = [30, 90] as const;
type Window = (typeof WINDOWS)[number];
const SHOWN = 6;

/**
 * The home page's "Congress's best trades": the recently disclosed trades
 * that have done best since the day they were made (a rise since a purchase,
 * a fall since a sale), all filed within the 45 days the law allows, with a
 * switch between the past 30 and 90 days. The full ranking, with its chart
 * and the members, is at /best-trades.
 *
 * Styled as one of the home page's cards. Renders nothing if the data fails
 * to load: nothing else on the page depends on it.
 */
export function HomeTiming() {
  const [days, setDays] = useState<Window>(90);
  const [data, setData] = useState<Partial<Record<Window, TimingOverview>>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (data[days]) return;
    let live = true;
    fetch(`/api/timing?days=${days}`)
      .then((r) => (r.ok ? (r.json() as Promise<TimingOverview>) : Promise.reject(new Error(String(r.status)))))
      .then((overview) => live && setData((prev) => ({ ...prev, [days]: overview })))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [days, data]);

  if (failed && !Object.keys(data).length) return null;
  const shown = data[days];
  const trades = shown?.trades.slice(0, SHOWN) ?? [];
  const half = Math.ceil(trades.length / 2);

  return (
    <section className="mt-4 flex flex-col overflow-hidden rounded-lg border border-line bg-panel lg:mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Congress&rsquo;s best trades, disclosed in the past {days} days</h2>
          <p className="text-xs text-ink-faint">
            What each trade has returned since the day it was made, to the latest close. Only trades filed on time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setDays(w)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  days === w ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-ink-faint hover:text-ink-muted"
                }`}
              >
                {w} days
              </button>
            ))}
          </div>
          <Link href={`/best-trades?days=${days}`} className="shrink-0 text-xs text-accent hover:underline">
            View all →
          </Link>
        </div>
      </div>

      {!shown ? (
        <div className="animate-pulse space-y-3 px-5 py-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-panel-muted" />
          ))}
        </div>
      ) : trades.length ? (
        // Two columns of three on a wide screen, one list on a phone.
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-line/60">
          <TimedTradeList trades={trades.slice(0, half)} start={1} />
          <div className="border-t border-line/60 lg:border-t-0">
            <TimedTradeList trades={trades.slice(half)} start={half + 1} />
          </div>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-muted">No priced trades were disclosed on time in this window yet.</p>
      )}

      <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint sm:px-5">{NOT_ADVICE}</p>
    </section>
  );
}
