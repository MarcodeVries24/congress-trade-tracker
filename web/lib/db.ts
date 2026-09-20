import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Point it at your Neon Postgres connection string.");
}

// HTTP-only client (no WebSocket/TCP needed) — well suited to Vercel's
// serverless functions, and to any sandboxed dev environment that only
// allows plain HTTPS outbound.
export const sql = neon(connectionString);

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
 * anyway, and 'not-a-ptr' correctly has none.
 */
export const PUBLISHED_FILING_SQL = `f.parse_status IN ('ok', 'manual')`;
