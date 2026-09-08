import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const rows = await sql.query(
    `SELECT member_name, state_district, COUNT(*) as trade_count, MAX(transaction_date) as last_trade_date
     FROM transactions
     GROUP BY member_name, state_district
     ORDER BY trade_count DESC`
  );
  return NextResponse.json({ data: rows });
}
