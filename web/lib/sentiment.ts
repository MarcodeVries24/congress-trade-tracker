import { sql } from "./db";
import { PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL, VOLUME_MIDPOINT_SQL } from "./sql";

/**
 * The home page's flow chart: what Congress bought and sold, week by week.
 *
 * Two readings of the same weeks, because they answer different questions and
 * disagree in interesting ways. By value, one $5M sale outweighs fifty $1,001
 * purchases — it moves when someone large moves. By count, every decision
 * weighs the same. When the two point opposite ways, a handful of big trades
 * are pulling against the crowd.
 */

/** Two years: long enough to show a turn, short enough that a week is a visible slice. */
const WEEKS_BACK = 760;

/**
 * The most recent window every trade in it must legally have been disclosed
 * by. Congress has 45 days, so anything newer is still arriving and would read
 * as a collapse in activity that hasn't happened. The headline figure is taken
 * from the 90 days *before* that cutoff, never from the incomplete edge.
 */
export const DISCLOSURE_DEADLINE_DAYS = 45;
const SETTLED_WINDOW_DAYS = 90;

export interface RiverWeek {
  /** Monday of the week, "YYYY-MM-DD". */
  week: string;
  buyValue: number;
  sellValue: number;
  buyCount: number;
  sellCount: number;
  members: number;
}

export interface RiverReading {
  buyValue: number;
  sellValue: number;
  buyCount: number;
  sellCount: number;
  trades: number;
  members: number;
  /** The last day of the window — everything after it may still be unfiled. */
  settledThrough: string;
}

export interface RiverData {
  weeks: RiverWeek[];
  settled: RiverReading;
}

export async function getRiverData(): Promise<RiverData> {
  const [weeks, settled] = await Promise.all([
    sql.query(
      `SELECT to_char(date_trunc('week', NULLIF(t.transaction_date, '')::date), 'YYYY-MM-DD') AS week,
              COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'P%'), 0)::float8 AS "buyValue",
              COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'S%'), 0)::float8 AS "sellValue",
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'P%')::int AS "buyCount",
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'S%')::int AS "sellCount",
              COUNT(DISTINCT COALESCE(f.bioguide_id, t.member_name))::int AS members
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
         AND t.transaction_date IS NOT NULL AND t.transaction_date <> ''
         AND NULLIF(t.transaction_date, '')::date >= CURRENT_DATE - ${WEEKS_BACK}
         AND NULLIF(t.transaction_date, '')::date <= CURRENT_DATE
       GROUP BY 1 ORDER BY 1`
    ),
    sql.query(
      `SELECT COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'P%'), 0)::float8 AS "buyValue",
              COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'S%'), 0)::float8 AS "sellValue",
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'P%')::int AS "buyCount",
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'S%')::int AS "sellCount",
              COUNT(*)::int AS trades,
              COUNT(DISTINCT COALESCE(f.bioguide_id, t.member_name))::int AS members,
              to_char(CURRENT_DATE - ${DISCLOSURE_DEADLINE_DAYS}, 'YYYY-MM-DD') AS "settledThrough"
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
         AND NULLIF(t.transaction_date, '')::date
             BETWEEN CURRENT_DATE - ${DISCLOSURE_DEADLINE_DAYS + SETTLED_WINDOW_DAYS}
                 AND CURRENT_DATE - ${DISCLOSURE_DEADLINE_DAYS}`
    ),
  ]);
  return { weeks: weeks as RiverWeek[], settled: (settled as RiverReading[])[0] };
}
