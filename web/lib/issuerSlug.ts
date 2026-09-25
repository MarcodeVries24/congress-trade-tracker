/**
 * An issuer's URL slug, derived from its ticker.
 *
 * Deliberately dependency-free, like memberSlug: client components build
 * hrefs with it and must not pull in the database client to do so.
 *
 * Tickers in the corpus are almost entirely A-Z0-9; the exceptions are 388
 * rows carrying a dot (share classes — BRK.B) and one carrying a hyphen.
 * Folding those to "-" produces no collisions across the 2,616 distinct
 * tickers, checked against the live data.
 */
export function issuerSlug(ticker: string): string {
  return ticker.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * The same transform, in SQL, so a slug can be resolved back to its ticker in
 * one indexed-scan query rather than by pulling every ticker into memory.
 *
 * Must stay in step with issuerSlug above — they are two spellings of one
 * rule, which is why they live in the same file.
 */
export const ISSUER_SLUG_SQL = `regexp_replace(lower(regexp_replace(btrim(t.ticker), '[^A-Za-z0-9]+', '-', 'g')), '^-|-$', '', 'g')`;
