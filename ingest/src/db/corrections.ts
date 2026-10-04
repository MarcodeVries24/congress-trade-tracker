import { sql } from "./index.js";

/**
 * Hand corrections to the corpus, kept so a re-read of a filing can't undo
 * them. The 2026-10 data audit's clean-up wrote every change here as well as
 * to the rows themselves; the ingest re-applies a filing's corrections right
 * after it rewrites that filing (run.ts, runSenate.ts).
 *
 * A transaction is matched by its filing and its asset name as it stood
 * before the correction (or as corrected, for a filing re-read by a parser
 * that already produces the clean name), plus the field's old value, so a
 * correction never touches a row it wasn't made for.
 */
const TRANSACTION_FIELDS = new Set(["asset_name", "ticker", "owner", "asset_type_code", "transaction_type"]);
const FILING_FIELDS = new Set(["parse_status", "bioguide_id"]);

export interface Correction {
  doc_id: string;
  target: "transaction" | "filing";
  match_asset_name: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
}

export async function applyCorrections(docId: string): Promise<number> {
  const rows = (await sql.query(
    `SELECT * FROM data_corrections WHERE doc_id = $1 ORDER BY (field = 'asset_name') DESC, id`,
    [docId]
  )) as (Correction & { id: number })[];
  let changed = 0;
  for (const c of rows) {
    if (c.target === "filing") {
      if (!FILING_FIELDS.has(c.field)) continue;
      // A hidden duplicate stays hidden only while it would otherwise be live.
      const guard = c.field === "parse_status" ? `AND parse_status IN ('ok', 'manual')` : "";
      const res = (await sql.query(
        `UPDATE filings SET ${c.field} = $2 WHERE doc_id = $1 AND ${c.field} IS DISTINCT FROM $2 ${guard} RETURNING doc_id`,
        [docId, c.new_value]
      )) as unknown[];
      changed += res.length;
      continue;
    }
    if (!TRANSACTION_FIELDS.has(c.field)) continue;
    if (c.field === "asset_name") {
      const res = (await sql.query(
        `UPDATE transactions SET asset_name = $3 WHERE doc_id = $1 AND asset_name = $2 RETURNING id`,
        [docId, c.old_value, c.new_value]
      )) as unknown[];
      changed += res.length;
      continue;
    }
    const renamed = rows.find((r) => r.field === "asset_name" && r.old_value === c.match_asset_name)?.new_value ?? c.match_asset_name;
    const res = (await sql.query(
      `UPDATE transactions SET ${c.field} = $4
       WHERE doc_id = $1 AND asset_name IN ($2, $3) AND ${c.field} IS NOT DISTINCT FROM $5
       RETURNING id`,
      [docId, c.match_asset_name, renamed, c.new_value, c.old_value]
    )) as unknown[];
    changed += res.length;
  }
  return changed;
}
