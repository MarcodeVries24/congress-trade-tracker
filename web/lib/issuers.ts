import { sql } from "./db";
import { PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL, VOLUME_MIDPOINT_SQL } from "./sql";
import { ISSUER_SLUG_SQL, issuerSlug } from "./issuerSlug";
import { getTradeFlow, type TradeFlowQuarter } from "./tradeFlow";

/**
 * Issuer pages — one per traded company, the asset-side counterpart to the
 * member pages.
 *
 * An issuer is a *ticker*, not an asset name. 54,676 of the 65,709 published
 * rows carry one, and a ticker is a real identity: it survives the four
 * different names the same company is filed under, and it joins straight to
 * the market-cap table. The rows without a ticker are municipal bonds,
 * treasuries, private LLCs and futures — 3,338 municipal securities alone —
 * whose asset names are free text with maturity dates and coupon rates baked
 * in ("UNIV OF HOUSTON TX UNIV REVENU DUE 02/15/2040 5.000%"). Grouping those
 * by name would manufacture thousands of one-trade "issuers" that are really
 * one issuer per bond series, so they are left out of the directory rather
 * than filling it with noise. They remain fully visible in the trade list and
 * on their member's page.
 */

const ISSUER_FROM_SQL = `
  FROM transactions t
  JOIN filings f ON f.doc_id = t.doc_id
  LEFT JOIN company_market_caps cmc ON cmc.ticker = NULLIF(t.ticker, '')`;

const HAS_TICKER_SQL = `t.ticker IS NOT NULL AND btrim(t.ticker) <> ''`;

const ISSUER_WHERE_SQL = `WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL} AND ${HAS_TICKER_SQL}`;

/**
 * A person is counted once per issuer however many spellings they filed
 * under — same identity rule the member pages and /api/politicians use, so
 * "63 politicians traded MSFT" means 63 people, not 63 name variants.
 */
const PEOPLE_SQL = `COUNT(DISTINCT COALESCE(f.bioguide_id, t.member_name))::int`;

const ISSUER_SUMMARY_COLUMNS = `
  t.ticker,
  MAX(cmc.company_name) AS company_name,
  MAX(cmc.market_cap)::float8 AS market_cap,
  COUNT(*)::int AS trade_count,
  ${VOLUME_MIDPOINT_SQL}::float8 AS volume_sum,
  ${PEOPLE_SQL} AS politician_count,
  COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'P%')::int AS purchases,
  COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'S%')::int AS sales,
  MAX(NULLIF(t.transaction_date, '')) AS last_traded,
  MAX(NULLIF(f.filing_date, '')) AS last_filed`;

export interface IssuerSummary {
  ticker: string;
  slug: string;
  company_name: string | null;
  market_cap: number | null;
  trade_count: number;
  volume_sum: number;
  politician_count: number;
  purchases: number;
  sales: number;
  last_traded: string | null;
  last_filed: string | null;
}

export interface IssuerTrade {
  id: number;
  member_name: string;
  bioguide_id: string | null;
  member_slug: string | null;
  party: string | null;
  photo_url: string | null;
  chamber: "house" | "senate";
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
  company_name: string | null;
  owner: string | null;
  transaction_type: string;
  transaction_date: string | null;
  amount_range: string | null;
  amount_low: number | null;
  amount_high: number | null;
  filing_date: string | null;
  pdf_url: string;
  days_to_file: number | null;
}

export interface IssuerTrader {
  member_name: string;
  bioguide_id: string | null;
  slug: string | null;
  display: string;
  party: string | null;
  photo_url: string | null;
  trade_count: number;
  volume_sum: number;
}

/**
 * Quarterly buy/sell flow for one issuer — the same chart the member pages
 * carry, asking the other question: who moved in and out of this company, and
 * did the public hear about it inside the 45 days the law allows.
 */
export function getIssuerTradeFlow(ticker: string): Promise<TradeFlowQuarter[]> {
  return getTradeFlow("t.ticker = $1", [ticker]);
}

/** How many trades an issuer page lists before pointing at the full filter UI. */
export const ISSUER_PAGE_TRADE_LIMIT = 100;

/** How many of an issuer's traders the page names. */
const ISSUER_PAGE_TRADER_LIMIT = 12;

function toSummary(row: Record<string, unknown>): IssuerSummary {
  const ticker = String(row.ticker);
  return {
    ticker,
    slug: issuerSlug(ticker),
    company_name: (row.company_name as string) ?? null,
    market_cap: row.market_cap === null || row.market_cap === undefined ? null : Number(row.market_cap),
    trade_count: Number(row.trade_count ?? 0),
    volume_sum: Number(row.volume_sum ?? 0),
    politician_count: Number(row.politician_count ?? 0),
    purchases: Number(row.purchases ?? 0),
    sales: Number(row.sales ?? 0),
    last_traded: (row.last_traded as string) ?? null,
    last_filed: (row.last_filed as string) ?? null,
  };
}

/**
 * Every issuer with at least one published trade.
 *
 * Returns all of them rather than a page: there are ~2,600, the /issuers
 * route filters and sorts in memory the same way /api/politicians does, and
 * the sitemap needs the full list anyway.
 */
export async function getIssuerDirectory(): Promise<IssuerSummary[]> {
  const rows = (await sql.query(
    `SELECT ${ISSUER_SUMMARY_COLUMNS} ${ISSUER_FROM_SQL} ${ISSUER_WHERE_SQL}
     GROUP BY t.ticker
     ORDER BY trade_count DESC`
  )) as Record<string, unknown>[];
  return rows.map(toSummary);
}

/**
 * One issuer: its totals, who trades it, and its most recent trades.
 *
 * Member names and slugs are resolved through the same member directory the
 * politician pages use, so a name shown here links to a page that exists and
 * reads the same — rather than re-deriving a slug from one filed spelling.
 */
export async function getIssuerBySlug(slug: string): Promise<{
  issuer: IssuerSummary;
  traders: IssuerTrader[];
  trades: IssuerTrade[];
} | null> {
  const normalized = issuerSlug(slug);
  if (!normalized) return null;

  const summaryRows = (await sql.query(
    `SELECT ${ISSUER_SUMMARY_COLUMNS} ${ISSUER_FROM_SQL} ${ISSUER_WHERE_SQL} AND ${ISSUER_SLUG_SQL} = $1
     GROUP BY t.ticker`,
    [normalized]
  )) as Record<string, unknown>[];
  if (!summaryRows.length) return null;
  const issuer = toSummary(summaryRows[0]);

  const [traderRows, tradeRows] = await Promise.all([
    sql.query(
      `SELECT t.member_name, f.bioguide_id,
              COUNT(*)::int AS trade_count,
              ${VOLUME_MIDPOINT_SQL}::float8 AS volume_sum,
              (ARRAY_AGG(COALESCE(mh.party, mr.party) ORDER BY f.filing_date DESC NULLS LAST))[1] AS party,
              (ARRAY_AGG(COALESCE(mh.photo_url, mr.photo_url) ORDER BY f.filing_date DESC NULLS LAST))[1] AS photo_url
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL} AND t.ticker = $1
       GROUP BY t.member_name, f.bioguide_id
       ORDER BY trade_count DESC`,
      [issuer.ticker]
    ),
    sql.query(
      `SELECT t.id, t.member_name, f.bioguide_id, t.asset_name, t.ticker, t.asset_type_code,
              t.owner, t.transaction_type, t.transaction_date, t.amount_range, t.amount_low,
              t.amount_high, f.filing_date, f.pdf_url, f.chamber, cmc.company_name,
              COALESCE(mh.party, mr.party) AS party,
              COALESCE(mh.photo_url, mr.photo_url) AS photo_url,
              (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) AS days_to_file
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       LEFT JOIN company_market_caps cmc ON cmc.ticker = NULLIF(t.ticker, '')
       WHERE ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL} AND t.ticker = $1
       ORDER BY f.filing_date DESC NULLS LAST, t.transaction_date DESC NULLS LAST, t.id DESC
       LIMIT ${ISSUER_PAGE_TRADE_LIMIT}`,
      [issuer.ticker]
    ),
  ]);

  // Resolved here rather than per row so the directory query runs once.
  const { getMemberDirectory } = await import("./members");
  const directory = await getMemberDirectory();
  const slugByName = new Map<string, string>();
  const displayByName = new Map<string, string>();
  for (const entry of directory) {
    for (const name of entry.names) {
      slugByName.set(name, entry.slug);
      displayByName.set(name, entry.display);
    }
  }

  // Two filed spellings of one person are two rows out of SQL; fold them here
  // so an issuer page never lists the same person twice.
  const byPerson = new Map<string, IssuerTrader>();
  for (const raw of traderRows as Record<string, unknown>[]) {
    const member_name = String(raw.member_name);
    const display = displayByName.get(member_name) ?? member_name;
    const key = (raw.bioguide_id as string) ?? display;
    const existing = byPerson.get(key);
    const trade_count = Number(raw.trade_count ?? 0);
    const volume_sum = Number(raw.volume_sum ?? 0);
    if (existing) {
      existing.trade_count += trade_count;
      existing.volume_sum += volume_sum;
      continue;
    }
    byPerson.set(key, {
      member_name,
      bioguide_id: (raw.bioguide_id as string) ?? null,
      slug: slugByName.get(member_name) ?? null,
      display,
      party: (raw.party as string) ?? null,
      photo_url: (raw.photo_url as string) ?? null,
      trade_count,
      volume_sum,
    });
  }

  const traders = [...byPerson.values()].sort((a, b) => b.trade_count - a.trade_count).slice(0, ISSUER_PAGE_TRADER_LIMIT);

  const trades = (tradeRows as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as IssuerTrade),
    member_slug: slugByName.get(String(r.member_name)) ?? null,
  }));

  return { issuer, traders, trades };
}
