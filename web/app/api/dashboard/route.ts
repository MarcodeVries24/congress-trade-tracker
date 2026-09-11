import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ASSET_TYPE_VALUES } from "@/lib/api";

// Same impossible-date guard as /api/trades and /api/stats — a transaction
// dated after its own filing date is a source-document typo, not a real
// trade, so it's excluded everywhere trades are ranked or counted.
const VALID_DATE_ORDER = `(
  (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) IS NULL
  OR (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) >= 0
)`;

// Range midpoint estimate, summed per member — same formula /api/stats uses
// for estimatedVolume. A trade's exact value is never disclosed, only a
// bracket, so this is the standard "best guess" figure used everywhere
// volume is shown on the site.
const VOLUME_EXPR = `SUM((COALESCE(t.amount_low, 0) + COALESCE(t.amount_high, t.amount_low, 0)) / 2.0)`;

const TRADE_COLUMNS = `t.id, t.member_name, t.state_district, t.asset_name, t.ticker, t.asset_type_code, t.transaction_type,
              t.amount_range, t.amount_low, t.amount_high, f.filing_date, f.chamber, mr.photo_url, mr.party, mr.state AS member_state`;

// One row per member (their single most recent trade), rather than raw
// "last N rows" — a member who filed a dozen trades on the same day would
// otherwise fill the entire card by themselves. DISTINCT ON picks each
// member's latest row first, then the outer query re-sorts across members
// by that date and keeps the top N.
function latestUniqueQuery(assetTypeFilter: string): string {
  return `
    SELECT sub.*
    FROM (
      SELECT DISTINCT ON (t.member_name) ${TRADE_COLUMNS}
      FROM transactions t
      JOIN filings f ON f.doc_id = t.doc_id
      LEFT JOIN members_reference mr ON mr.state_district = t.state_district
      WHERE ${VALID_DATE_ORDER} ${assetTypeFilter}
      ORDER BY t.member_name, f.filing_date DESC NULLS LAST, t.id DESC
    ) sub
    ORDER BY sub.filing_date DESC NULLS LAST, sub.id DESC
    LIMIT 12`;
}

// Unlike /api/trades and /api/stats (House-only by default), the dashboard
// is meant to summarize everything at a glance, so it always covers both
// chambers — free/ungated, like /api/stats, /api/members, /api/tickers.
export async function GET() {
  const stockValues = ASSET_TYPE_VALUES.ST; // ["ST", "Stock", "Non-Public Stock"]
  const stockPlaceholders = stockValues.map((_, i) => `$${i + 1}`).join(", ");

  const [latestTradesStocks, latestTradesAll, topPoliticians, topByVolume, topStocks, biggestTrades, chamberBreakdown, partyBreakdown] =
    await Promise.all([
      sql.query(latestUniqueQuery(`AND t.asset_type_code IN (${stockPlaceholders})`), stockValues),
      sql.query(latestUniqueQuery("")),
      sql.query(
        `SELECT t.member_name, mr.state_district, mr.party, mr.photo_url, mr.state AS member_state, f.chamber, COUNT(*)::int as trade_count
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         LEFT JOIN members_reference mr ON mr.state_district = t.state_district
         WHERE ${VALID_DATE_ORDER}
         GROUP BY t.member_name, mr.state_district, mr.party, mr.photo_url, mr.state, f.chamber
         ORDER BY trade_count DESC
         LIMIT 8`
      ),
      sql.query(
        `SELECT t.member_name, mr.state_district, mr.party, mr.photo_url, mr.state AS member_state, f.chamber,
                ${VOLUME_EXPR}::float8 as volume_sum, COUNT(*)::int as trade_count
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         LEFT JOIN members_reference mr ON mr.state_district = t.state_district
         WHERE ${VALID_DATE_ORDER}
         GROUP BY t.member_name, mr.state_district, mr.party, mr.photo_url, mr.state, f.chamber
         ORDER BY volume_sum DESC
         LIMIT 8`
      ),
      sql.query(
        `SELECT t.ticker, COUNT(*)::int as trade_count
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         WHERE t.ticker IS NOT NULL AND t.ticker != '' AND ${VALID_DATE_ORDER}
         GROUP BY t.ticker
         ORDER BY trade_count DESC
         LIMIT 8`
      ),
      // Biggest trades by disclosed range floor, last 30 days — same ranking
      // column /api/trades sorts "amount_low" on.
      sql.query(
        `SELECT ${TRADE_COLUMNS}
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         LEFT JOIN members_reference mr ON mr.state_district = t.state_district
         WHERE ${VALID_DATE_ORDER} AND t.amount_low IS NOT NULL
           AND (NULLIF(f.filing_date, '')::date) >= (CURRENT_DATE - INTERVAL '30 days')
         ORDER BY t.amount_low DESC
         LIMIT 5`
      ),
      sql.query(
        `SELECT f.chamber, COUNT(*)::int as count
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         WHERE ${VALID_DATE_ORDER}
         GROUP BY f.chamber`
      ),
      sql.query(
        `SELECT mr.party, COUNT(*)::int as count
         FROM transactions t
         JOIN filings f ON f.doc_id = t.doc_id
         LEFT JOIN members_reference mr ON mr.state_district = t.state_district
         WHERE ${VALID_DATE_ORDER} AND mr.party IS NOT NULL
         GROUP BY mr.party`
      ),
    ]);

  return NextResponse.json({
    data: {
      latestTradesStocks,
      latestTradesAll,
      topPoliticians,
      topByVolume,
      topStocks,
      biggestTrades,
      chamberBreakdown,
      partyBreakdown,
    },
  });
}
