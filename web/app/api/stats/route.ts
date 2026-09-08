import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const [totals, filings, members, topTickers, lastIngested, failedFilings] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int as transactions FROM transactions`),
    pool.query(`SELECT COUNT(*)::int as filings FROM filings`),
    pool.query(`SELECT COUNT(DISTINCT member_name)::int as members FROM transactions`),
    pool.query(
      `SELECT ticker, COUNT(*)::int as count FROM transactions
       WHERE ticker IS NOT NULL
       GROUP BY ticker ORDER BY count DESC LIMIT 10`
    ),
    pool.query(`SELECT MAX(ingested_at) as last FROM filings`),
    pool.query(`SELECT COUNT(*)::int as count FROM filings WHERE parse_status = 'failed'`),
  ]);

  return NextResponse.json({
    totalTransactions: totals.rows[0]?.transactions ?? 0,
    totalFilings: filings.rows[0]?.filings ?? 0,
    totalMembers: members.rows[0]?.members ?? 0,
    topTickers: topTickers.rows,
    lastIngestedAt: lastIngested.rows[0]?.last ?? null,
    failedFilings: failedFilings.rows[0]?.count ?? 0,
  });
}
