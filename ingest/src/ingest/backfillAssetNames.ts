import "../loadEnv.js";
import { writeFileSync } from "node:fs";
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
 * Usage: npm run backfill:asset-names [-- --apply]
 */
const MATCH = `asset_name LIKE '% Company: %' OR asset_name LIKE '% Description: %'`;

async function main() {
  const apply = process.argv.includes("--apply");

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
