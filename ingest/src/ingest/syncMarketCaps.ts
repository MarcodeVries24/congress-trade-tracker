import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { SEC_COMPANY_TICKERS, SEC_DATA } from "../config.js";

/**
 * Market caps, and tickers for asset names that came without one, from the
 * SEC's public data. Runs monthly in full (market-caps.yml) and, for tickers
 * never looked up, after every ingest (--missing-only).
 *
 * A market cap here is shares outstanding, as the company last reported them
 * to the SEC, times the latest close in price_latest. Both sides are public
 * or already ours, so no market-data licence is involved, and the figure is
 * in dollars from the start.
 *
 * What it cannot do, and leaves as no cap (shown as "Undefined") rather than
 * guess:
 *  - a company the SEC does not list: foreign shares traded over the counter
 *    (Bayer's BAYRY, Nestle's NSRGY), and tickers retired by a takeover;
 *  - a foreign issuer that files a 20-F or 40-F: it reports its *ordinary*
 *    shares, and the ticker's price is for an ADR that can stand for several
 *    of them (one TSM is five TSMC shares), so the product would be wrong;
 *  - a company whose latest share count is stale (Berkshire's cover page
 *    has carried none since 2011);
 *  - funds and ETFs, which have no market cap in this sense.
 *
 * Shares come from the cover-page figure (dei:EntityCommonStockSharesOutstanding)
 * and, where a company reports that per share class only, so it is missing
 * from the API (Alphabet), from the weighted-average basic share count in
 * its latest results, which covers every class.
 *
 *   --missing-only   only tickers never looked up (after each ingest)
 *   --dry-run        compute everything, write nothing, and compare with the
 *                    caps already stored
 */

const SEC_HEADERS = { "user-agent": SEC_COMPANY_TICKERS.userAgent };
// The SEC asks for fewer than 10 requests a second.
const SEC_INTERVAL_MS = 150;
// A share count older than this is not trusted (about 15 months: a company
// files at least every quarter, so anything this old has stopped filing).
const FRESH_DAYS = 460;
// Annual and current reports of foreign private issuers.
const FOREIGN_FORMS = /^(20-F|40-F|6-K)/;
const SHARE_CONCEPTS = ["dei/EntityCommonStockSharesOutstanding", "us-gaap/WeightedAverageNumberOfSharesOutstandingBasic"];
// Fewer shares than this is a figure filed in thousands by mistake (Tempus
// AI's 180,049 for some 180 million), not a listed company that small.
const MIN_SHARES = 1_000_000;
const MIN_SEC_ENTRIES = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A database write, tried again after a pause when the connection drops: a
 * full run makes thousands of them, and one dropped connection once stopped
 * a run halfway.
 */
async function withRetry<T>(write: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (err) {
      if (attempt >= attempts) throw err;
      await sleep(3000 * attempt);
    }
  }
}

let lastCallAt = 0;
/** One SEC request, throttled; null for a 404 (the company has no such figure). */
async function secGet<T>(url: string): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const wait = SEC_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (res.status === 404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`SEC answered ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
}

/** Tickers as the SEC writes them: BRK.B is BRK-B there. */
function secKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

interface SecCompany {
  cik: string;
  title: string;
  /**
   * The company's first ticker in the SEC's list, its main listing. Other
   * tickers under the same company can be bonds or notes (Alphabet's GOOGN
   * and GOOGM), whose price says nothing about the shares.
   */
  primary: string;
}

/** Every ticker the SEC has a registrant for. Listed by size, so the first entry for a ticker is the one in use. */
async function secCompanies(): Promise<Map<string, SecCompany>> {
  const data = await secGet<Record<string, { cik_str: number; ticker: string; title: string }>>(SEC_COMPANY_TICKERS.url);
  const entries = Object.values(data ?? {});
  if (entries.length < MIN_SEC_ENTRIES) throw new Error(`SEC company list has only ${entries.length} entries`);
  const byTicker = new Map<string, SecCompany>();
  const primaryByCik = new Map<string, string>();
  for (const e of entries) {
    const cik = String(e.cik_str);
    const key = secKey(e.ticker);
    if (!primaryByCik.has(cik)) primaryByCik.set(cik, key);
    if (!byTicker.has(key)) byTicker.set(key, { cik, title: e.title, primary: primaryByCik.get(cik)! });
  }
  return byTicker;
}

/** Fund and ETF tickers: { fields: [cik, seriesId, classId, symbol], data: [...] }. */
async function secFundTickers(): Promise<Set<string>> {
  const data = await secGet<{ fields: string[]; data: unknown[][] }>(SEC_DATA.fundTickersUrl);
  const at = data?.fields.indexOf("symbol") ?? -1;
  return new Set((data?.data ?? []).map((row) => secKey(String(row[at >= 0 ? at : 3]))));
}

type Shares = { shares: number; asOf: string; concept: string } | { foreign: true } | null;

interface ConceptFact {
  end: string;
  val: number;
  form?: string;
}

const sharesByCik = new Map<string, Shares>();

/** The company's latest share count, whether it is a foreign filer, or null if there is none recent. */
async function latestShares(cik: string): Promise<Shares> {
  if (sharesByCik.has(cik)) return sharesByCik.get(cik)!;
  let found: Shares = null;
  for (const concept of SHARE_CONCEPTS) {
    const data = await secGet<{ units?: Record<string, ConceptFact[]> }>(SEC_DATA.conceptUrl(cik, concept));
    const facts = data?.units?.shares ?? [];
    if (!facts.length) continue;
    const latest = facts.reduce((a, b) => (b.end > a.end ? b : a));
    if (latest.form && FOREIGN_FORMS.test(latest.form)) {
      found = { foreign: true };
      break;
    }
    const ageDays = (Date.now() - new Date(`${latest.end}T00:00:00Z`).getTime()) / 86_400_000;
    if (ageDays > FRESH_DAYS || !(latest.val >= MIN_SHARES)) continue;
    found = { shares: latest.val, asOf: latest.end, concept: concept.split("/")[1] };
    break;
  }
  sharesByCik.set(cik, found);
  return found;
}

const LEGAL_SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|LP|PLC|GROUP|HOLDINGS?|TRUST|CLASS\s+[A-Z])\b/g;

function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,'&]/g, "")
    .replace(LEGAL_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A ticker the filer typed into the asset name itself.
 *
 * Senate reports especially often leave the ticker column blank and write
 * "Infineon Technologies AG (IFNNY)" instead, so the row matches no ticker
 * filter, reaches no issuer page and gets no market cap.
 *
 * Only a symbol at the very *end* counts, after something that reads as a
 * company name (an optional trailing "[ST]" type code is allowed, since the
 * House template puts one there). That rules out the parentheses these names
 * are otherwise full of, as in "DOW CHEMICAL COMPANY (THE) 4.8% 11/30/2028".
 *
 * Structure alone is not enough, though: "UnitedHealth Group Incorporated
 * Common Stock (DE)" is shaped exactly like a real one, and DE is Deere's
 * ticker. Every candidate is confirmed against the SEC's name for that
 * symbol before it is believed.
 */
const EMBEDDED_TICKER = /\(([A-Z]{1,5}(?:\.[A-Z])?)\)\s*(?:\[[A-Za-z]{1,3}\])?\s*$/;

export function embeddedTickerCandidate(assetName: string): { symbol: string; company: string } | null {
  const match = assetName.match(EMBEDDED_TICKER);
  if (!match || match.index === undefined) return null;
  const company = assetName.slice(0, match.index).trim();
  if (!/[A-Za-z]/.test(company)) return null;
  return { symbol: match[1], company };
}

// Words that describe the *instrument* rather than name the company, and the
// legal-form suffixes that differ between how a filer writes a name and how
// the SEC does. Stripped from both sides before comparing.
const INSTRUMENT_WORDS =
  /\b(SPONSORED|UNSPONSORED|ADR|ADS|COMMON STOCK|ORDINARY SHARES?|DEPOSITARY SHARES?|CLASS [A-Z]|COMMON|SHARES?|STOCK|NEW)\b/g;
const LEGAL_FORMS = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|LP|PLC|NV|SA|SAU|SE|AG|SPA|ASA|AB|AS|OY|OYJ|ABP|GROUP|HOLDINGS?|THE)\b/g;

/** Two names for the same company, allowing for how differently they get written down. */
function sameCompany(filed: string, registered: string): boolean {
  const normalize = (value: string) =>
    value
      .toUpperCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/\/[A-Z]{2,3}\/?/g, " ")
      .replace(/[.'’]/g, "")
      .replace(/[,&/-]/g, " ")
      .replace(/\s+/g, " ")
      .replace(INSTRUMENT_WORDS, " ")
      .replace(LEGAL_FORMS, " ")
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = normalize(filed);
  const b = normalize(registered);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

async function saveAssetTicker(assetName: string, ticker: string | null): Promise<void> {
  await sql.query(
    `INSERT INTO asset_name_tickers (asset_name, ticker, resolved_at) VALUES ($1, $2, NOW())
     ON CONFLICT (asset_name) DO UPDATE SET ticker = EXCLUDED.ticker, resolved_at = NOW()`,
    [assetName, ticker]
  );
}

/** Fills in tickers the filer wrote into the asset name, where the SEC's name for that symbol agrees. */
async function resolveEmbeddedTickers(companies: Map<string, SecCompany>, dryRun: boolean): Promise<void> {
  const rows = (await sql.query(`
    SELECT DISTINCT t.asset_name FROM transactions t
    WHERE (t.ticker IS NULL OR t.ticker = '')
      AND t.asset_name ~ '\\([A-Z]{1,5}(\\.[A-Z])?\\)[[:space:]]*(\\[[A-Za-z]{1,3}\\])?[[:space:]]*$'
  `)) as { asset_name: string }[];
  const candidates = rows
    .map((r) => ({ assetName: r.asset_name, found: embeddedTickerCandidate(r.asset_name) }))
    .filter((c): c is { assetName: string; found: { symbol: string; company: string } } => c.found !== null);
  if (!candidates.length) {
    console.log("No asset names carry an unextracted ticker.");
    return;
  }

  let confirmed = 0;
  let rejected = 0;
  let unknown = 0;
  let rowsFixed = 0;
  for (const { assetName, found } of candidates) {
    const company = companies.get(secKey(found.symbol));
    if (!company) {
      unknown++;
      continue;
    }
    if (!sameCompany(found.company, company.title)) {
      rejected++;
      continue;
    }
    confirmed++;
    if (dryRun) continue;
    const result = (await sql.query(
      `UPDATE transactions SET ticker = $1 WHERE asset_name = $2 AND (ticker IS NULL OR ticker = '')`,
      [found.symbol, assetName]
    )) as unknown as { rowCount?: number };
    await saveAssetTicker(assetName, found.symbol);
    rowsFixed += result?.rowCount ?? 0;
  }
  console.log(
    `Embedded tickers: ${confirmed} confirmed${dryRun ? "" : ` (${rowsFixed} rows)`}, ${rejected} named a different company, ` +
      `${unknown} not listed by the SEC.`
  );
}

/**
 * A ticker for each asset name not seen before, when its name is exactly the
 * name of one SEC registrant (after normalizing punctuation and legal
 * suffixes). Anything less exact stays unresolved: attaching the wrong
 * company's data to a trade is worse than having none.
 */
async function resolveNewAssetNames(companies: Map<string, SecCompany>, dryRun: boolean): Promise<void> {
  const rows = (await sql.query(`
    SELECT DISTINCT t.asset_name FROM transactions t
    WHERE (t.ticker IS NULL OR t.ticker = '')
      AND NOT EXISTS (SELECT 1 FROM asset_name_tickers ant WHERE ant.asset_name = t.asset_name)
  `)) as { asset_name: string }[];
  if (!rows.length) {
    console.log("No new asset names to resolve.");
    return;
  }

  // First registrant per name: the list is in order of size, so where two
  // tickers share a name (share classes), the larger listing wins.
  const byName = new Map<string, string>();
  for (const [ticker, company] of companies) {
    const name = normalizeCompanyName(company.title);
    if (name && !byName.has(name)) byName.set(name, ticker);
  }

  let resolved = 0;
  for (const { asset_name } of rows) {
    const ticker = byName.get(normalizeCompanyName(asset_name)) ?? null;
    if (ticker) resolved++;
    if (!dryRun) await saveAssetTicker(asset_name, ticker);
  }
  console.log(`Asset names: ${resolved} of ${rows.length} new names matched an SEC registrant exactly.`);
}

type Outcome = "cap" | "fund" | "not at SEC" | "foreign filer" | "no recent share count" | "no price";

async function refreshMarketCaps(
  companies: Map<string, SecCompany>,
  funds: Set<string>,
  missingOnly: boolean,
  dryRun: boolean
): Promise<void> {
  const rows = (await sql.query(`
    SELECT t.ticker, cmc.market_cap::float8 AS old_cap FROM (
      SELECT DISTINCT ticker FROM transactions WHERE ticker IS NOT NULL AND ticker != ''
      UNION
      SELECT DISTINCT ticker FROM asset_name_tickers WHERE ticker IS NOT NULL
    ) t
    LEFT JOIN company_market_caps cmc ON cmc.ticker = t.ticker
    LEFT JOIN (SELECT ticker, COUNT(*) AS n FROM transactions GROUP BY ticker) traded ON traded.ticker = t.ticker
    ${missingOnly ? "WHERE cmc.logo_checked_at IS NULL" : ""}
    -- Most-traded first, so a run cut short has done the tickers people see.
    ORDER BY COALESCE(traded.n, 0) DESC, t.ticker
  `)) as { ticker: string; old_cap: number | null }[];
  if (!rows.length) {
    console.log(missingOnly ? "No tickers are missing a market-cap lookup." : "No tickers to refresh.");
    return;
  }
  console.log(`${missingOnly ? "Looking up" : "Refreshing"} market caps for ${rows.length} ticker(s) from the SEC...`);

  const prices = new Map(
    (
      (await sql.query(`SELECT ticker, close::float8 AS close FROM price_latest WHERE status = 'ok' AND close > 0`)) as {
        ticker: string;
        close: number;
      }[]
    ).map((r) => [r.ticker, r.close])
  );

  const counts = new Map<Outcome, number>();
  const compared: { ticker: string; oldCap: number; newCap: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { ticker, old_cap } = rows[i];
    let outcome: Outcome;
    let cap: number | null = null;
    try {
      const company = companies.get(secKey(ticker));
      if (!company) {
        outcome = funds.has(secKey(ticker)) ? "fund" : "not at SEC";
      } else {
        const shares = await latestShares(company.cik);
        if (shares === null) outcome = "no recent share count";
        else if ("foreign" in shares) outcome = "foreign filer";
        else {
          // Priced by the company's main listing where we have it: a note
          // trading under the same company is priced like a bond.
          const close = prices.get(company.primary) ?? prices.get(company.primary.replace(/-/g, ".")) ?? prices.get(ticker);
          if (!close) outcome = "no price";
          else {
            cap = Math.round(shares.shares * close);
            outcome = "cap";
          }
        }
      }
    } catch (err) {
      // An SEC hiccup leaves this ticker as it was, to be tried next run.
      console.error(`  ${ticker}: ${(err as Error).message}`);
      continue;
    }
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    if (cap !== null && old_cap) compared.push({ ticker, oldCap: old_cap, newCap: cap });

    if (!dryRun) {
      // Logos are not stored: the clients load them from Brandfetch by ticker
      // (@congtrade/shared/brandLogo). logo_checked_at marks the ticker as
      // looked up.
      try {
        await withRetry(() =>
          sql.query(
            `INSERT INTO company_market_caps (ticker, market_cap, source_currency, logo_url, logo_checked_at, updated_at)
             VALUES ($1, $2, $3, NULL, NOW(), NOW())
             ON CONFLICT (ticker) DO UPDATE SET market_cap = EXCLUDED.market_cap, source_currency = EXCLUDED.source_currency,
               logo_url = NULL, logo_checked_at = NOW(), updated_at = NOW()`,
            [ticker, cap, cap === null ? null : "USD"]
          )
        );
      } catch (err) {
        // Left as it was, to be written next run, rather than stopping a
        // run that is otherwise half done.
        console.error(`  ${ticker}: not saved (${(err as Error).message})`);
      }
    }
    if ((i + 1) % 250 === 0) console.log(`  ...${i + 1}/${rows.length}`);
  }

  const order: Outcome[] = ["cap", "fund", "not at SEC", "foreign filer", "no recent share count", "no price"];
  console.log(`Market caps: ${order.map((o) => `${counts.get(o) ?? 0} ${o}`).join(", ")}.`);

  if (dryRun && compared.length) {
    const ratios = compared.map((c) => c.newCap / c.oldCap).sort((a, b) => a - b);
    const within = (pct: number) => ratios.filter((r) => Math.abs(r - 1) <= pct / 100).length;
    const pctOf = (n: number) => `${((n / ratios.length) * 100).toFixed(0)}%`;
    console.log(
      `\nAgainst the caps stored now (${compared.length} tickers with both): median ratio ${ratios[Math.floor(ratios.length / 2)].toFixed(3)}, ` +
        `within 10%: ${pctOf(within(10))}, within 25%: ${pctOf(within(25))}, off by more than 2x: ${pctOf(ratios.filter((r) => r > 2 || r < 0.5).length)}.`
    );
    const far = [...compared].sort((a, b) => Math.abs(Math.log(b.newCap / b.oldCap)) - Math.abs(Math.log(a.newCap / a.oldCap)));
    const fmt = (n: number) => `$${(n / 1e9).toFixed(1)}B`;
    console.log("Furthest apart: " + far.slice(0, 15).map((c) => `${c.ticker} ${fmt(c.oldCap)}→${fmt(c.newCap)}`).join(", "));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const missingOnly = args.includes("--missing-only");
  const dryRun = args.includes("--dry-run");

  await ensureSchema();
  const [companies, funds] = await Promise.all([secCompanies(), secFundTickers()]);
  console.log(`SEC lists: ${companies.size} company tickers, ${funds.size} fund tickers.${dryRun ? " (dry run: nothing is written)" : ""}`);

  if (!missingOnly) {
    await resolveEmbeddedTickers(companies, dryRun);
    await resolveNewAssetNames(companies, dryRun);
  }
  await refreshMarketCaps(companies, funds, missingOnly, dryRun);

  // No logo addresses are kept (see above), including for tickers this run
  // did not reach.
  if (!dryRun) await sql.query(`UPDATE company_market_caps SET logo_url = NULL WHERE logo_url IS NOT NULL`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
