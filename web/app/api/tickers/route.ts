import { sql, PUBLISHED_FILING_SQL } from "@/lib/db";
import { publicJson } from "@/lib/cache";

// Backs the searchable ticker multi-select filter — same shape/purpose as
// /api/members. The company name comes along so a list can be searched by
// "apple" as well as by "AAPL"; null for a ticker with no market-cap row.
export async function GET() {
  const rows = await sql.query(
    `SELECT t.ticker, MAX(cmc.company_name) AS company_name, COUNT(*)::int as trade_count
     FROM transactions t
     JOIN filings f ON f.doc_id = t.doc_id
     LEFT JOIN company_market_caps cmc ON cmc.ticker = t.ticker
     WHERE t.ticker IS NOT NULL AND t.ticker != '' AND ${PUBLISHED_FILING_SQL}
     GROUP BY t.ticker
     ORDER BY trade_count DESC`
  );
  return publicJson({ data: rows });
}
