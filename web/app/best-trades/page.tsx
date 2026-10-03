import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeaturedTimedTrade, NOT_ADVICE, TimedTradeList, TimingLeaderList } from "@/components/TimingFeature";
import { getPriceSeries } from "@/lib/priceSeries";
import { getTimingOverviewCached, parseTimingWindow, TIMING_WINDOWS } from "@/lib/timing";

/**
 * Congress's best trades: the recently disclosed trades that have done best
 * since the day they were made, and the members whose trades do best on
 * average. The home page shows the top six; this is the whole ranking.
 *
 * The figures are cached for an hour (getTimingOverviewCached): the prices
 * behind them change once a day and the filings every few hours.
 */

export const metadata: Metadata = {
  title: "Congress's best trades | CongTrade",
  description:
    "The congressional stock trades that have done best since they were made: what each has returned from the trade date to the latest close, and the members whose trades do best on average.",
  alternates: { canonical: "/best-trades" },
};

const MARGIN_DAYS = 30;

function offset(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function windowLabel(days: number): string {
  return days === 365 ? "past year" : `past ${days} days`;
}

export default async function BestTradesPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parseTimingWindow((await searchParams).days);
  const overview = await getTimingOverviewCached(days, { trades: 25, leaders: 15 });
  const [top, ...rest] = overview.trades;
  // From a month before the trade to the latest close: the whole run since.
  const series = top?.ticker && top.transaction_date ? await getPriceSeries(top.ticker, offset(top.transaction_date, -MARGIN_DAYS)) : null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Congress&rsquo;s best trades</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
          What each disclosed trade has returned since the day it was made, to the latest close: the rise since a
          purchase, or the fall a sale got out ahead of. These are the best of the trades disclosed in the{" "}
          {windowLabel(days)}, all filed within the 45 days the law allows.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {TIMING_WINDOWS.map((d) => (
            <Link
              key={d}
              href={d === 90 ? "/best-trades" : `/best-trades?days=${d}`}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                d === days ? "border-ink bg-ink text-panel" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              Disclosed in the {windowLabel(d)}
            </Link>
          ))}
        </div>

        {top ? (
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <FeaturedTimedTrade trade={top} points={series} />
            </div>
            <section className="overflow-hidden rounded-xl border border-line bg-panel lg:col-span-2">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Members whose trades do best</h2>
              <TimingLeaderList leaders={overview.leaders} />
              <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
                Average return since the trade, for every trade disclosed on time in the past year, among members with at
                least five.
              </p>
            </section>
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-ink-muted">
            No priced trades were disclosed on time in this window yet.
          </p>
        )}

        {rest.length ? (
          <section className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Best trades, disclosed in the {windowLabel(days)}
            </h2>
            <TimedTradeList trades={rest} start={2} />
          </section>
        ) : null}

        <section className="mt-6 rounded-xl border border-line bg-panel-muted p-5 text-xs leading-relaxed text-ink-muted">
          <h2 className="text-sm font-semibold text-ink">How this is worked out</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Each trade is priced at the stock&rsquo;s daily close on the day it was made and at the latest close,
              split-adjusted. The filing gives a value range, never the price paid, so this is the stock&rsquo;s return,
              not the member&rsquo;s profit, and it ignores dividends.
            </li>
            <li>
              A purchase counts by how much the stock has risen since; a sale by how much it has fallen since, the loss
              the seller avoided.
            </li>
            <li>
              Several lots of the same stock in one filing count once, at the largest. No member appears more than twice
              in the ranking, and moves over 400%, which are usually a mismatched listing, are left out. Only trades
              disclosed within the 45 days the law allows are ranked.
            </li>
            <li>Prices update every weekday evening after the US close; new trades are priced once they are published.</li>
          </ul>
          <p className="mt-3 font-medium text-ink-muted">
            {NOT_ADVICE} A trade that has done well is not evidence of wrongdoing, and past returns say nothing about
            future ones.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
