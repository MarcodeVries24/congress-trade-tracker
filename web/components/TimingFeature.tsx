import Link from "next/link";
import { MemberPhoto } from "@/components/MemberPhoto";
import { TickerLogo } from "@/components/TickerLogo";
import { TradeWindowChart } from "@/components/TradeWindowChart";
import { amountLabel, displayAssetName } from "@/lib/api";
import { formatDate, isPartialSale } from "@/lib/format";
import { memberDisplayName } from "@/lib/memberDisplay";
import { formatMove } from "@/lib/priceMath";
import type { PricePoint } from "@/lib/priceSeries";
import type { TimedTrade, TimingLeader } from "@/lib/timing";
import type { TimingSummary } from "@/lib/prices";

/**
 * The pieces of "Before the public knew" as it is featured: the best-timed
 * trade with its chart, the runners-up, the members whose trades most often
 * move their way, and the figures for everyone. Plain components with no
 * data fetching of their own, so the home page (a client component, which
 * fetches /api/timing) and /before-disclosure (rendered on the server) show
 * the same thing.
 */

export const NOT_ADVICE =
  "For information only. This shows what prices did around public disclosures; it is not investment advice or a recommendation to buy or sell anything.";

function verb(type: string): string {
  if (/^P/i.test(type)) return "bought";
  if (isPartialSale(type)) return "sold part of";
  return "sold";
}

function daysLabel(days: number | null): string {
  if (days === null) return "";
  if (days >= 365) {
    const years = days / 365;
    return `${days.toLocaleString()} days (${years.toFixed(1)} years)`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** What "their way" was for this trade, in words. */
function edgeWords(t: TimedTrade): string {
  return /^P/i.test(t.transaction_type) ? "rose" : "fell";
}

export function FeaturedTimedTrade({ trade: t, points }: { trade: TimedTrade; points: PricePoint[] | null }) {
  const name = memberDisplayName(t);
  const kind = /^P/i.test(t.transaction_type) ? "buy" : "sell";
  const late = t.days_to_file !== null && t.days_to_file > 45;
  return (
    <Link
      href={`/trades/${t.id}`}
      className="group block rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong sm:p-5"
    >
      <div className="flex items-start gap-3">
        <MemberPhoto name={name} photoUrl={t.photo_url} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Best-timed trade</div>
          <div className="mt-0.5 text-base font-semibold leading-snug text-ink sm:text-lg">
            {name} {verb(t.transaction_type)} {t.ticker ?? displayAssetName(t)}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">
            {amountLabel(t.amount_range)} · traded {formatDate(t.transaction_date)} · disclosed {formatDate(t.filing_date)}
          </div>
        </div>
        {t.ticker ? <TickerLogo ticker={t.ticker} size={44} /> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
        <div className="text-4xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-5xl">
          {formatMove(t.edge)}
        </div>
        <p className="max-w-md pb-1 text-sm leading-snug text-ink-muted">
          The stock {edgeWords(t)} {formatMove(Math.abs(t.edge)).replace("+", "")} in the {daysLabel(t.days_to_file)}{" "}
          between the trade and its disclosure
          {late ? <span className="text-amber-600 dark:text-amber-400">, well past the 45 days the law allows</span> : null}.
        </p>
      </div>

      {points && points.length > 4 && t.transaction_date ? (
        <div className="mt-3">
          <TradeWindowChart points={points} traded={t.transaction_date} filed={t.filing_date} kind={kind} />
        </div>
      ) : null}
      <div className="mt-2 text-xs text-accent group-hover:underline">See the trade →</div>
    </Link>
  );
}

export function TimedTradeList({ trades, start = 1 }: { trades: TimedTrade[]; start?: number }) {
  return (
    <ol className="divide-y divide-line/60">
      {trades.map((t, i) => {
        const name = memberDisplayName(t);
        return (
          <li key={t.id}>
            <Link href={`/trades/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-muted">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">{start + i}</span>
              {t.ticker ? <TickerLogo ticker={t.ticker} size={30} /> : <span className="h-[30px] w-[30px] shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">
                  {name} <span className="text-ink-muted">{verb(t.transaction_type)}</span> {t.ticker ?? displayAssetName(t)}
                </div>
                <div className="truncate text-xs text-ink-faint">
                  {amountLabel(t.amount_range)} · disclosed after {daysLabel(t.days_to_file)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMove(t.edge)}</div>
                <div className="text-[10px] text-ink-faint">their way</div>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function TimingLeaderList({ leaders }: { leaders: TimingLeader[] }) {
  return (
    <ol className="divide-y divide-line/60">
      {leaders.map((l, i) => (
        <li key={l.slug}>
          <Link href={`/politicians/${l.slug}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-muted">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
            <MemberPhoto name={l.display} photoUrl={l.photo_url} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">{l.display}</div>
              <div className="text-xs text-ink-faint">
                {l.theirWay} of {l.trades} trades moved their way
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`text-sm font-semibold tabular-nums ${l.averageEdge >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
              >
                {formatMove(l.averageEdge)}
              </div>
              <div className="text-[10px] text-ink-faint">average</div>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TimingFacts({ summary, days }: { summary: TimingSummary; days: number }) {
  const share = summary.priced ? Math.round((summary.theirWay / summary.priced) * 100) : 0;
  const window = days === 365 ? "past year" : `past ${days} days`;
  return (
    <p className="text-xs text-ink-muted">
      Across all {summary.priced.toLocaleString()} priced trades disclosed in the {window}, {share}% moved the
      trader&rsquo;s way before disclosure
      {summary.averageEdge !== null ? `, by ${formatMove(summary.averageEdge)} on average` : ""}.
    </p>
  );
}
