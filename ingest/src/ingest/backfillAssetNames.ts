import "../loadEnv.js";
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "../db/index.js";
import { stripAssetDetail } from "./senate/parseReport.js";

/**
 * One-off repair for asset names that swallowed eFD's detail block.
 *
 * The Senate report parser read the Asset Name cell with textContent, which
 * flattens the name together with the "Company: ... Description: ..." block
 * the page renders inside the same cell. parseReport.ts now strips it on the
 * way in; this rewrites the rows that were stored before it did.
 *
 * It uses the same stripAssetDetail the parser uses, so a row repaired here
 * and the same row re-ingested tomorrow cannot disagree.
 *
 * Dry run by default. Pass --apply to write, which first saves every original
 * value to a JSON file so the change can be undone.
 *
 * Once a run has happened the detail block is no longer in the database, so a
 * later change to stripAssetDetail cannot be applied from the rows themselves.
 * --from-backup replays the current rule over the originals in one of those
 * saved files instead, which is what makes the rule safe to refine.
 *
 * Usage: npm run backfill:asset-names [-- --apply] [-- --from-backup <file>]
 */
const MATCH = `asset_name LIKE '% Company: %' OR asset_name LIKE '% Description: %'`;

type Change = { id: number; doc_id: string; before: string; after: string };

/** Re-derives names from a previous run's saved originals. */
async function fromBackup(path: string, apply: boolean) {
  const saved = JSON.parse(readFileSync(path, "utf8")) as Change[];
  const current = (await sql.query(`SELECT id, asset_name FROM transactions WHERE id = ANY($1)`, [
    saved.map((s) => s.id),
  ])) as { id: number; asset_name: string }[];
  const byId = new Map(current.map((r) => [r.id, r.asset_name]));

  const changes = saved
    .map((s) => ({ id: s.id, doc_id: s.doc_id, before: byId.get(s.id) ?? "", after: stripAssetDetail(s.before) }))
    .filter((c) => c.before && c.after && c.after !== c.before);

  console.log(`${saved.length} row(s) in ${path}, ${changes.length} differ from what is stored`);
  for (const c of changes) {
    console.log(`  ${c.id}\n    stored ${JSON.stringify(c.before)}\n    rule   ${JSON.stringify(c.after)}`);
  }
  if (!apply) {
    console.log("\nDry run, nothing written. Add --apply to write.");
    return;
  }
  for (const c of changes) {
    await sql.query(`UPDATE transactions SET asset_name = $1 WHERE id = $2`, [c.after, c.id]);
  }
  console.log(`\nUpdated ${changes.length} row(s).`);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const backupFlag = process.argv.indexOf("--from-backup");
  if (backupFlag !== -1) {
    const path = process.argv[backupFlag + 1];
    if (!path) throw new Error("--from-backup needs a file path");
    return fromBackup(path, apply);
  }

  const rows = (await sql.query(
    `SELECT t.id, t.doc_id, t.asset_name, f.parse_status
     FROM transactions t JOIN filings f USING (doc_id)
     WHERE ${MATCH} ORDER BY t.id`
  )) as { id: number; doc_id: string; asset_name: string; parse_status: string }[];

  // A 'manual' filing was transcribed by a human against the scan, so its
  // names are a deliberate reading rather than parser output. Repairing one
  // would silently overwrite that. None matched when this was written; if one
  // ever does, it gets looked at by eye instead.
  const manual = rows.filter((r) => r.parse_status === "manual");
  if (manual.length) {
    console.error(
      `Refusing: ${manual.length} matching row(s) belong to hand-verified filings ` +
        `(${[...new Set(manual.map((r) => r.doc_id))].join(", ")}). Review those by hand.`
    );
    process.exit(1);
  }

  const changes = rows
    .map((r) => ({ id: r.id, doc_id: r.doc_id, before: r.asset_name, after: stripAssetDetail(r.asset_name) }))
    .filter((c) => c.after && c.after !== c.before);

  console.log(`${rows.length} matching row(s), ${changes.length} to change`);
  for (const c of changes.slice(0, 5)) {
    console.log(`  ${c.id}\n    before ${JSON.stringify(c.before)}\n    after  ${JSON.stringify(c.after)}`);
  }
  if (changes.length > 5) console.log(`  ... and ${changes.length - 5} more`);

  if (!apply) {
    console.log("\nDry run, nothing written. Re-run with -- --apply to write.");
    return;
  }

  const backup = `asset-name-backfill-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backup, JSON.stringify(changes, null, 2));
  console.log(`\nOriginals saved to ${backup}`);

  for (const c of changes) {
    await sql.query(`UPDATE transactions SET asset_name = $1 WHERE id = $2`, [c.after, c.id]);
  }

  const left = (await sql.query(`SELECT count(*)::int AS n FROM transactions WHERE ${MATCH}`)) as { n: number }[];
  console.log(`Updated ${changes.length} row(s). ${left[0].n} still matching.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
