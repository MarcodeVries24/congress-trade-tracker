/**
 * The /api/trades parameters only CongTrade Pro may use.
 *
 * The route honours them for Pro and drops them for everyone else, so an
 * answer that uses one depends on who asked: it is never cached, and the app
 * sends its sign-in with it. An answer without any is the same for everyone,
 * is cached at the CDN, and is asked for without a sign-in, which Vercel would
 * otherwise take as a reason to skip the cache.
 */
export const GATED_TRADE_PARAMS = [
  "members",
  "tickers",
  "parties",
  "states",
  "state",
  "types",
  "owners",
  "minAmount",
  "amountRanges",
  "marketCapTiers",
  "filedStatus",
  "dateFrom",
  "dateTo",
  "tradedFrom",
  "tradedTo",
] as const;

export function usesGatedTradeParams(params: URLSearchParams): boolean {
  return GATED_TRADE_PARAMS.some((key) => params.has(key));
}
