import { sql } from "./db";
import { PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "./sql";

/**
 * How the corpus got here, in numbers rather than adjectives.
 *
 * The claim worth making on a front page isn't "accurate data" — everyone
 * writes that. It's that a scanned filing whose OCR we don't trust is held
 * back and reviewed by hand rather than published as a guess, and that every
 * row on the site links to the document it came from. These counts are what
 * make that checkable.
 */
export interface Provenance {
  filings: number;
  /** Read from the document's own text layer. */
  textParsed: number;
  /** A scan, checked line by line against the source before publishing. */
  handVerified: number;
  /** OCR output still waiting on that review — never shown as a trade. */
  awaitingReview: number;
  trades: number;
  members: number;
  lastCheckedAt: string | null;
}

export async function getProvenance(): Promise<Provenance> {
  const [rows] = (await sql.query(
    `SELECT COUNT(*)::int AS filings,
            COUNT(*) FILTER (WHERE parse_status = 'ok')::int AS "textParsed",
            COUNT(*) FILTER (WHERE parse_status = 'manual')::int AS "handVerified",
            COUNT(*) FILTER (WHERE parse_status = 'ocr')::int AS "awaitingReview",
            (SELECT COUNT(*)::int FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
              WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}) AS trades,
            (SELECT COUNT(DISTINCT COALESCE(f.bioguide_id, t.member_name))::int
              FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
              WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}) AS members,
            (SELECT to_char(checked_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') FROM ingest_runs LIMIT 1) AS "lastCheckedAt"
     FROM filings`
  )) as Provenance[];
  return rows;
}
