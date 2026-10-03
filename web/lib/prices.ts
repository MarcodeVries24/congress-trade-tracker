import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "@/lib/db";

/**
 * What a stock did around a trade.
 *
 * Three closes, kept by the ingest's price sync (ingest/src/ingest/syncPrices.ts):
 * on the day the member traded, on the day the trade was disclosed, and the
 * latest. The first gap is the one the STOCK Act exists to keep short, and the
 * move inside it is what the public could not have acted on, because it did
 * not know yet.
 *
 * Every query that lists trades attaches them with the same two fragments, so
 * the trades table, the member pages, the company pages and the app all
 * compute a move from the same rows.
 */
export const PRICE_JOINS_SQL = `
  LEFT JOIN price_points ppt ON ppt.ticker = t.ticker AND ppt.day = t.transaction_date
  LEFT JOIN price_points ppf ON ppf.ticker = t.ticker AND ppf.day = f.filing_date
  LEFT JOIN price_latest pl ON pl.ticker = t.ticker AND pl.status = 'ok'`;

export const PRICE_COLUMNS_SQL = `ppt.close AS price_at_trade, ppf.close AS price_at_filing,
  pl.close AS price_now, pl.close_day AS price_now_day`;

export {
  change,
  formatMove,
  inTheirFavour,
  moveBeforeDisclosure,
  moveSinceDisclosure,
  moveSinceTrade,
  type TradePrices,
} from "./priceMath";

export interface TimingSummary {
  /** Purchases and sales with a close on both the trade and the disclosure date. */
  priced: number;
  /** Of those, how many moved the trader's way before disclosure. */
  theirWay: number;
  /**
   * The average move before disclosure, signed so that positive means it went
   * the trader's way (a rise after a purchase, a fall after a sale).
   */
  averageEdge: number | null;
  /** Trades disclosed the same day they were made have no gap to measure. */
  sameDay: number;
}

/**
 * How the stock moved between trade and disclosure, over everything a set of
 * trades has, for the member and company pages.
 *
 * @param where   a condition over `t` and `f`, e.g. "t.member_name = ANY($1)"
 */
export async function getTimingSummary(where: string, params: unknown[]): Promise<TimingSummary> {
  const rows = (await sql.query(
    `WITH moves AS (
       SELECT t.transaction_type, f.filing_date = t.transaction_date AS same_day,
              ppf.close / ppt.close - 1 AS move
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       ${PRICE_JOINS_SQL}
       WHERE ${where} AND ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
         AND ppt.close > 0 AND ppf.close > 0
         AND (t.transaction_type ILIKE 'P%' OR t.transaction_type ILIKE 'S%')
     )
     SELECT COUNT(*) FILTER (WHERE NOT same_day)::int AS priced,
            COUNT(*) FILTER (WHERE same_day)::int AS same_day,
            COUNT(*) FILTER (WHERE NOT same_day AND (
              (transaction_type ILIKE 'P%' AND move > 0) OR (transaction_type ILIKE 'S%' AND move < 0)
            ))::int AS their_way,
            AVG(CASE WHEN transaction_type ILIKE 'P%' THEN move ELSE -move END) FILTER (WHERE NOT same_day)::float8 AS average_edge
     FROM moves`,
    params
  )) as {
    priced: number;
    same_day: number;
    their_way: number;
    average_edge: number | null;
  }[];
  const r = rows[0];
  return {
    priced: r?.priced ?? 0,
    theirWay: r?.their_way ?? 0,
    averageEdge: r?.average_edge ?? null,
    sameDay: r?.same_day ?? 0,
  };
}
