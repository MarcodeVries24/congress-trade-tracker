import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeaturedTimedTrade, NOT_ADVICE, TimedTradeList, TimingLeaderList } from "@/components/TimingFeature";
import { formatMove } from "@/lib/priceMath";
import { getPriceSeries } from "@/lib/priceSeries";
import { getTimingOverviewCached, parseTimingWindow, TIMING_WINDOWS } from "@/lib/timing";

/**
 * "Before the public knew", in full: the best-timed trades disclosed in a
 * window, the members whose trades most often move their way before anyone
 * else can see them, and what that looks like across all of Congress.
 *
 * The figures are cached for an hour (getTimingOverviewCached): the prices
 * behind them change once a day and the filings every few hours.
 */

export const metadata: Metadata = {
  title: "Before the public knew: Congress's best-timed trades | CongTrade",
  description:
    "What the stock did between each congressional trade and its public disclosure. The best-timed recent trades, and the members whose trades most often move their way before anyone else can see them.",
  alternates: { canonical: "/before-disclosure" },
};

const MARGIN_DAYS = 30;

function offset(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function windowLabel(days: number): string {
  return days === 365 ? "Past year" : `Past ${days} days`;
}

export default async function BeforeDisclosurePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parseTimingWindow((await searchParams).days);
  const overview = await getTimingOverviewCached(days, { trades: 25, leaders: 15 });
  const [top, ...rest] = overview.trades;
  const series =
    top?.ticker && top.transaction_date && top.filing_date
      ? (await getPriceSeries(top.ticker, offset(top.transaction_date, -MARGIN_DAYS)))?.filter(
          (p) => p.d <= offset(top.filing_date!, MARGIN_DAYS)
        ) ?? null
      : null;
  const s = overview.summary;
  const share = s && s.priced ? Math.round((s.theirWay / s.priced) * 100) : null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Before the public knew</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
          The STOCK Act gives members of Congress up to 45 days to disclose a trade, and some take far longer. For every
          trade in a listed stock, CongTrade shows what the price did between the day it was made and the day the public
          could see it. These are the trades where it moved furthest the trader&rsquo;s way (up after a purchase, down
          after a sale), among those filed within the 45 days the law allows.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {TIMING_WINDOWS.map((d) => (
            <Link
              key={d}
              href={d === 90 ? "/before-disclosure" : `/before-disclosure?days=${d}`}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                d === days ? "border-ink bg-ink text-panel" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              Disclosed in the {windowLabel(d).toLowerCase()}
            </Link>
          ))}
        </div>

        {s ? (
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Fact label="Trades priced" value={s.priced.toLocaleString()} note={`disclosed in the ${windowLabel(days).toLowerCase()}`} />
            <Fact label="Moved the trader's way" value={share !== null ? `${share}%` : "–"} note="before they were disclosed" />
            <Fact
              label="Average move, in their favour"
              value={s.averageEdge !== null ? formatMove(s.averageEdge) : "–"}
              note="across every priced trade, not just the best"
            />
          </dl>
        ) : null}

        {top ? (
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <FeaturedTimedTrade trade={top} points={series} />
            </div>
            <section className="overflow-hidden rounded-xl border border-line bg-panel lg:col-span-2">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
                Members whose trades most often move their way
              </h2>
              <TimingLeaderList leaders={overview.leaders} />
              <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
                Average move in their favour before disclosure, over the past year, for members with at least five
                priced trades filed on time.
              </p>
            </section>
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-ink-muted">
            No priced trades were disclosed in this window yet.
          </p>
        )}

        {rest.length ? (
          <section className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Best-timed trades, disclosed in the {windowLabel(days).toLowerCase()}
            </h2>
            <TimedTradeList trades={rest} start={2} />
          </section>
        ) : null}

        <section className="mt-6 rounded-xl border border-line bg-panel-muted p-5 text-xs leading-relaxed text-ink-muted">
          <h2 className="text-sm font-semibold text-ink">How this is worked out</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Each trade is priced at the stock&rsquo;s daily close on the day it was made and on the day its filing was
              published, split-adjusted. The filing gives a value range, never the price paid, so this is the stock&rsquo;s
              move, not the member&rsquo;s profit.
            </li>
            <li>
              Several lots of the same stock in one filing count once, at the largest. No member appears more than twice
              in a ranking, and moves over 400%, which are usually a mismatched listing, are left out.
            </li>
            <li>
              Only trades disclosed within the 45 days the law allows are ranked; late filings are on each trade&rsquo;s
              page and under the trades browser&rsquo;s &ldquo;Filed late&rdquo; filter. Trades disclosed the same day
              they were made are left out too: there was no gap to measure.
            </li>
            <li>
              Prices update every weekday evening after the US close, and new trades are priced within a few hours of
              being filed.
            </li>
          </ul>
          <p className="mt-3 font-medium text-ink-muted">
            {NOT_ADVICE} A well-timed trade is not evidence of wrongdoing, and past moves say nothing about future ones.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</dd>
      <dd className="text-xs text-ink-faint">{note}</dd>
    </div>
  );
}
