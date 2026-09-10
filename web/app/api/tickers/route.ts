import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Backs the searchable ticker multi-select filter — same shape/purpose as
// /api/members.
export async function GET() {
  const rows = await sql.query(
    `SELECT ticker, COUNT(*)::int as trade_count
     FROM transactions
     WHERE ticker IS NOT NULL AND ticker != ''
     GROUP BY ticker
     ORDER BY trade_count DESC`
  );
  return NextResponse.json({ data: rows });
}
