import "../loadEnv.js";
import { sql } from "../db/index.js";
import { REVIEW_STATUSES } from "./reviewQueue.js";

/**
 * Publishes a filing that has been verified by hand: flips parse_status to
 * 'manual', which is what the site's publish gate looks for.
 *
 * This is the *last* step of a pixel-by-pixel review, not the review itself.
 * It assumes the transactions table already holds the corrected rows — the
 * audit script that rewrites them runs first. All this does is say "a human
 * has checked this scan", and it refuses when the evidence contradicts that:
 *
 *  - the filing isn't actually awaiting review (already 'ok'/'manual', or a
 *    status this queue doesn't cover), or
 *  - filings.transaction_count disagrees with the rows actually present,
 *    which means the rewrite was partial.
 *
 * A filing with genuinely zero transactions is allowed through (an 'empty'
 * scan that really is blank is a legitimate review outcome) but it has to be
 * said out loud with --allow-empty, so it can't happen by accident on a
 * filing whose rows simply were never written.
 *
 * Usage: npm run review:approve -- <docId> [<docId>...] [--allow-empty]
 */
/**
 * The bounds a disclosure bracket implies, read from the label itself so this
 * can never drift out of step with the bracket set.
 *
 * Returns null for labels with no upper bound ("Over $1,000,000***") or no
 * figure at all ("(unreadable)"), which are legitimate and left alone.
 */
function boundsFromLabel(range: string): { low: number; high: number } | null {
  const between = range.match(/^\$([\d,]+)\s*-\s*\$([\d,]+)$/);
  if (between) return { low: Number(between[1].replace(/,/g, "")), high: Number(between[2].replace(/,/g, "")) };
  const orLess = range.match(/^\$([\d,]+) or less$/i);
  if (orLess) return { low: 0, high: Number(orLess[1].replace(/,/g, "")) };
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const allowEmpty = args.includes("--allow-empty");
  const docIds = args.filter((a) => !a.startsWith("--"));

  if (docIds.length === 0) {
    console.error("Usage: npm run review:approve -- <docId> [<docId>...] [--allow-empty]");
    process.exit(1);
  }

  const rows = (await sql.query(
    `SELECT f.doc_id, f.member_name, f.filing_date, f.parse_status, f.transaction_count,
            (SELECT COUNT(*)::int FROM transactions t WHERE t.doc_id = f.doc_id) AS actual
     FROM filings f WHERE f.doc_id = ANY($1)`,
    [docIds]
  )) as {
    doc_id: string; member_name: string; filing_date: string;
    parse_status: string; transaction_count: number; actual: number;
  }[];

  const found = new Set(rows.map((r) => r.doc_id));
  const missing = docIds.filter((d) => !found.has(d));
  if (missing.length) throw new Error(`no such filing(s): ${missing.join(", ")}`);

  const problems: string[] = [];
  for (const r of rows) {
    if (!(REVIEW_STATUSES as readonly string[]).includes(r.parse_status)) {
      problems.push(`${r.doc_id} is '${r.parse_status}', not awaiting review`);
    }
    if (r.transaction_count !== r.actual) {
      problems.push(
        `${r.doc_id} transaction_count=${r.transaction_count} but ${r.actual} row(s) present — rewrite it fully first`
      );
    }
    if (r.actual === 0 && !allowEmpty) {
      problems.push(`${r.doc_id} has no transactions — pass --allow-empty if the scan really is blank`);
    }
  }

  // A transcribed row whose amount_low/amount_high disagree with its own
  // bracket label. The label is what a human read off the form; the bounds are
  // derived, and when they were written by hand they have been wrong — one
  // Malliotakis row read "$1,001 - $15,000" while storing 25,000,001/50,000,000,
  // which made a $1k Chipotle purchase the single largest trade on the site and
  // added $37m to the estimated volume. Cheap to check, invisible when missed.
  const amountRows = (await sql.query(
    `SELECT id, doc_id, amount_range, amount_low, amount_high, asset_name
     FROM transactions WHERE doc_id = ANY($1) AND amount_range IS NOT NULL AND amount_range <> ''`,
    [docIds]
  )) as { id: number; doc_id: string; amount_range: string; amount_low: number | null; amount_high: number | null; asset_name: string }[];

  for (const row of amountRows) {
    const expected = boundsFromLabel(row.amount_range);
    if (!expected) continue;
    if (row.amount_low !== expected.low || row.amount_high !== expected.high) {
      problems.push(
        `${row.doc_id} row ${row.id} ("${row.asset_name.slice(0, 40)}") is labelled "${row.amount_range}" ` +
          `but stores ${row.amount_low}/${row.amount_high} — expected ${expected.low}/${expected.high}`
      );
    }
  }
  if (problems.length) {
    console.error("Refusing to publish:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  await sql.query(`UPDATE filings SET parse_status = 'manual' WHERE doc_id = ANY($1)`, [docIds]);

  for (const r of rows) {
    console.log(`published  ${r.filing_date}  ${r.member_name}  (${r.doc_id})  ${r.actual} transaction(s)`);
  }
  console.log(`\n${rows.length} filing(s) now live on the site.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
