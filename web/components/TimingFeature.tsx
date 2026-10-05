import Link from "@/components/Link";
import { MemberPhoto } from "@/components/MemberPhoto";
import { TickerLogo } from "@/components/TickerLogo";
import { TradeWindowChart } from "@/components/TradeWindowChart";
import { amountLabel, displayAssetName } from "@/lib/api";
import { formatDate, isPartialSale } from "@/lib/format";
import { memberDisplayName } from "@/lib/memberDisplay";
import { formatMove } from "@/lib/priceMath";
import type { PricePoint } from "@/lib/priceSeries";
import type { TimedTrade, TimingLeader } from "@/lib/timing";

/**
 * The pieces of "Congress's best trades": the best trade with its chart, the
 * ranked list, and the members whose trades do best on average. Plain
 * components with no data fetching of their own, so the home page's card (a
 * client component, which fetches /api/timing) and /best-trades (rendered on
 * the server) share them.
 *
 * Every figure is the stock's move since the trade, in the trader's favour:
 * the rise since a purchase, or the fall since a sale.
 */

export const NOT_ADVICE =
  "For information only. This shows what prices did after trades members of Congress disclosed; it is not investment advice or a recommendation to buy or sell anything.";

function isBuy(type: string): boolean {
  return /^P/i.test(type);
}

function verb(type: string): string {
  if (isBuy(type)) return "bought";
  if (isPartialSale(type)) return "sold part of";
  return "sold";
}

/** "since bought" / "since sold", under a figure. */
export function sinceLabel(type: string): string {
  return isBuy(type) ? "since bought" : "since sold";
}

export function FeaturedTimedTrade({ trade: t, points }: { trade: TimedTrade; points: PricePoint[] | null }) {
  const name = memberDisplayName(t);
  const buy = isBuy(t.transaction_type);
  return (
    <Link
      href={`/trades/${t.id}`}
      className="group block rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong sm:p-5"
    >
      <div className="flex items-start gap-3">
        <MemberPhoto name={name} photoUrl={t.photo_url} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Best trade</div>
          <div className="mt-0.5 text-base font-semibold leading-snug text-ink sm:text-lg">
            {name} {verb(t.transaction_type)} {t.ticker ?? displayAssetName(t)}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">
            {amountLabel(t.amount_range)} · traded {formatDate(t.transaction_date)} · disclosed {formatDate(t.filing_date)}
          </div>
        </div>
        {t.ticker ? <TickerLogo ticker={t.ticker} logo={t.logo_url} size={44} /> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
        <div>
          <div className="text-4xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-5xl">
            {formatMove(t.edge)}
          </div>
          <div className="text-xs font-semibold text-ink-muted">{buy ? "since they bought" : "since they sold"}</div>
        </div>
        <p className="max-w-md pb-1 text-sm leading-snug text-ink-muted">
          {buy
            ? `The stock has risen ${formatMove(t.edge).replace("+", "")} since the day of the purchase.`
            : `The stock has fallen ${formatMove(t.edge).replace("+", "")} since the day of the sale.`}
          {t.edge_before !== null && t.days_to_file
            ? ` By the time it was disclosed, ${t.days_to_file} days later, it ${
                t.edge_before >= 0
                  ? `had already moved ${formatMove(t.edge_before).replace("+", "")} their way`
                  : `was still ${formatMove(t.edge_before).replace("−", "")} against them`
              }.`
            : ""}
        </p>
      </div>

      {points && points.length > 4 && t.transaction_date ? (
        <div className="mt-3">
          <TradeWindowChart points={points} traded={t.transaction_date} filed={t.filing_date} kind={buy ? "buy" : "sell"} />
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
              {t.ticker ? <TickerLogo ticker={t.ticker} logo={t.logo_url} size={30} /> : <span className="h-[30px] w-[30px] shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">
                  {name} <span className="text-ink-muted">{verb(t.transaction_type)}</span> {t.ticker ?? displayAssetName(t)}
                </div>
                <div className="truncate text-xs text-ink-faint">
                  {amountLabel(t.amount_range)} · traded {formatDate(t.transaction_date)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMove(t.edge)}</div>
                <div className="text-[10px] text-ink-faint">{sinceLabel(t.transaction_type)}</div>
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
                {l.theirWay} of {l.trades} trades went their way
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
