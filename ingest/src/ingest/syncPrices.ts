import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { closeOn } from "../prices/resolve.js";
import { TransientPriceError, type DailySeries, type PriceSource } from "../prices/source.js";
import { yahoo } from "../prices/yahoo.js";

/**
 * Keeps the closes that trades need: on the day each was traded, on the day
 * it was disclosed, and the latest. See price_points in schema.ts for why only
 * those, and the price source for where they come from.
 *
 * One request per ticker either way. A ticker gets its whole range again
 * (from its earliest trade) when it has a trade or filing date with no close
 * stored yet, or when its source reports a split, because closes are
 * split-adjusted as of the fetch and mixing two fetches across a split would
 * turn a 2-for-1 into a 50% loss. Otherwise only the last couple of weeks are
 * asked for, to move the latest close on.
 *
 * Flags:
 *   --full          refetch every ticker's whole range (after changing source)
 *   --ticker=NVDA   one ticker, for checking a result by hand
 *   --limit=N       stop after N tickers
 */

const SOURCE: PriceSource = yahoo;
// Yahoo rate-limits in bursts rather than by a published quota; a request a
// second has stayed under it, and a 429 is waited out (see fetchWithRetry).
const DELAY_MS = 1_000;
const RECENT_DAYS = 14;
// A symbol the source does not know is asked about again after this long, in
// case it was a temporary gap rather than a delisting.
const NOT_FOUND_RETRY_DAYS = 30;
// A ticker synced this recently with nothing missing is left alone, so a
// second run the same day (a restart, a manual dispatch) skips what is done.
const FRESH_HOURS = 18;
// This many failures in a row means the source is refusing us, not that
// these particular tickers are odd; stop rather than hammer it.
const MAX_CONSECUTIVE_FAILURES = 8;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysBefore(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);

type Latest = { ticker: string; status: string; close_day: string | null; first_day: string | null; synced_at: string };

async function fetchWithRetry(ticker: string, fromDay: string): Promise<DailySeries | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await SOURCE.daily(ticker, fromDay);
    } catch (err) {
      if (!(err instanceof TransientPriceError) || attempt >= 3) throw err;
      await sleep([20_000, 60_000, 120_000][attempt]);
    }
  }
}

async function writePoints(ticker: string, rows: { day: string; close: number; close_day: string }[], replace: boolean) {
  if (replace) await sql.query(`DELETE FROM price_points WHERE ticker = $1`, [ticker]);
  if (!rows.length) return;
  await sql.query(
    `INSERT INTO price_points (ticker, day, close, close_day)
     SELECT $1, d, c, cd FROM unnest($2::text[], $3::float8[], $4::text[]) AS x(d, c, cd)
     ON CONFLICT (ticker, day) DO UPDATE SET close = EXCLUDED.close, close_day = EXCLUDED.close_day`,
    [ticker, rows.map((r) => r.day), rows.map((r) => r.close), rows.map((r) => r.close_day)]
  );
}

async function writeLatest(
  ticker: string,
  status: string,
  close: number | null,
  closeDay: string | null,
  note: string | null,
  firstDay: string | null = null
) {
  await sql.query(
    `INSERT INTO price_latest (ticker, close, close_day, status, source, note, first_day, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (ticker) DO UPDATE SET
       close = COALESCE(EXCLUDED.close, price_latest.close),
       close_day = COALESCE(EXCLUDED.close_day, price_latest.close_day),
       first_day = COALESCE(EXCLUDED.first_day, price_latest.first_day),
       status = EXCLUDED.status, source = EXCLUDED.source, note = EXCLUDED.note, synced_at = NOW()`,
    [ticker, close, closeDay, status, SOURCE.name, note, firstDay]
  );
}

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const only = args.find((a) => a.startsWith("--ticker="))?.slice(9).toUpperCase();
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;

  await ensureSchema();

  // Every date a close is wanted for, per ticker: when it was traded and when
  // it was disclosed.
  const needed = (await sql.query(
    `SELECT ticker, array_agg(DISTINCT day ORDER BY day) AS days FROM (
       SELECT t.ticker, t.transaction_date AS day FROM transactions t
       WHERE t.ticker IS NOT NULL AND t.ticker <> '' AND t.transaction_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       UNION
       SELECT t.ticker, f.filing_date AS day FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.ticker IS NOT NULL AND t.ticker <> '' AND f.filing_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) x
     WHERE day <= $1 ${only ? "AND ticker = $2" : ""}
     GROUP BY ticker
     -- Most-traded first, so a run cut short has done the tickers people see.
     ORDER BY COUNT(*) DESC, ticker`,
    only ? [today, only] : [today]
  )) as { ticker: string; days: string[] }[];

  const stored = new Map<string, Set<string>>();
  for (const r of (await sql.query(`SELECT ticker, day FROM price_points`)) as { ticker: string; day: string }[]) {
    if (!stored.has(r.ticker)) stored.set(r.ticker, new Set());
    stored.get(r.ticker)!.add(r.day);
  }
  const latest = new Map<string, Latest>();
  for (const r of (await sql.query(
    `SELECT ticker, status, close_day, first_day, synced_at::text FROM price_latest`
  )) as Latest[]) {
    latest.set(r.ticker, r);
  }

  console.log(`Syncing closes for ${needed.length} ticker(s) from ${SOURCE.name}${full ? " (full refetch)" : ""}...`);
  let fetched = 0;
  let refreshed = 0;
  let notFound = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let points = 0;

  for (const [i, { ticker, days }] of needed.slice(0, limit).entries()) {
    const known = latest.get(ticker);
    if (
      !full &&
      known?.status === "not_found" &&
      Date.now() - new Date(known.synced_at).getTime() < NOT_FOUND_RETRY_DAYS * 86_400_000
    ) {
      skipped++;
      continue;
    }

    const have = stored.get(ticker) ?? new Set<string>();
    // A day after the latest stored close cannot be answered yet (it is
    // early, not missing), and one before the series starts never can be.
    const answerable = (d: string) =>
      (!known?.close_day || d <= known.close_day) && (!known?.first_day || d >= known.first_day);
    const missing = days.filter((d) => !have.has(d) && answerable(d));
    const whole = full || !known || known.status !== "ok" || missing.length > 0;
    if (!whole && Date.now() - new Date(known!.synced_at).getTime() < FRESH_HOURS * 3_600_000) {
      skipped++;
      continue;
    }
    const fromDay = whole ? daysBefore(days[0], 10) : daysBefore(known!.close_day ?? today, RECENT_DAYS);

    try {
      let series = await fetchWithRetry(ticker, fromDay);
      if (!series || !series.closes.length) {
        notFound++;
        consecutiveFailures = 0;
        await writeLatest(ticker, "not_found", null, null, series ? "no closes in range" : `${SOURCE.name} has no such symbol`);
        await sleep(DELAY_MS);
        continue;
      }

      // A split since the last close we stored puts the old rows on another
      // basis: fetch the whole range and rewrite them.
      let rewrite = whole;
      if (!whole && known?.close_day && series.splits.some((d) => d > known.close_day!)) {
        await sleep(DELAY_MS);
        series = await fetchWithRetry(ticker, daysBefore(days[0], 10));
        rewrite = true;
        if (!series || !series.closes.length) throw new Error("split refetch returned nothing");
      }

      if (rewrite) {
        const rows = days
          .map((day) => {
            const c = closeOn(series!.closes, day);
            return c ? { day, close: c.close, close_day: c.day } : null;
          })
          .filter((r): r is { day: string; close: number; close_day: string } => r !== null);
        await writePoints(ticker, rows, true);
        points += rows.length;
        fetched++;
      } else {
        // Recent window only: fill any day it now answers (a filing from the
        // weekend, say) without touching the rest.
        const rows = days
          .filter((d) => !have.has(d))
          .map((day) => {
            const c = closeOn(series!.closes, day);
            return c ? { day, close: c.close, close_day: c.day } : null;
          })
          .filter((r): r is { day: string; close: number; close_day: string } => r !== null);
        await writePoints(ticker, rows, false);
        points += rows.length;
        refreshed++;
      }

      const last = series.closes[series.closes.length - 1];
      // The first close is only meaningful from a fetch of the whole range.
      await writeLatest(ticker, "ok", last.close, last.day, null, rewrite ? series.closes[0].day : null);
      consecutiveFailures = 0;
    } catch (err) {
      failed++;
      consecutiveFailures++;
      console.error(`  ${ticker}: ${(err as Error).message}`);
      await writeLatest(ticker, "error", null, null, (err as Error).message.slice(0, 200)).catch(() => {});
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`Stopping: ${consecutiveFailures} failures in a row, the source is refusing requests.`);
        break;
      }
    }
    if ((i + 1) % 200 === 0) console.log(`  ...${i + 1}/${Math.min(needed.length, limit)}`);
    await sleep(DELAY_MS);
  }

  console.log(
    `Prices: ${fetched} fetched in full, ${refreshed} refreshed, ${notFound} not found at ${SOURCE.name}, ` +
      `${skipped} skipped (recently not found, or synced in the last ${FRESH_HOURS}h), ${failed} failed. ${points} closes written.`
  );
  if (failed > 0 && fetched + refreshed === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
