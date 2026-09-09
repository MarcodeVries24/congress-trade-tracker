import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// A transaction dated after its own filing date is impossible (a source
// document typo) — excluded here too, so stats match what the trade list
// actually shows. See the same condition in app/api/trades/route.ts.
const VALID_DATE_ORDER = `(
  (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) IS NULL
  OR (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) >= 0
)`;

export async function GET(req: NextRequest) {
  // Defaults to House-only, same reasoning as /api/trades.
  const chambersParam = req.nextUrl.searchParams.getAll("chamber");
  const chambers = chambersParam.length ? chambersParam : ["house"];
  const placeholders = chambers.map((_, i) => `$${i + 1}`).join(", ");
  const chamberFilter = `f.chamber IN (${placeholders})`;

  const [totals, filings, members, volume, topTickers, lastIngested, failedFilings, lastCheckedRun] = (await Promise.all([
    sql.query(
      `SELECT COUNT(*)::int as transactions
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${VALID_DATE_ORDER} AND ${chamberFilter}`,
      chambers
    ),
    sql.query(`SELECT COUNT(*)::int as filings FROM filings f WHERE ${chamberFilter}`, chambers),
    sql.query(
      `SELECT COUNT(DISTINCT t.member_name)::int as members
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${chamberFilter}`,
      chambers
    ),
    // Amount is disclosed as a range, not an exact figure — this is the sum of
    // range midpoints, i.e. a rough estimate, not a precise trading volume.
    sql.query(
      `SELECT SUM((COALESCE(t.amount_low, 0) + COALESCE(t.amount_high, t.amount_low, 0)) / 2.0)::float8 as volume
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${VALID_DATE_ORDER} AND ${chamberFilter}`,
      chambers
    ),
    sql.query(
      `SELECT t.ticker, COUNT(*)::int as count
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.ticker IS NOT NULL AND ${VALID_DATE_ORDER} AND ${chamberFilter}
       GROUP BY t.ticker ORDER BY count DESC LIMIT 10`,
      chambers
    ),
    sql.query(`SELECT MAX(ingested_at) as last FROM filings f WHERE ${chamberFilter}`, chambers),
    sql.query(`SELECT COUNT(*)::int as count FROM filings f WHERE parse_status = 'failed' AND ${chamberFilter}`, chambers),
    // Heartbeat: written at the end of every scheduled run, whether or not
    // it found anything new — proves the pipeline is alive even on a quiet
    // check, unlike lastIngestedAt which only moves on actual new data.
    sql.query(`SELECT checked_at FROM ingest_runs LIMIT 1`),
  ])) as [
    { transactions: number }[],
    { filings: number }[],
    { members: number }[],
    { volume: number | null }[],
    { ticker: string; count: number }[],
    { last: string | null }[],
    { count: number }[],
    { checked_at: string }[],
  ];

  return NextResponse.json({
    totalTransactions: totals[0]?.transactions ?? 0,
    totalFilings: filings[0]?.filings ?? 0,
    totalMembers: members[0]?.members ?? 0,
    estimatedVolume: volume[0]?.volume ?? 0,
    topTickers,
    lastIngestedAt: lastIngested[0]?.last ?? null,
    lastCheckedAt: lastCheckedRun[0]?.checked_at ?? null,
    failedFilings: failedFilings[0]?.count ?? 0,
  });
}
