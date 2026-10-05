/**
 * SQL fragments shared by every query that reads the trade corpus.
 *
 * Deliberately dependency-free: `ingest/` imports this (via lib/alertFilters)
 * to run the exact same matching SQL the site runs, so an alert can never
 * notify about a row the site itself wouldn't show. Keep it that way — no
 * `next/*`, no database client, no React.
 */

/**
 * A filing's transactions are shown on the site only once they are trusted:
 * 'ok' (native text parse — the PDF had a real text layer) or 'manual' (a
 * human pixel-by-pixel verified the scan against the rows).
 *
 * Deliberately excludes 'ocr'. A scanned filing's OCR output is still written
 * to the transactions table, but as a *draft*: the 2026-09 Blumenthal audit
 * found OCR under-counted every single one of his 33 scanned filings (623
 * rows read vs 1008 actually on the forms, 38% missing) and got many amounts
 * wrong, so publishing OCR output unreviewed puts confidently-wrong numbers
 * on the site. Those drafts are held back and reported in the daily email as
 * a pixel-by-pixel review queue (ingest/src/ingest/reviewQueue.ts); flipping
 * the filing to 'manual' after review is what publishes them.
 *
 * 'empty' / 'unsupported' / 'failed' / 'pending' have no transactions to show
 * anyway, and 'not-a-ptr' correctly has none. 'flagged' is a filing the admin
 * sent to manual review instead of approving: a draft, like 'ocr'.
 *
 * And nothing is shown until the admin has approved it in /admin
 * (approved_at). Every query of the corpus goes through this fragment, the
 * alert sender included, so an unapproved filing is not on any page, in any
 * count, or in anyone's alert; approving it is what releases it to all of
 * them at once. Hand verification (review:approve) sets approved_at too.
 */
export const PUBLISHED_FILING_SQL = `(f.parse_status IN ('ok', 'manual') AND f.approved_at IS NOT NULL)`;

/**
 * A transaction dated after its own filing date is impossible — that's a typo
 * in the source document (see README), not a real trade. Excluded everywhere
 * rather than showing an evidently wrong date.
 */
export const PLAUSIBLE_DATES_SQL = `((NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) IS NULL
      OR (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) >= 0)`;

/**
 * The site's one and only "Est. volume" figure.
 *
 * The STOCK Act discloses a bracket, never an exact figure, so any single
 * dollar number is an estimate — and *which* estimate has to be the same
 * everywhere, because these figures sit next to each other: a list row
 * links straight to the member page showing the same label. They disagreed
 * once already (the member page summed each bracket's lower bound while every
 * other surface summed midpoints, so Ro Khanna read $160.6M on his own page
 * and $432.3M on the politicians list — the same 25,846 trades, 2.7x apart),
 * which is what this constant exists to prevent. /about promises the midpoint by
 * name; this is that promise.
 *
 * COALESCE(amount_high, amount_low) keeps the open-ended top brackets
 * ("Over $1,000,000***") at their floor rather than dropping them to half.
 */
export const VOLUME_MIDPOINT_SQL = `SUM((COALESCE(t.amount_low, 0) + COALESCE(t.amount_high, t.amount_low, 0)) / 2.0)`;

/**
 * A company's logo for the browser to load straight from the provider, so a
 * list of trades does not send one request per logo through this site:
 * the logo's address, '' when it has been looked up and there is none (the
 * lettered tile is drawn without asking), or NULL when it has not been looked
 * up yet (the browser falls back to /api/logo). Needs `cmc` joined.
 */
export const LOGO_SQL = `CASE WHEN cmc.logo_url ~ '^https://' THEN cmc.logo_url WHEN cmc.logo_checked_at IS NOT NULL THEN '' END`;
