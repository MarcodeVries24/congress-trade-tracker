import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "@/lib/db";
import type { Trade } from "@/lib/api";
import { ALERT_FROM_SQL } from "@/lib/alertFilters";
import { getMemberSlugsByName } from "@/lib/members";
import { PRICE_COLUMNS_SQL, PRICE_JOINS_SQL } from "@/lib/prices";

/**
 * One trade, for its own page: everything the trades table has on the row,
 * plus the other lines of the same filing.
 *
 * Looked up by transactions.id, which is what every list links with. That id
 * is not permanent: re-ingesting a filing (a parser fix, a hand correction)
 * replaces its rows, so an old link can stop resolving. The page answers that
 * with a 404 that points to the member and the filing rather than an error,
 * and asks search engines not to index these URLs.
 */

export type TradeDetail = Trade & { member_slug: string | null };

const COLUMNS = `t.*, f.bioguide_id, f.filing_date, f.pdf_url, f.chamber, f.parse_status,
  COALESCE(mh.photo_url, mr.photo_url) AS photo_url,
  COALESCE(mh.party, mr.party) AS party,
  COALESCE(mh.state, mr.state) AS member_state,
  cmc.market_cap, cmc.company_name,
  (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) AS days_to_file,
  ${PRICE_COLUMNS_SQL}`;

export async function getTrade(id: number): Promise<{ trade: TradeDetail; siblings: TradeDetail[] } | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const rows = (await sql.query(
    `SELECT ${COLUMNS} ${ALERT_FROM_SQL} ${PRICE_JOINS_SQL}
     WHERE t.id = $1 AND ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}`,
    [id]
  )) as Trade[];
  const row = rows[0];
  if (!row) return null;

  const siblingRows = (await sql.query(
    `SELECT ${COLUMNS} ${ALERT_FROM_SQL} ${PRICE_JOINS_SQL}
     WHERE t.doc_id = $1 AND t.id <> $2 AND ${PUBLISHED_FILING_SQL} AND ${PLAUSIBLE_DATES_SQL}
     ORDER BY t.transaction_date DESC NULLS LAST, t.id
     LIMIT 50`,
    [row.doc_id, id]
  )) as Trade[];

  const slugs = await getMemberSlugsByName();
  const withSlug = (t: Trade): TradeDetail => ({ ...t, member_slug: slugs.get(t.member_name) ?? null });
  return { trade: withSlug(row), siblings: siblingRows.map(withSlug) };
}
