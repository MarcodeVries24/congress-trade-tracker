import { sql, KEEP_APPROVAL_SQL } from "../../db/index.js";
import { applyCorrections } from "../../db/corrections.js";
import { cleanParsedAsset } from "../assetName.js";
import type { SenateTransaction } from "./parseReport.js";

/**
 * Writing a Senate report to filings and transactions, for both ways one
 * arrives: the automated search (runSenate.ts) and a page uploaded in
 * /admin/senate (importSenateUploads.ts). One copy, so the two can never
 * store the same report differently.
 */
export interface SenateFilingRecord {
  docId: string;
  filerName: string;
  /** "SEN:{last name}", see senateMemberKey. */
  stateDistrict: string;
  /** ISO date the Senate received it. */
  filingDate: string;
  year: number;
  reportUrl: string;
}

/** A report that could not be read: recorded so the review queue shows it. */
export async function recordUnreadSenateFiling(f: SenateFilingRecord, status: "unsupported" | "failed"): Promise<void> {
  await sql.query(
    `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
     VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, $7, 0)
     ON CONFLICT (doc_id) DO UPDATE SET parse_status = EXCLUDED.parse_status, pdf_url = EXCLUDED.pdf_url, ingested_at = NOW()`,
    [f.docId, f.filerName, f.stateDistrict, f.filingDate, f.year, f.reportUrl, status]
  );
}

/**
 * A read report and its rows, replacing any earlier reading of it. An
 * approval it already had is kept (KEEP_APPROVAL_SQL); corrections made by
 * hand are applied again afterwards.
 */
export async function saveSenateFiling(
  f: SenateFilingRecord,
  status: "ok" | "empty" | "ocr",
  transactions: SenateTransaction[]
): Promise<void> {
  await sql.transaction((tx) => [
    tx.query(
      `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
       VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, $7, $8)
       ON CONFLICT (doc_id) DO UPDATE SET
         parse_status = EXCLUDED.parse_status,
         transaction_count = EXCLUDED.transaction_count,
         pdf_url = EXCLUDED.pdf_url,
         ingested_at = NOW(),
         ${KEEP_APPROVAL_SQL}`,
      [f.docId, f.filerName, f.stateDistrict, f.filingDate, f.year, f.reportUrl, status, transactions.length]
    ),
    tx.query(`DELETE FROM transactions WHERE doc_id = $1`, [f.docId]),
    ...transactions.map(cleanParsedAsset).map((t) =>
      tx.query(
        `INSERT INTO transactions
           (doc_id, member_name, state_district, asset_name, ticker, asset_type_code, owner, transaction_type, transaction_date, notification_date, amount_range, amount_low, amount_high)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12)`,
        [
          f.docId,
          f.filerName,
          f.stateDistrict,
          t.assetName,
          t.ticker,
          t.assetTypeCode,
          t.owner,
          t.transactionType,
          t.transactionDate,
          t.amountRange,
          t.amountLow,
          t.amountHigh,
        ]
      )
    ),
  ]);
  await applyCorrections(f.docId);
}
