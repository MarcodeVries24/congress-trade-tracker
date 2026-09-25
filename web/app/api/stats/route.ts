import { NextRequest, NextResponse } from "next/server";
import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL, VOLUME_MIDPOINT_SQL } from "@/lib/db";
import { groupMembers } from "@/lib/members";

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
       WHERE ${PLAUSIBLE_DATES_SQL} AND ${chamberFilter} AND ${PUBLISHED_FILING_SQL}`,
      chambers
    ),
    sql.query(`SELECT COUNT(*)::int as filings FROM filings f WHERE ${chamberFilter}`, chambers),
    // Distinct *people*, not distinct spellings. COUNT(DISTINCT member_name)
    // returned 291 where the politicians list showed 273, because the same
    // member is filed under several names — Marjorie Taylor Greene twice,
    // Scott Franklin four times. Grouped with the same function the
    // leaderboard and the member pages use, so all three agree.
    sql.query(
      `SELECT t.member_name, f.bioguide_id, COUNT(*)::int AS trades
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${chamberFilter} AND ${PUBLISHED_FILING_SQL}
       GROUP BY 1, 2`,
      chambers
    ),
    // Amount is disclosed as a range, not an exact figure — this is the sum of
    // range midpoints, i.e. a rough estimate, not a precise trading volume.
    sql.query(
      `SELECT ${VOLUME_MIDPOINT_SQL}::float8 as volume
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${PLAUSIBLE_DATES_SQL} AND ${chamberFilter} AND ${PUBLISHED_FILING_SQL}`,
      chambers
    ),
    sql.query(
      `SELECT t.ticker, COUNT(*)::int as count
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.ticker IS NOT NULL AND ${PLAUSIBLE_DATES_SQL} AND ${chamberFilter} AND ${PUBLISHED_FILING_SQL}
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
    { member_name: string; bioguide_id: string | null; trades: number }[],
    { volume: number | null }[],
    { ticker: string; count: number }[],
    { last: string | null }[],
    { count: number }[],
    { checked_at: string }[],
  ];

  return NextResponse.json({
    totalTransactions: totals[0]?.transactions ?? 0,
    totalFilings: filings[0]?.filings ?? 0,
    totalMembers: groupMembers(members).length,
    estimatedVolume: volume[0]?.volume ?? 0,
    topTickers,
    lastIngestedAt: lastIngested[0]?.last ?? null,
    lastCheckedAt: lastCheckedRun[0]?.checked_at ?? null,
    failedFilings: failedFilings[0]?.count ?? 0,
  });
}
