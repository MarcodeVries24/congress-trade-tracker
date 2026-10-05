import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { SEC_COMPANY_TICKERS } from "../config.js";
import { COMPANY_NAME_OVERRIDES, companyNameFrom, secTicker } from "./companyName.js";

/**
 * Company names, from the SEC.
 *
 * Every traded ticker gets the name it is registered under with the SEC,
 * cased the way its filings write it (see companyName.ts), or a name fixed by
 * hand. A ticker the SEC does not list (a fund, a company since taken over or
 * delisted, most foreign listings) gets no name, and the site shows the name
 * as filed instead.
 *
 * `--dry-run` prints what would change and writes nothing.
 *
 * Writes only the name: a row it creates for a ticker the market-cap sync has
 * not reached yet is still looked up there (it checks logo_checked_at).
 */

type SecEntry = { cik_str: number; ticker: string; title: string };

// The SEC list has some 10,000 entries; far fewer means a bad download, and
// writing from it would blank names that are right.
const MIN_SEC_ENTRIES = 5000;

async function secTitles(): Promise<Map<string, string>> {
  const res = await fetch(SEC_COMPANY_TICKERS.url, { headers: { "user-agent": SEC_COMPANY_TICKERS.userAgent } });
  if (!res.ok) throw new Error(`SEC company list answered ${res.status}`);
  const entries = Object.values((await res.json()) as Record<string, SecEntry>);
  if (entries.length < MIN_SEC_ENTRIES) throw new Error(`SEC company list has only ${entries.length} entries`);
  const byTicker = new Map<string, string>();
  // Listed in order of size, so the first entry for a ticker is the one in use.
  for (const e of entries) if (!byTicker.has(e.ticker.toUpperCase())) byTicker.set(e.ticker.toUpperCase(), e.title);
  return byTicker;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await ensureSchema();
  const titles = await secTitles();

  const [tickerRows, filedRows, currentRows] = (await Promise.all([
    sql.query(`SELECT DISTINCT ticker FROM transactions WHERE ticker IS NOT NULL AND ticker <> ''
               UNION SELECT DISTINCT ticker FROM asset_name_tickers WHERE ticker IS NOT NULL`),
    sql.query(`SELECT ticker, asset_name, COUNT(*)::int AS n FROM transactions
               WHERE ticker IS NOT NULL AND ticker <> '' GROUP BY 1, 2`),
    sql.query(`SELECT ticker, company_name FROM company_market_caps`),
  ])) as [{ ticker: string }[], { ticker: string; asset_name: string; n: number }[], { ticker: string; company_name: string | null }[]];

  const filed = new Map<string, [string, number][]>();
  for (const r of filedRows) {
    const list = filed.get(r.ticker) ?? [];
    list.push([r.asset_name, r.n]);
    filed.set(r.ticker, list);
  }
  const current = new Map(currentRows.map((r) => [r.ticker, r.company_name]));

  const tickers: string[] = [];
  const names: (string | null)[] = [];
  let fromSec = 0;
  let fixed = 0;
  let unlisted = 0;
  for (const { ticker } of tickerRows) {
    const title = titles.get(secTicker(ticker));
    const name = COMPANY_NAME_OVERRIDES[ticker] ?? (title ? companyNameFrom(title, filed.get(ticker) ?? []) : null);
    if (COMPANY_NAME_OVERRIDES[ticker]) fixed++;
    else if (title) fromSec++;
    else unlisted++;
    const before = current.has(ticker) ? current.get(ticker) ?? null : undefined;
    // A ticker with no row and no name needs nothing written.
    if (before === name || (before === undefined && name === null)) continue;
    tickers.push(ticker);
    names.push(name);
    if (dryRun && tickers.length <= 40) console.log(`  ${ticker}: ${JSON.stringify(before ?? null)} -> ${JSON.stringify(name)}`);
  }

  console.log(
    `${tickerRows.length} tickers: ${fromSec} named from the SEC, ${fixed} fixed by hand, ${unlisted} not listed there. ` +
      `${tickers.length} name(s) ${dryRun ? "would change" : "changed"}.`
  );
  if (dryRun || tickers.length === 0) return;

  await sql.query(
    `INSERT INTO company_market_caps (ticker, company_name)
     SELECT * FROM UNNEST($1::text[], $2::text[])
     ON CONFLICT (ticker) DO UPDATE SET company_name = EXCLUDED.company_name`,
    [tickers, names]
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
