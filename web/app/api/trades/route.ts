import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ASSET_TYPE_VALUES, MARKET_CAP_TIERS } from "@/lib/api";

// Plain columns sort directly; "days_to_file" is a computed expression.
const SORT_EXPRESSIONS: Record<string, string> = {
  transaction_date: "t.transaction_date",
  notification_date: "t.notification_date",
  filing_date: "f.filing_date",
  member_name: "t.member_name",
  ticker: "t.ticker",
  amount_low: "t.amount_low",
  days_to_file: "days_to_file",
  market_cap: "cmc.market_cap",
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const member = sp.get("member") ?? undefined;
  const ticker = sp.get("ticker") ?? undefined;
  const state = sp.get("state") ?? undefined;
  const type = sp.get("type") ?? undefined;
  const owner = sp.get("owner") ?? undefined; // "self" | "JT" | "SP" | "DC"
  const assetTypes = sp.getAll("assetTypes"); // canonical codes — expanded via ASSET_TYPE_VALUES below
  const amountRanges = sp.getAll("amountRanges");
  const marketCapTiers = sp.getAll("marketCapTiers");
  // Defaults to House-only. Pass chamber=house&chamber=senate (repeated) to
  // include both once Senate coverage exists — never implicit/all-by-default,
  // so this stays safe even before Senate data is fully wired into the UI.
  const chambers = sp.getAll("chamber");
  const chamberFilter = chambers.length ? chambers : ["house"];
  const filedStatus = sp.get("filedStatus") ?? undefined; // "late" | "onTime" | undefined
  const dateFrom = sp.get("dateFrom") ?? undefined;
  const dateTo = sp.get("dateTo") ?? undefined;
  const sortKey = sp.get("sort") ?? "";
  const sortExpr = SORT_EXPRESSIONS[sortKey] ?? SORT_EXPRESSIONS.filing_date;
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

  // A transaction dated after its own filing date is impossible — that's a
  // typo in the source document (see README), not a real trade. Exclude
  // these from the default view rather than showing an evidently wrong date.
  conditions.push(
    `((NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) IS NULL
      OR (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) >= 0)`
  );
  {
    const placeholders = chamberFilter.map((c) => addParam(c));
    conditions.push(`f.chamber IN (${placeholders.join(", ")})`);
  }

  if (q) conditions.push(`(t.member_name ILIKE ${addParam(`%${q}%`)} OR t.asset_name ILIKE ${addParam(`%${q}%`)} OR t.ticker ILIKE ${addParam(`%${q}%`)})`);
  if (member) conditions.push(`t.member_name ILIKE ${addParam(`%${member}%`)}`);
  if (ticker) conditions.push(`t.ticker = ${addParam(ticker.toUpperCase())}`);
  if (state) conditions.push(`t.state_district ILIKE ${addParam(`${state}%`)}`);
  if (type) conditions.push(`t.transaction_type ILIKE ${addParam(`${type}%`)}`);
  if (owner === "self") conditions.push(`t.owner IS NULL`);
  else if (owner) conditions.push(`t.owner = ${addParam(owner)}`);
  if (assetTypes.length) {
    const rawValues = assetTypes.flatMap((code) => ASSET_TYPE_VALUES[code] ?? [code]);
    const placeholders = rawValues.map((v) => addParam(v));
    conditions.push(`t.asset_type_code IN (${placeholders.join(", ")})`);
  }
  if (amountRanges.length) {
    const placeholders = amountRanges.map((r) => addParam(r));
    conditions.push(`t.amount_range IN (${placeholders.join(", ")})`);
  }
  if (marketCapTiers.length) {
    const tierConditions = marketCapTiers
      .map((value) => MARKET_CAP_TIERS.find((t) => t.value === value))
      .filter((t): t is (typeof MARKET_CAP_TIERS)[number] => t !== undefined)
      .map((tier) => {
        if (tier.value === "undefined") return `cmc.market_cap IS NULL`;
        const parts: string[] = [];
        if (tier.min !== null) parts.push(`cmc.market_cap >= ${addParam(tier.min)}`);
        if (tier.max !== null) parts.push(`cmc.market_cap < ${addParam(tier.max)}`);
        return `(${parts.join(" AND ")})`;
      });
    if (tierConditions.length) conditions.push(`(${tierConditions.join(" OR ")})`);
  }
  if (dateFrom) conditions.push(`f.filing_date >= ${addParam(dateFrom)}`);
  if (dateTo) conditions.push(`f.filing_date <= ${addParam(dateTo)}`);
  // STOCK Act requires filing within 45 days of the transaction.
  if (filedStatus === "late") {
    conditions.push(`(NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) > 45`);
  } else if (filedStatus === "onTime") {
    conditions.push(`(NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) <= 45`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const dataParams = [...params, limitNum, offset];
  const limitPlaceholder = `$${dataParams.length - 1}`;
  const offsetPlaceholder = `$${dataParams.length}`;

  // Most House OCR rows have an asset name but no ticker (see
  // ocrHousePtr.ts) — asset_name_tickers resolves those to a ticker once
  // (syncMarketCaps.ts) so they can still match a market cap; a row with
  // neither a direct nor resolved ticker, or one Finnhub had no cap for,
  // surfaces as market_cap = NULL ("Undefined" in the UI, not zero).
  const marketCapJoin = `
       LEFT JOIN asset_name_tickers ant ON (t.ticker IS NULL OR t.ticker = '') AND ant.asset_name = t.asset_name
       LEFT JOIN company_market_caps cmc ON cmc.ticker = COALESCE(NULLIF(t.ticker, ''), ant.ticker)`;

  const [dataRows, countRows] = await Promise.all([
    sql.query(
      `SELECT t.*, f.filing_date, f.pdf_url, f.chamber, f.parse_status, mr.photo_url, mr.party, mr.state AS member_state,
              cmc.market_cap,
              (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) AS days_to_file
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       ${marketCapJoin}
       ${where}
       ORDER BY ${sortExpr} ${order} NULLS LAST
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      dataParams
    ),
    sql.query(
      `SELECT COUNT(*)::int as count
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       ${marketCapJoin}
       ${where}`,
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
