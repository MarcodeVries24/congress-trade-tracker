import { sql } from "./db";
import { PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL, VOLUME_MIDPOINT_SQL } from "./sql";

/**
 * The quarterly buy/sell flow behind the chart on member and issuer pages.
 *
 * One definition, used by both, for the reason every other shared fragment in
 * lib/sql.ts exists: a member page and an issuer page show the same trade, and
 * two copies of this aggregation would eventually disagree about it. The only
 * difference between the two callers is which rows they select.
 */

export interface TradeFlowQuarter {
  /** "2026-Q3" — sortable and directly printable. */
  quarter: string;
  buy: number;
  sell: number;
  /** The portion of each that reached the public more than 45 days late. */
  buyLate: number;
  sellLate: number;
  trades: number;
  lateTrades: number;
}

/**
 * How far back the chart reaches. Five years is long enough to show a pattern
 * and short enough that the bars stay readable — the deepest history in the
 * corpus is 38 quarters, which at this width would be hairlines.
 */
export const FLOW_QUARTERS = 20;

/** Filed more than the 45 days the STOCK Act allows. */
const LATE_SQL = `(NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) > 45`;

/**
 * `condition` selects whose (or which company's) trades to chart, and owns
 * every bound parameter — the rest of the query takes none.
 */
export async function getTradeFlow(condition: string, params: unknown[]): Promise<TradeFlowQuarter[]> {
  const rows = (await sql.query(
    `SELECT to_char(date_trunc('quarter', NULLIF(t.transaction_date, '')::date), 'YYYY-"Q"Q') AS quarter,
            COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'P%'), 0)::float8 AS buy,
            COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'S%'), 0)::float8 AS sell,
            COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'P%' AND ${LATE_SQL}), 0)::float8 AS "buyLate",
            COALESCE(${VOLUME_MIDPOINT_SQL} FILTER (WHERE t.transaction_type ILIKE 'S%' AND ${LATE_SQL}), 0)::float8 AS "sellLate",
            COUNT(*)::int AS trades,
            COUNT(*) FILTER (WHERE ${LATE_SQL})::int AS "lateTrades"
     FROM transactions t
     JOIN filings f ON f.doc_id = t.doc_id
     WHERE ${condition} AND ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
       AND t.transaction_date IS NOT NULL AND t.transaction_date <> ''
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT ${FLOW_QUARTERS}`,
    params
  )) as TradeFlowQuarter[];
  return rows.reverse();
}
