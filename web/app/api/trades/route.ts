import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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
  // The structured filters below (member, ticker, state, type, owner, trade
  // size, market cap, filing status, date range) are a paid feature — free
  // text search, chamber, and the default asset-type view stay free for
  // everyone. This is the enforcement point, not just a UI nicety: the
  // filter UI (see GatedFilter.tsx) never lets a non-pro user produce these
  // params in the first place, but a request hitting this route directly
  // must not be able to bypass that by sending them anyway. A non-pro
  // caller's gated params are silently dropped (falls back to the same
  // default view the free UI already shows) rather than erroring the whole
  // request, since q/chamber/assetTypes are legitimately still free to mix in.
  const { has } = await auth();
  const canUseFilters = has({ feature: "filters" });

  const q = sp.get("q") ?? undefined;
  const members = canUseFilters ? sp.getAll("members") : [];
  const tickers = canUseFilters ? sp.getAll("tickers") : [];
  const state = canUseFilters ? (sp.get("state") ?? undefined) : undefined;
  const types = canUseFilters ? sp.getAll("types") : []; // "P" | "S" | "E" — matched as a prefix, so "S" also covers "S (partial)"
  const owners = canUseFilters ? sp.getAll("owners") : []; // "self" | "JT" | "SP" | "DC"
  const assetTypes = sp.getAll("assetTypes"); // canonical codes — expanded via ASSET_TYPE_VALUES below; free (default Stock view)
  const amountRanges = canUseFilters ? sp.getAll("amountRanges") : [];
  const marketCapTiers = canUseFilters ? sp.getAll("marketCapTiers") : [];
  // Defaults to House-only. Pass chamber=house&chamber=senate (repeated) to
  // include both once Senate coverage exists — never implicit/all-by-default,
  // so this stays safe even before Senate data is fully wired into the UI.
  const chambers = sp.getAll("chamber");
  const chamberFilter = chambers.length ? chambers : ["house"];
  const filedStatus = canUseFilters ? (sp.get("filedStatus") ?? undefined) : undefined; // "late" | "onTime" | undefined
  const dateFrom = canUseFilters ? (sp.get("dateFrom") ?? undefined) : undefined;
  const dateTo = canUseFilters ? (sp.get("dateTo") ?? undefined) : undefined;
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
  if (members.length) {
    const placeholders = members.map((m) => addParam(m));
    conditions.push(`t.member_name IN (${placeholders.join(", ")})`);
  }
  if (tickers.length) {
    const placeholders = tickers.map((t) => addParam(t.toUpperCase()));
    conditions.push(`t.ticker IN (${placeholders.join(", ")})`);
  }
  if (state) conditions.push(`t.state_district ILIKE ${addParam(`${state}%`)}`);
  if (types.length) {
    const typeConditions = types.map((t) => `t.transaction_type ILIKE ${addParam(`${t}%`)}`);
    conditions.push(`(${typeConditions.join(" OR ")})`);
  }
  if (owners.length) {
    const ownerConditions = owners.map((o) => (o === "self" ? `t.owner IS NULL` : `t.owner = ${addParam(o)}`));
    conditions.push(`(${ownerConditions.join(" OR ")})`);
  }
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
