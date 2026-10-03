import { unstable_cache } from "next/cache";
import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "@/lib/db";
import type { Trade } from "@/lib/api";
import { ALERT_FROM_SQL } from "@/lib/alertFilters";
import { getMemberDirectory } from "@/lib/members";
import { getTimingSummary, PRICE_JOINS_SQL, type TimingSummary } from "@/lib/prices";
import { TRADE_COLUMNS_SQL } from "@/lib/trade";

/**
 * "Before the public knew", across Congress: the recently disclosed trades
 * whose stock moved furthest the trader's way between the trade and its
 * disclosure, the members whose trades do that most consistently, and the
 * figures for everyone. The home page features the first; /before-disclosure
 * and the app's Discover show all three.
 *
 * "The trader's way" is a rise after a purchase or a fall after a sale,
 * measured close to close (see lib/prices.ts). It describes timing. It says
 * nothing about why, and the copy around it says so.
 */

/** The move, signed so that positive went the trader's way. */
const EDGE_SQL = `CASE WHEN t.transaction_type ILIKE 'P%' THEN ppf.close / ppt.close - 1 ELSE 1 - ppf.close / ppt.close END`;

/**
 * Every trade the rankings consider: published, plausibly dated, a purchase
 * or sale, priced on both days, and disclosed after the day it was made (a
 * same-day disclosure has no stretch to measure) but within the 45 days the
 * STOCK Act allows. A late filing's move is the filer's delay as much as
 * their timing, and a ranking of rule-breakers is a different list; the
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
            ${TRADE_COLUMNS_SQL}, ${EDGE_SQL} AS edge
          ${ALERT_FROM_SQL}
          ${PRICE_JOINS_SQL}
          WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
            AND ppt.close > 0 AND ppf.close > 0
            AND (t.transaction_type ILIKE 'P%' OR t.transaction_type ILIKE 'S%')
            AND f.filing_date <> t.transaction_date
            AND NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date <= ${ON_TIME_DAYS}
            AND NULLIF(f.filing_date, '')::date >= CURRENT_DATE - ${windowParam}::int
            AND abs(ppf.close / ppt.close - 1) <= 4
          ORDER BY t.doc_id, COALESCE(NULLIF(t.ticker, ''), t.asset_name), upper(left(t.transaction_type, 1)), t.amount_low DESC NULLS LAST`;
}

export type TimedTrade = Trade & { member_slug: string | null; edge: number };

export interface TimingLeader {
  slug: string;
  display: string;
  photo_url: string | null;
  party: string | null;
  /** Priced trades in the window. */
  trades: number;
  theirWay: number;
  averageEdge: number;
}

export interface TimingOverview {
  days: number;
  summary: TimingSummary | null;
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
  const [tradeRows, memberRows, summary, directory] = await Promise.all([
    sql.query(`SELECT * FROM (${rankedTradesSql("$1")}) r ORDER BY edge DESC LIMIT $2`, [
      days,
      tradeLimit * 6,
    ]) as unknown as Promise<(Trade & { edge: number })[]>,
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
    getTimingSummary(`NULLIF(f.filing_date, '')::date >= CURRENT_DATE - $1::int`, [days]).catch(() => null),
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
    trades.push({ ...t, edge: Number(t.edge), member_slug: slug });
    if (trades.length >= tradeLimit) break;
  }

  return { days, summary, trades, leaders };
}

/**
 * The same, kept for an hour across requests: the page and the API both
 * read it, and the prices behind it change once a day.
 */
export const getTimingOverviewCached = unstable_cache(getTimingOverview, ["timing-overview-on-time"], { revalidate: 3600 });
