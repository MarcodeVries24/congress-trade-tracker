import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Same impossible-date guard used across /api/trades, /api/stats, /api/dashboard.
const VALID_DATE_ORDER = `(
  (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) IS NULL
  OR (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) >= 0
)`;

// Range midpoint estimate, summed per member — same formula /api/stats and
// /api/dashboard use.
const VOLUME_EXPR = `SUM((COALESCE(t.amount_low, 0) + COALESCE(t.amount_high, t.amount_low, 0)) / 2.0)`;

const SORT_EXPRESSIONS: Record<string, string> = {
  trade_count: "trade_count",
  volume_sum: "volume_sum",
  last_filed: "last_filed",
};

// A politician leaderboard — free/ungated, like /api/members and
// /api/dashboard. Grouped by (member_name, bioguide_id, chamber) rather than
// state_district: a redistricted member's older and newer filings carry two
// different state_district values for the same real person (confirmed on
// real data — e.g. Nancy Pelosi's CA11 vs CA12 filings both resolve to
// bioguide P000197), so grouping on state_district split 17 real members
// into two rows apiece and inflated this leaderboard's count past /api/stats'
// true distinct-member count. bioguide_id is stable across a member's own
// filings regardless of district, so it collapses these back into one row;
// the displayed state_district is simply whichever the member's most recent
// filing reported, picked via the ordered ARRAY_AGG below. A chamber change
// (House <-> Senate) still produces two rows deliberately, since that's a
// real distinguishable phase of a career rather than a district-code split.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const chambers = sp.getAll("chamber");
  const sortKey = sp.get("sort") ?? "trade_count";
  const sortExpr = SORT_EXPRESSIONS[sortKey] ?? SORT_EXPRESSIONS.trade_count;
  const order = sp.get("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";

  const limitNum = Math.min(Number(sp.get("limit")) || 25, 200);
  const pageNum = Math.max(Number(sp.get("page")) || 1, 1);
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [VALID_DATE_ORDER];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q) conditions.push(`t.member_name ILIKE ${addParam(`%${q}%`)}`);
  if (chambers.length) {
    const placeholders = chambers.map((c) => addParam(c));
    conditions.push(`f.chamber IN (${placeholders.join(", ")})`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const dataParams = [...params, limitNum, offset];
  const limitPlaceholder = `$${dataParams.length - 1}`;
  const offsetPlaceholder = `$${dataParams.length}`;

  const [dataRows, countRows] = await Promise.all([
    sql.query(
      `SELECT t.member_name,
              (ARRAY_AGG(t.state_district ORDER BY f.filing_date DESC NULLS LAST))[1] AS state_district,
              COALESCE(mh.party, (ARRAY_AGG(mr.party ORDER BY f.filing_date DESC NULLS LAST))[1]) AS party,
              COALESCE(mh.photo_url, (ARRAY_AGG(mr.photo_url ORDER BY f.filing_date DESC NULLS LAST))[1]) AS photo_url,
              COALESCE(mh.state, (ARRAY_AGG(mr.state ORDER BY f.filing_date DESC NULLS LAST))[1]) AS member_state,
              f.chamber, COUNT(*)::int as trade_count, ${VOLUME_EXPR}::float8 as volume_sum, MAX(f.filing_date) as last_filed
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       ${where}
       GROUP BY t.member_name, f.bioguide_id, mh.party, mh.photo_url, mh.state, f.chamber
       ORDER BY ${sortExpr} ${order} NULLS LAST
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      dataParams
    ),
    sql.query(
      `SELECT COUNT(*)::int as count FROM (
         SELECT 1
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         ${where}
         GROUP BY t.member_name, f.bioguide_id, f.chamber
       ) sub`,
      params
    ),
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
