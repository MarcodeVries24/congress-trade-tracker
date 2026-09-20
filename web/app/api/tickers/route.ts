import { NextResponse } from "next/server";
import { sql, PUBLISHED_FILING_SQL } from "@/lib/db";

// Backs the searchable ticker multi-select filter — same shape/purpose as
// /api/members.
export async function GET() {
  const rows = await sql.query(
    `SELECT t.ticker, COUNT(*)::int as trade_count
     FROM transactions t
     JOIN filings f ON f.doc_id = t.doc_id
     WHERE t.ticker IS NOT NULL AND t.ticker != '' AND ${PUBLISHED_FILING_SQL}
     GROUP BY t.ticker
     ORDER BY trade_count DESC`
  );
  return NextResponse.json({ data: rows });
}
