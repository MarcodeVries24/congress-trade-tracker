import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const [totals, filings, members, topTickers, lastIngested, failedFilings] = (await Promise.all([
    sql.query(`SELECT COUNT(*)::int as transactions FROM transactions`),
    sql.query(`SELECT COUNT(*)::int as filings FROM filings`),
    sql.query(`SELECT COUNT(DISTINCT member_name)::int as members FROM transactions`),
    sql.query(
      `SELECT ticker, COUNT(*)::int as count FROM transactions
       WHERE ticker IS NOT NULL
       GROUP BY ticker ORDER BY count DESC LIMIT 10`
    ),
    sql.query(`SELECT MAX(ingested_at) as last FROM filings`),
    sql.query(`SELECT COUNT(*)::int as count FROM filings WHERE parse_status = 'failed'`),
  ])) as [
    { transactions: number }[],
    { filings: number }[],
    { members: number }[],
    { ticker: string; count: number }[],
    { last: string | null }[],
    { count: number }[],
  ];

  return NextResponse.json({
    totalTransactions: totals[0]?.transactions ?? 0,
    totalFilings: filings[0]?.filings ?? 0,
    totalMembers: members[0]?.members ?? 0,
    topTickers,
    lastIngestedAt: lastIngested[0]?.last ?? null,
    failedFilings: failedFilings[0]?.count ?? 0,
  });
}
