import { sql } from "./db";
import { PUBLISHED_FILING_SQL } from "./sql";
import { displayName } from "./api";
import { memberSlug } from "./memberSlug";

// Re-exported so server code has one import for everything member-related.
export { memberSlug };

/**
 * Per-member pages, keyed by a slug derived from the disclosed name.
 *
 * The slug is the URL: /politicians/nancy-pelosi. Nothing maintains a list —
 * a member who has never traded before simply starts resolving the moment
 * their first filing is published, because every lookup here is a query.
 */

export interface MemberDirectoryEntry {
  slug: string;
  /**
   * Every stored spelling that maps to this slug.
   *
   * Usually one. But the corpus holds the same person under more than one
   * name — "John Boozman" and "JOHN BOOZMAN", "Thomas H. Kean Jr" with and
   * without the full stop — because the disclosure sites aren't consistent
   * about it. Those currently show as separate people with their trades split
   * between them. Keying on the slug merges them back, which is why a page
   * queries `member_name = ANY(names)` rather than matching one string.
   */
  names: string[];
  display: string;
  trades: number;
}

/** The nicest of several spellings: the one that isn't SHOUTING. */
function bestSpelling(names: string[]): string {
  return [...names].sort((a, b) => {
    const lower = (s: string) => (s.match(/[a-z]/g) ?? []).length;
    return lower(b) - lower(a) || b.length - a.length;
  })[0];
}

export async function getMemberDirectory(): Promise<MemberDirectoryEntry[]> {
  const rows = (await sql.query(
    `SELECT t.member_name, COUNT(*)::int AS trades
     FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
     WHERE ${PUBLISHED_FILING_SQL}
     GROUP BY 1`
  )) as { member_name: string; trades: number }[];

  const bySlug = new Map<string, MemberDirectoryEntry>();
  for (const row of rows) {
    const slug = memberSlug(row.member_name);
    if (!slug) continue;
    const existing = bySlug.get(slug);
    if (existing) {
      existing.names.push(row.member_name);
      existing.trades += row.trades;
      existing.display = displayName(bestSpelling(existing.names));
    } else {
      bySlug.set(slug, { slug, names: [row.member_name], display: displayName(row.member_name), trades: row.trades });
    }
  }
  return [...bySlug.values()].sort((a, b) => b.trades - a.trades);
}

export interface MemberProfile {
  slug: string;
  display: string;
  names: string[];
  party: string | null;
  state: string | null;
  state_district: string | null;
  chamber: "house" | "senate" | null;
  photo_url: string | null;
  trade_count: number;
  volume_low: number;
  first_filed: string | null;
  last_filed: string | null;
  purchases: number;
  sales: number;
  top_tickers: { ticker: string; count: number }[];
}

export interface MemberTrade {
  id: number;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
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

/** How many trades a member page lists before pointing at the full filter UI. */
export const MEMBER_PAGE_TRADE_LIMIT = 100;

export async function getMemberBySlug(
  slug: string
): Promise<{ profile: MemberProfile; trades: MemberTrade[] } | null> {
  const entry = (await getMemberDirectory()).find((m) => m.slug === slug);
  if (!entry) return null;

  const [summaryRows, tickerRows, tradeRows] = await Promise.all([
    sql.query(
      `SELECT COUNT(*)::int AS trade_count,
              COALESCE(SUM(t.amount_low), 0)::bigint AS volume_low,
              MIN(NULLIF(f.filing_date, '')) AS first_filed,
              MAX(NULLIF(f.filing_date, '')) AS last_filed,
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'P%')::int AS purchases,
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'S%')::int AS sales,
              (ARRAY_AGG(f.chamber ORDER BY f.filing_date DESC))[1] AS chamber,
              (ARRAY_AGG(t.state_district ORDER BY f.filing_date DESC))[1] AS state_district,
              (ARRAY_AGG(COALESCE(mh.party, mr.party) ORDER BY f.filing_date DESC))[1] AS party,
              (ARRAY_AGG(COALESCE(mh.state, mr.state) ORDER BY f.filing_date DESC))[1] AS state,
              (ARRAY_AGG(COALESCE(mh.photo_url, mr.photo_url) ORDER BY f.filing_date DESC))[1] AS photo_url
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       WHERE t.member_name = ANY($1) AND ${PUBLISHED_FILING_SQL}`,
      [entry.names]
    ),
    sql.query(
      `SELECT t.ticker, COUNT(*)::int AS count
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.member_name = ANY($1) AND ${PUBLISHED_FILING_SQL}
         AND t.ticker IS NOT NULL AND t.ticker <> ''
       GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [entry.names]
    ),
    sql.query(
      `SELECT t.id, t.asset_name, t.ticker, t.asset_type_code, t.owner, t.transaction_type,
              t.transaction_date, t.amount_range, t.amount_low, t.amount_high,
              f.filing_date, f.pdf_url,
              (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) AS days_to_file
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.member_name = ANY($1) AND ${PUBLISHED_FILING_SQL}
       ORDER BY f.filing_date DESC NULLS LAST, t.transaction_date DESC NULLS LAST, t.id DESC
       LIMIT ${MEMBER_PAGE_TRADE_LIMIT}`,
      [entry.names]
    ),
  ]);

  const s = (summaryRows as Record<string, unknown>[])[0];
  return {
    profile: {
      slug: entry.slug,
      display: entry.display,
      names: entry.names,
      party: (s?.party as string) ?? null,
      state: (s?.state as string) ?? null,
      state_district: (s?.state_district as string) ?? null,
      chamber: (s?.chamber as "house" | "senate") ?? null,
      photo_url: (s?.photo_url as string) ?? null,
      trade_count: Number(s?.trade_count ?? 0),
      volume_low: Number(s?.volume_low ?? 0),
      first_filed: (s?.first_filed as string) ?? null,
      last_filed: (s?.last_filed as string) ?? null,
      purchases: Number(s?.purchases ?? 0),
      sales: Number(s?.sales ?? 0),
      top_tickers: tickerRows as { ticker: string; count: number }[],
    },
    trades: tradeRows as MemberTrade[],
  };
}
