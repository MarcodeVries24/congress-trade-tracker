import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  // Grouped by (member_name, bioguide_id) rather than state_district: a
  // redistricted member's older and newer filings carry two different
  // state_district values for the same real person, which would otherwise
  // split one member into two rows here (same bug fixed in /api/politicians
  // and /api/dashboard — see politicians/route.ts's comment for the full
  // story). The displayed state_district is whichever the member's most
  // recent filing reported.
  const rows = await sql.query(
    `SELECT t.member_name,
            (ARRAY_AGG(t.state_district ORDER BY f.filing_date DESC NULLS LAST))[1] AS state_district,
            COUNT(*) as trade_count, MAX(t.transaction_date) as last_trade_date
     FROM transactions t
     JOIN filings f ON f.doc_id = t.doc_id
     GROUP BY t.member_name, f.bioguide_id
     ORDER BY trade_count DESC`
  );
  return NextResponse.json({ data: rows });
}
