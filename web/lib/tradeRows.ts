import { LOGO_SQL } from "@/lib/db";
import { ALERT_FROM_SQL } from "@/lib/alertFilters";
import { getMemberSlugsByName } from "@/lib/members";
import { PRICE_COLUMNS_SQL, PRICE_JOINS_SQL } from "@/lib/prices";

/**
 * A trade row as the trade lists send it: the transaction, its filing, the
 * member's photo, party and state, the company's size and logo, and the
 * prices around the trade. One definition, so /api/trades and the lists that
 * show a subset of trades (an alert's) hand the app the same shape.
 */
export const TRADE_ROW_COLUMNS_SQL = `t.*, f.bioguide_id, f.filing_date, f.pdf_url, f.chamber, f.parse_status,
  COALESCE(mh.photo_url, mr.photo_url) AS photo_url,
  COALESCE(mh.party, mr.party) AS party,
  COALESCE(mh.state, mr.state) AS member_state,
  cmc.market_cap, cmc.company_name, ${LOGO_SQL} AS logo_url,
  (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) AS days_to_file,
  ${PRICE_COLUMNS_SQL}`;

/**
 * The joins TRADE_ROW_COLUMNS_SQL reads from. ALERT_FROM_SQL first, since
 * that is also what the filter conditions expect.
 */
export const TRADE_ROW_FROM_SQL = `${ALERT_FROM_SQL}
  ${PRICE_JOINS_SQL}`;

/**
 * Adds the page each member's name links to. Resolved here rather than
 * derived in the app because a slug belongs to a *person*, and a person is the
 * several spellings they file under, which only the grouped directory knows.
 * Cached, so this costs one query per instance per five minutes.
 */
export async function withMemberSlugs<T extends Record<string, unknown>>(
  rows: T[]
): Promise<(T & { member_slug: string | null })[]> {
  const slugsByName = await getMemberSlugsByName();
  return rows.map((row) => ({ ...row, member_slug: slugsByName.get(String(row.member_name)) ?? null }));
}
