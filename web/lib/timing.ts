import { unstable_cache } from "next/cache";
import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "@/lib/db";
import type { Trade } from "@/lib/api";
import { ALERT_FROM_SQL } from "@/lib/alertFilters";
import { getMemberDirectory } from "@/lib/members";
import { PRICE_JOINS_SQL } from "@/lib/prices";
import { TRADE_COLUMNS_SQL } from "@/lib/trade";

/**
 * Congress's best trades: the recently disclosed trades that have done best
 * since the day they were made, and the members whose trades do best on
 * average. The home page and Discover show the first; /best-trades and the
 * app's ranking screen show both.
 *
 * "Done best" is the stock's move from its close on the trade date to the
 * latest close, signed for the trade: a rise after a purchase, a fall after a
 * sale (the loss the seller avoided). It is the stock's return, not the
 * member's: filings give a value range, never the price paid. It says
 * nothing about why, and the copy around it says so.
 */

/** Since the trade, signed so that positive went the trader's way. */
const EDGE_SQL = `CASE WHEN t.transaction_type ILIKE 'P%' THEN pl.close / ppt.close - 1 ELSE 1 - pl.close / ppt.close END`;
/** The same between the trade and its disclosure, for context; null when unpriced. */
const EDGE_BEFORE_SQL = `CASE WHEN ppf.close > 0 THEN (CASE WHEN t.transaction_type ILIKE 'P%' THEN ppf.close / ppt.close - 1 ELSE 1 - ppf.close / ppt.close END) END`;

/**
 * Every trade the rankings consider: published, plausibly dated, a purchase
 * or sale, priced on the trade date and today, and disclosed within the 45
 * days the STOCK Act allows. A late filing is a different story, and the
 * trade pages and the "Filed late" filter cover those.
 *
 * One row per filing, asset and direction: a member who bought the same stock
 * in five lots across a filing made one decision, and five rows would fill a
 * top ten with it. The largest lot stands for the group.
 *
 * Moves above 400% are left out of the rankings. A few of the very largest
 * are real, but most at that size are a ticker matched to the wrong listing
 * or a thinly traded line, and a leaderboard topped by data errors would
 * discredit the rest.
 */
const ON_TIME_DAYS = 45;

function rankedTradesSql(windowParam: string): string {
  return `SELECT DISTINCT ON (t.doc_id, COALESCE(NULLIF(t.ticker, ''), t.asset_name), upper(left(t.transaction_type, 1)))
            ${TRADE_COLUMNS_SQL}, ${EDGE_SQL} AS edge, ${EDGE_BEFORE_SQL} AS edge_before
          ${ALERT_FROM_SQL}
          ${PRICE_JOINS_SQL}
          WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
            AND ppt.close > 0 AND pl.close > 0
            AND (t.transaction_type ILIKE 'P%' OR t.transaction_type ILIKE 'S%')
            AND NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date <= ${ON_TIME_DAYS}
            AND NULLIF(f.filing_date, '')::date >= CURRENT_DATE - ${windowParam}::int
            AND abs(pl.close / ppt.close - 1) <= 4
          ORDER BY t.doc_id, COALESCE(NULLIF(t.ticker, ''), t.asset_name), upper(left(t.transaction_type, 1)), t.amount_low DESC NULLS LAST`;
}

export type TimedTrade = Trade & {
  member_slug: string | null;
  /** Since the trade, in the trader's favour. */
  edge: number;
  /** Between the trade and its disclosure, in the trader's favour. */
  edge_before: number | null;
};

export interface TimingLeader {
  slug: string;
  display: string;
  photo_url: string | null;
  party: string | null;
  /** Priced trades over the past year. */
  trades: number;
  theirWay: number;
  averageEdge: number;
}

export interface TimingOverview {
  days: number;
  trades: TimedTrade[];
  leaders: TimingLeader[];
}

/** The windows offered, in days of disclosure. */
export const TIMING_WINDOWS = [30, 90, 365] as const;
export type TimingWindow = (typeof TIMING_WINDOWS)[number];

export function parseTimingWindow(value: unknown): TimingWindow {
  const n = Number(value);
  return (TIMING_WINDOWS as readonly number[]).includes(n) ? (n as TimingWindow) : 90;
}

// At most this many of one member's trades in a ranking, so one well-timed
// filing of twenty stocks does not become the whole list.
const PER_MEMBER = 2;

// A member needs this many priced trades in the window to be ranked: an
// average over two trades is luck, not a pattern.
const LEADER_MIN_TRADES = 5;

export async function getTimingOverview(
  days: TimingWindow,
  { trades: tradeLimit = 25, leaders: leaderLimit = 15 } = {}
): Promise<TimingOverview> {
  const [tradeRows, memberRows, directory] = await Promise.all([
    sql.query(`SELECT * FROM (${rankedTradesSql("$1")}) r ORDER BY edge DESC LIMIT $2`, [
      days,
      tradeLimit * 6,
    ]) as unknown as Promise<(Trade & { edge: number; edge_before: number | null })[]>,
    // Leaders are judged over at least a year, whatever the trade window:
    // a month holds too few trades per member to rank anyone fairly.
    sql.query(
      `SELECT member_name, COUNT(*)::int AS trades,
              COUNT(*) FILTER (WHERE edge > 0)::int AS their_way,
              SUM(edge)::float8 AS edge_sum,
              MAX(photo_url) AS photo_url, MAX(party) AS party
       FROM (${rankedTradesSql("$1")}) r
       GROUP BY member_name`,
      [Math.max(days, 365)]
    ) as unknown as Promise<
      { member_name: string; trades: number; their_way: number; edge_sum: number; photo_url: string | null; party: string | null }[]
    >,
    getMemberDirectory(),
  ]);

  const entryByName = new Map<string, (typeof directory)[number]>();
  for (const entry of directory) for (const name of entry.names) entryByName.set(name, entry);

  // A member filed under several spellings is one person here, as everywhere.
  const bySlug = new Map<string, TimingLeader & { edgeSum: number }>();
  for (const row of memberRows) {
    const entry = entryByName.get(row.member_name);
    if (!entry) continue;
    const prev = bySlug.get(entry.slug);
    const next = prev ?? {
      slug: entry.slug,
      display: entry.display,
      photo_url: row.photo_url,
      party: row.party,
      trades: 0,
      theirWay: 0,
      averageEdge: 0,
      edgeSum: 0,
    };
    next.trades += row.trades;
    next.theirWay += row.their_way;
    next.edgeSum += row.edge_sum;
    next.photo_url ??= row.photo_url;
    next.party ??= row.party;
    bySlug.set(entry.slug, next);
  }
  const leaders = [...bySlug.values()]
    .filter((l) => l.trades >= LEADER_MIN_TRADES)
    .map(({ edgeSum, ...l }) => ({ ...l, averageEdge: edgeSum / l.trades }))
    .sort((a, b) => b.averageEdge - a.averageEdge)
    .slice(0, leaderLimit);

  const perMember = new Map<string, number>();
  const trades: TimedTrade[] = [];
  for (const t of tradeRows) {
    const slug = entryByName.get(t.member_name)?.slug ?? null;
    const key = slug ?? t.member_name;
    const n = perMember.get(key) ?? 0;
    if (n >= PER_MEMBER) continue;
    perMember.set(key, n + 1);
    trades.push({
      ...t,
      edge: Number(t.edge),
      edge_before: t.edge_before === null ? null : Number(t.edge_before),
      member_slug: slug,
    });
    if (trades.length >= tradeLimit) break;
  }

  return { days, trades, leaders };
}

/**
 * The same, kept for an hour across requests: the page and the API both
 * read it, and the prices behind it change once a day.
 */
export const getTimingOverviewCached = unstable_cache(getTimingOverview, ["best-trades-since-trade"], { revalidate: 3600 });
