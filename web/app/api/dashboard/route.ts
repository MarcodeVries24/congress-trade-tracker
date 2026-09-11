import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Same impossible-date guard as /api/trades and /api/stats — a transaction
// dated after its own filing date is a source-document typo, not a real
// trade, so it's excluded everywhere trades are ranked or counted.
const VALID_DATE_ORDER = `(
  (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) IS NULL
  OR (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) >= 0
)`;

// Unlike /api/trades and /api/stats (House-only by default), the dashboard
// is meant to summarize everything at a glance, so it always covers both
// chambers — free/ungated, like /api/stats, /api/members, /api/tickers.
export async function GET() {
  const [latestTrades, topPoliticians, topStocks, biggestTrades, chamberBreakdown, partyBreakdown] = await Promise.all([
    sql.query(
      `SELECT t.id, t.member_name, t.state_district, t.asset_name, t.ticker, t.asset_type_code, t.transaction_type,
              t.amount_range, t.amount_low, t.amount_high, f.filing_date, f.chamber, mr.photo_url, mr.party, mr.state AS member_state
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       WHERE ${VALID_DATE_ORDER}
       ORDER BY f.filing_date DESC NULLS LAST, t.id DESC
       LIMIT 8`
    ),
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
      `SELECT t.id, t.member_name, t.state_district, t.asset_name, t.ticker, t.asset_type_code, t.transaction_type,
              t.amount_range, t.amount_low, t.amount_high, f.filing_date, f.chamber, mr.photo_url, mr.party, mr.state AS member_state
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
      latestTrades,
      topPoliticians,
      topStocks,
      biggestTrades,
      chamberBreakdown,
      partyBreakdown,
    },
  });
}
