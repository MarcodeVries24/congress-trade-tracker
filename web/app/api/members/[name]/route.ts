import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const rows = await sql.query(
    `SELECT t.*, f.filing_date, f.pdf_url
     FROM transactions t
     JOIN filings f ON f.doc_id = t.doc_id
     WHERE t.member_name = $1
     ORDER BY t.transaction_date DESC`,
    [decodeURIComponent(name)]
  );
  return NextResponse.json({ data: rows });
}
