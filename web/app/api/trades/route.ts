import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const SORTABLE = new Set(["transaction_date", "notification_date", "member_name", "ticker", "amount_low"]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const member = sp.get("member") ?? undefined;
  const ticker = sp.get("ticker") ?? undefined;
  const state = sp.get("state") ?? undefined;
  const type = sp.get("type") ?? undefined;
  const dateFrom = sp.get("dateFrom") ?? undefined;
  const dateTo = sp.get("dateTo") ?? undefined;
  const sort = SORTABLE.has(sp.get("sort") ?? "") ? sp.get("sort")! : "transaction_date";
  const order = sp.get("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";

  const limitNum = Math.min(Number(sp.get("limit")) || 50, 200);
  const pageNum = Math.max(Number(sp.get("page")) || 1, 1);
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q) conditions.push(`(t.member_name ILIKE ${addParam(`%${q}%`)} OR t.asset_name ILIKE ${addParam(`%${q}%`)} OR t.ticker ILIKE ${addParam(`%${q}%`)})`);
  if (member) conditions.push(`t.member_name ILIKE ${addParam(`%${member}%`)}`);
  if (ticker) conditions.push(`t.ticker = ${addParam(ticker.toUpperCase())}`);
  if (state) conditions.push(`t.state_district ILIKE ${addParam(`${state}%`)}`);
  if (type) conditions.push(`t.transaction_type ILIKE ${addParam(`${type}%`)}`);
  if (dateFrom) conditions.push(`t.transaction_date >= ${addParam(dateFrom)}`);
  if (dateTo) conditions.push(`t.transaction_date <= ${addParam(dateTo)}`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const dataParams = [...params, limitNum, offset];
  const limitPlaceholder = `$${dataParams.length - 1}`;
  const offsetPlaceholder = `$${dataParams.length}`;

  const [dataRows, countRows] = await Promise.all([
    sql.query(
      `SELECT t.*, f.filing_date, f.pdf_url
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       ${where}
       ORDER BY t.${sort} ${order} NULLS LAST
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      dataParams
    ),
    sql.query(`SELECT COUNT(*)::int as count FROM transactions t ${where}`, params),
  ]);

  const total = (countRows as { count: number }[])[0]?.count ?? 0;

  return NextResponse.json({
    data: dataRows,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
}
