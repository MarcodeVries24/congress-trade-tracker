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
