import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { FINNHUB, FX_RATES_URL } from "../config.js";

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
 *
 * Everything written to company_market_caps.market_cap is USD. Finnhub
 * reports the figure in the listing's *own* currency, which is easy to miss
 * because the overwhelming majority of the corpus is US-listed: it surfaced
 * only when the issuer list was sorted by market cap and put SK Hynix, whose
 * cap was in won, above Nvidia. Non-USD listings are converted here, and a
 * listing whose currency can't be converted is left untouched rather than
 * written in the wrong unit.
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
  /** In millions of `currency` — NOT of USD. See toUsdMarketCap. */
  marketCapitalization?: number;
  /** The listing's own currency: "USD", "JPY", "KRW", "TWD", … */
  currency?: string;
  name?: string;
}

/** Units of the currency per 1 USD, e.g. { JPY: 157.2, KRW: 1368.6 }. */
type FxRates = Record<string, number>;

/**
 * Today's rates, or null if they couldn't be fetched.
 *
 * Fetched once per run rather than per ticker: they move by fractions of a
 * percent inside the hour this takes, and a market cap is a rounded headline
 * figure anyway.
 */
async function fetchFxRates(): Promise<FxRates | null> {
  try {
    const res = await fetch(FX_RATES_URL);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { result?: string; rates?: FxRates };
    if (data.result !== "success" || !data.rates || typeof data.rates.EUR !== "number") {
      throw new Error("unexpected response shape");
    }
    return { ...data.rates, USD: 1 };
  } catch (err) {
    console.error(`FX rates unavailable (${(err as Error).message}).`);
    return null;
  }
}

/**
 * A profile's market cap as whole USD.
 *
 * Returns undefined — distinct from null — when the figure exists but can't
 * be trusted in USD: an unknown currency, or a run with no FX rates. The
 * caller leaves such a ticker's stored value alone rather than overwriting
 * it with a number in the wrong currency, which is the bug this exists to
 * prevent. null means the provider genuinely has no cap (a fund, say).
 */
function toUsdMarketCap(profile: FinnhubProfile, rates: FxRates | null): number | null | undefined {
  const millions = profile.marketCapitalization;
  if (typeof millions !== "number" || millions <= 0) return null;

  const currency = (profile.currency ?? "").toUpperCase();
  if (currency === "USD") return Math.round(millions * 1_000_000);
  if (!currency) return undefined;

  const perUsd = rates?.[currency];
  if (typeof perUsd !== "number" || perUsd <= 0) return undefined;
  return Math.round((millions * 1_000_000) / perUsd);
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

/**
 * @param missingOnly  Only tickers with no row in company_market_caps at all.
 *
 * The monthly full refresh keeps caps current, but it leaves a gap: a ticker
 * first traded on the 2nd shows "Undefined" for the next 51 days, because
 * nothing looks it up until the following month. Running this in gap-fill mode
 * after each ingest closes that to a few hours, and costs one request per
 * genuinely new symbol — usually none at all.
 *
 * A failed lookup writes no row, so gap-fill also retries anything the last
 * full run couldn't reach.
 */
async function refreshMarketCaps(missingOnly = false): Promise<void> {
  const rows = (await sql.query(`
    SELECT ticker FROM (
      SELECT DISTINCT ticker FROM transactions WHERE ticker IS NOT NULL AND ticker != ''
      UNION
      SELECT DISTINCT ticker FROM asset_name_tickers WHERE ticker IS NOT NULL
    ) t
    ${missingOnly ? "WHERE NOT EXISTS (SELECT 1 FROM company_market_caps c WHERE c.ticker = t.ticker)" : ""}
  `)) as { ticker: string }[];

  if (rows.length === 0) {
    console.log(missingOnly ? "No tickers are missing a market-cap lookup." : "No tickers to refresh.");
    return;
  }
  console.log(`${missingOnly ? "Looking up" : "Refreshing"} market cap for ${rows.length} ticker(s)...`);

  const rates = await fetchFxRates();
  if (rates) console.log(`FX rates loaded for ${Object.keys(rates).length} currencies.`);
  else console.warn("  Non-USD listings will be left as they are until rates are available again.");

  let updated = 0;
  let noCap = 0;
  let skipped = 0;
  let failed = 0;
  const converted = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const ticker = rows[i].ticker;
    try {
      const data = await finnhubGet<FinnhubProfile>(FINNHUB.profileUrl(ticker));
      const marketCap = toUsdMarketCap(data, rates);
      if (marketCap === undefined) {
        // Can't be expressed in USD right now. Writing what the provider
        // gave would put a figure in yen or won into a column every other
        // row reads as dollars, so this row is left exactly as it was.
        skipped++;
        continue;
      }
      if (marketCap !== null) {
        updated++;
        const currency = (data.currency ?? "USD").toUpperCase();
        if (currency !== "USD") converted.set(currency, (converted.get(currency) ?? 0) + 1);
      } else {
        noCap++;
      }
      await sql.query(
        `INSERT INTO company_market_caps (ticker, market_cap, company_name, source_currency, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (ticker) DO UPDATE SET market_cap = EXCLUDED.market_cap, company_name = EXCLUDED.company_name,
           source_currency = EXCLUDED.source_currency, updated_at = NOW()`,
        [ticker, marketCap, data.name ?? null, (data.currency ?? "").toUpperCase() || null]
      );
    } catch (err) {
      failed++;
      console.error(`  profile failed for "${ticker}": ${(err as Error).message}`);
    }
    if ((i + 1) % 200 === 0) console.log(`  ...${i + 1}/${rows.length}`);
  }
  console.log(
    `Market caps: ${updated} updated, ${noCap} had no cap on file (e.g. a fund, not a company), ` +
      `${skipped} left alone (no usable currency), ${failed} failed.`
  );
  if (converted.size) {
    const summary = [...converted.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}\u00d7${n}`).join(", ");
    console.log(`  Converted to USD from: ${summary}`);
  }
}

async function main() {
  // `--missing-only` is the cheap mode meant to run after every ingest: it
  // skips the name-resolution sweep and looks up only tickers nothing has
  // priced yet. The full run stays monthly (see market-caps.yml).
  const missingOnly = process.argv.slice(2).includes("--missing-only");

  await ensureSchema();
  if (!missingOnly) await resolveNewAssetNames();
  await refreshMarketCaps(missingOnly);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
