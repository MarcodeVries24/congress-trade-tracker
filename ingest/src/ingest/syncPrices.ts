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
 *   --new-only      only tickers with a trade or filing date not yet priced
 *                   (or never fetched): what the ingest runs after each
 *                   cycle, so new trades get their closes within hours; the
 *                   nightly run moves every latest close on
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

/**
 * The dates one ticker wants a close for, earliest first; with `unpricedOnly`,
 * only those with no close stored yet. Asked per ticker, for the tickers a
 * run actually fetches, rather than for all of them up front.
 */
async function wantedDays(ticker: string, unpricedOnly: boolean): Promise<string[]> {
  const rows = (await sql.query(
    `SELECT day FROM (
       SELECT t.transaction_date AS day FROM transactions t
       WHERE t.ticker = $1 AND t.transaction_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       UNION
       SELECT f.filing_date AS day FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.ticker = $1 AND f.filing_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) x
     WHERE day <= $2
       ${unpricedOnly ? "AND NOT EXISTS (SELECT 1 FROM price_points pp WHERE pp.ticker = $1 AND pp.day = x.day)" : ""}
     ORDER BY day`,
    [ticker, today]
  )) as { day: string }[];
  return rows.map((r) => r.day);
}

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const only = args.find((a) => a.startsWith("--ticker="))?.slice(9).toUpperCase();
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;
  const newOnly = args.includes("--new-only");

  await ensureSchema();

  // One row per ticker, worked out in the database: how many dates want a
  // close (when it was traded and when it was disclosed), how many of those
  // have none stored yet that the source could answer, and how its last sync
  // went. This used to fetch every one of those dates and every stored close
  // (the whole price_points table) to compare them here, a few MB per run, to
  // conclude on most runs that nothing was missing; on Neon that read was a
  // large share of the month's network transfer. With --new-only, only the
  // tickers that need fetching come back at all.
  const params: unknown[] = [today];
  if (only) params.push(only);
  const rows = (await sql.query(
    `WITH wanted AS (
       SELECT t.ticker, t.transaction_date AS day FROM transactions t
       WHERE t.ticker IS NOT NULL AND t.ticker <> '' AND t.transaction_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       UNION
       SELECT t.ticker, f.filing_date AS day FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.ticker IS NOT NULL AND t.ticker <> '' AND f.filing_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ),
     per_ticker AS (
       SELECT w.ticker, MIN(w.day) AS first_wanted, COUNT(*)::int AS wanted,
              COUNT(*) FILTER (
                WHERE pp.ticker IS NULL
                  AND (pl.close_day IS NULL OR w.day <= pl.close_day)
                  AND (pl.first_day IS NULL OR w.day >= pl.first_day)
              )::int AS missing
       FROM wanted w
       LEFT JOIN price_points pp ON pp.ticker = w.ticker AND pp.day = w.day
       LEFT JOIN price_latest pl ON pl.ticker = w.ticker
       WHERE w.day <= $1 ${only ? "AND w.ticker = $2" : ""}
       GROUP BY w.ticker
     )
     SELECT p.ticker, p.first_wanted, p.missing,
            pl.status, pl.close_day, pl.first_day, pl.synced_at::text AS synced_at
     FROM per_ticker p
     LEFT JOIN price_latest pl ON pl.ticker = p.ticker
     ${
       // What --new-only would skip anyway: priced, nothing missing.
       newOnly && !full ? "WHERE pl.ticker IS NULL OR pl.status <> 'ok' OR p.missing > 0" : ""
     }
     -- Most-traded first, so a run cut short has done the tickers people see.
     ORDER BY p.wanted DESC, p.ticker`,
    params
  )) as {
    ticker: string;
    first_wanted: string;
    missing: number;
    status: string | null;
    close_day: string | null;
    first_day: string | null;
    synced_at: string | null;
  }[];

  console.log(`Syncing closes for ${rows.length} ticker(s) from ${SOURCE.name}${full ? " (full refetch)" : ""}...`);
  let fetched = 0;
  let refreshed = 0;
  let notFound = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let points = 0;

  for (const [i, row] of rows.slice(0, limit).entries()) {
    const { ticker, first_wanted: firstWanted } = row;
    const known: Latest | undefined = row.status
      ? { ticker, status: row.status, close_day: row.close_day, first_day: row.first_day, synced_at: row.synced_at! }
      : undefined;
    if (
      !full &&
      known?.status === "not_found" &&
      Date.now() - new Date(known.synced_at).getTime() < NOT_FOUND_RETRY_DAYS * 86_400_000
    ) {
      skipped++;
      continue;
    }

    // `missing` counts only days the source could answer: one after the
    // latest stored close is early, not missing, and one before the series
    // starts never can be (see the query above).
    const whole = full || !known || known.status !== "ok" || row.missing > 0;
    if (!whole && (newOnly || Date.now() - new Date(known!.synced_at).getTime() < FRESH_HOURS * 3_600_000)) {
      skipped++;
      continue;
    }
    const fromDay = whole ? daysBefore(firstWanted, 10) : daysBefore(known!.close_day ?? today, RECENT_DAYS);

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
        series = await fetchWithRetry(ticker, daysBefore(firstWanted, 10));
        rewrite = true;
        if (!series || !series.closes.length) throw new Error("split refetch returned nothing");
      }

      if (rewrite) {
        // Every date this ticker wants, all rewritten from this one fetch.
        const days = await wantedDays(ticker, false);
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
        const rows = (await wantedDays(ticker, true))
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
    if ((i + 1) % 200 === 0) console.log(`  ...${i + 1}/${Math.min(rows.length, limit)}`);
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
