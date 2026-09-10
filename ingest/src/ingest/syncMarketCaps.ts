import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { FINNHUB } from "../config.js";

/**
 * Enriches trades with the *current* market cap of the company traded —
 * not a historical value as of the trade date, which a free-tier API has no
 * practical way to provide. Runs monthly (see .github/workflows/market-caps.yml).
 *
 * Two passes, split so the (slow, fuzzy) name-resolution work is a one-time
 * cost per asset name rather than repeated every month:
 *
 *  1. resolveNewAssetNames — most House OCR rows (paper filings) have an
 *     asset name but no ticker, so they'd never match a market cap looked
 *     up by ticker. For any asset_name not already in asset_name_tickers,
 *     search Finnhub by that name and accept the result only if its company
 *     name matches *exactly* after normalizing away punctuation/legal
 *     suffixes — a fuzzy/best-effort match risks silently attaching the
 *     wrong company's market cap to a trade, which is worse than leaving it
 *     unresolved. Every name gets a row either way (ticker or NULL) so this
 *     pass never repeats itself for a name it's already seen.
 *  2. refreshMarketCaps — (re)fetches the market cap for every ticker
 *     actually in play (directly extracted, or resolved by name above).
 *     This is the part that actually changes month to month.
 */

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
if (!FINNHUB_API_KEY) {
  throw new Error("FINNHUB_API_KEY is not set. Get a free key at https://finnhub.io/register and set it in ingest/.env (or as a GitHub Actions secret).");
}

// Finnhub's free tier allows 60 calls/minute; this keeps every endpoint
// comfortably under that regardless of which pass is running.
const MIN_CALL_INTERVAL_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LEGAL_SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|LP|PLC|GROUP|HOLDINGS?|TRUST|CLASS\s+[A-Z])\b/g;

// Undocumented, but verified directly: Finnhub's free-tier /search rejects
// any query over 20 characters with a 422 ("q too long") — most full
// company names exceed that. The acceptance check below still compares
// against the *full* original name, so truncating the query just narrows
// the candidate pool going in; it can't turn a truncated prefix into a
// false-positive match.
const FINNHUB_SEARCH_MAX_LEN = 20;
function searchQueryFor(name: string): string {
  return name.trim().slice(0, FINNHUB_SEARCH_MAX_LEN);
}

function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,'&]/g, "")
    .replace(LEGAL_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

let lastCallAt = 0;
async function finnhubGet<T>(url: string): Promise<T> {
  const wait = MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const fullUrl = `${url}&token=${FINNHUB_API_KEY}`;
  let res = await fetch(fullUrl);
  if (res.status === 429) {
    await sleep(5000);
    lastCallAt = Date.now();
    res = await fetch(fullUrl);
  }
  if (!res.ok) throw new Error(`Finnhub request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface FinnhubSearchResult {
  result: { symbol: string; description: string; type: string }[];
}

interface FinnhubProfile {
  marketCapitalization?: number; // in millions USD
  name?: string;
}

async function resolveNewAssetNames(): Promise<void> {
  const rows = (await sql.query(`
    SELECT DISTINCT t.asset_name FROM transactions t
    WHERE (t.ticker IS NULL OR t.ticker = '')
      AND NOT EXISTS (SELECT 1 FROM asset_name_tickers ant WHERE ant.asset_name = t.asset_name)
  `)) as { asset_name: string }[];

  if (rows.length === 0) {
    console.log("No new asset names to resolve.");
    return;
  }
  console.log(`Resolving ${rows.length} new asset name(s) to a ticker...`);

  let resolved = 0;
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].asset_name;
    let ticker: string | null = null;
    try {
      const data = await finnhubGet<FinnhubSearchResult>(FINNHUB.searchUrl(searchQueryFor(name)));
      const target = normalizeCompanyName(name);
      const match = (data.result ?? []).find((r) => normalizeCompanyName(r.description ?? "") === target);
      if (match) {
        ticker = match.symbol;
        resolved++;
      }
    } catch (err) {
      console.error(`  search failed for "${name}": ${(err as Error).message}`);
    }
    await sql.query(
      `INSERT INTO asset_name_tickers (asset_name, ticker, resolved_at) VALUES ($1, $2, NOW())
       ON CONFLICT (asset_name) DO UPDATE SET ticker = EXCLUDED.ticker, resolved_at = NOW()`,
      [name, ticker]
    );
    if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${rows.length} (${resolved} resolved so far)`);
  }
  console.log(`Resolved ${resolved}/${rows.length} new asset names to a ticker (the rest go to Undefined — no confident match).`);
}

async function refreshMarketCaps(): Promise<void> {
  const rows = (await sql.query(`
    SELECT ticker FROM (
      SELECT DISTINCT ticker FROM transactions WHERE ticker IS NOT NULL AND ticker != ''
      UNION
      SELECT DISTINCT ticker FROM asset_name_tickers WHERE ticker IS NOT NULL
    ) t
  `)) as { ticker: string }[];

  console.log(`Refreshing market cap for ${rows.length} ticker(s)...`);
  let updated = 0;
  let noCap = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const ticker = rows[i].ticker;
    try {
      const data = await finnhubGet<FinnhubProfile>(FINNHUB.profileUrl(ticker));
      const marketCap = typeof data.marketCapitalization === "number" && data.marketCapitalization > 0 ? Math.round(data.marketCapitalization * 1_000_000) : null;
      if (marketCap !== null) updated++;
      else noCap++;
      await sql.query(
        `INSERT INTO company_market_caps (ticker, market_cap, company_name, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (ticker) DO UPDATE SET market_cap = EXCLUDED.market_cap, company_name = EXCLUDED.company_name, updated_at = NOW()`,
        [ticker, marketCap, data.name ?? null]
      );
    } catch (err) {
      failed++;
      console.error(`  profile failed for "${ticker}": ${(err as Error).message}`);
    }
    if ((i + 1) % 200 === 0) console.log(`  ...${i + 1}/${rows.length}`);
  }
  console.log(`Market caps: ${updated} updated, ${noCap} had no cap on file (e.g. a fund, not a company), ${failed} failed.`);
}

async function main() {
  await ensureSchema();
  await resolveNewAssetNames();
  await refreshMarketCaps();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
