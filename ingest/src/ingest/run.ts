import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { fetchYearIndex } from "./fetchIndex.js";
import { getPtrPdfBuffer, getPdfText } from "./pdfText.js";
import { parsePtrText } from "./parsePtr.js";
import { ocrHousePtr } from "./ocrHousePtr.js";
import { HOUSE_CLERK } from "../config.js";

const args = process.argv.slice(2);
const yearArg = args.find((a) => a.startsWith("--year="))?.split("=")[1];
const forceArg = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];

const year = yearArg ? Number(yearArg) : new Date().getFullYear();
const limit = limitArg ? Number(limitArg) : Infinity;

async function main() {
  await ensureSchema();

  console.log(`Fetching House financial disclosure index for ${year}...`);
  const index = await fetchYearIndex(year);
  const ptrFilings = index.filter((f) => f.filingType === "P");
  console.log(`Found ${ptrFilings.length} Periodic Transaction Report filings for ${year}.`);

  // 'empty' filings are retried every run too — the text-extraction parser
  // improves over time (e.g. the modern e-filing PDF's checkbox-glyph fix
  // recovered ~150 previously-empty filings), and there's no successful
  // parse to lose by re-attempting, so it's cheap and can only help.
  const ingestedRows = (await sql.query(`SELECT doc_id FROM filings WHERE parse_status NOT IN ('pending', 'empty')`)) as {
    doc_id: string;
  }[];
  const alreadyIngested = new Set(ingestedRows.map((r) => r.doc_id));

  const toProcess = forceArg ? ptrFilings : ptrFilings.filter((f) => !alreadyIngested.has(f.docId));
  const capped = toProcess.slice(0, limit);
  if (capped.length < toProcess.length) {
    console.log(`Limiting to first ${capped.length} of ${toProcess.length} not-yet-ingested filings.`);
  } else {
    console.log(`${capped.length} filings to ingest (${ptrFilings.length - capped.length} already up to date).`);
  }

  let totalTransactions = 0;
  let failed = 0;
  let ocrCount = 0;

  for (let i = 0; i < capped.length; i++) {
    const filing = capped[i];
    const pdfUrl = HOUSE_CLERK.ptrPdfUrl(filing.year, filing.docId);

    try {
      const buffer = await getPtrPdfBuffer(filing.year, filing.docId);
      const text = await getPdfText(buffer);
      let { transactions, issues } = parsePtrText(text, filing.docId);
      let parseStatus = transactions.length > 0 ? "ok" : "empty";
      const issueRows: { rawText: string; reason: string }[] = issues.map((issue) => ({
        rawText: issue,
        reason: "asset-name-not-found",
      }));

      // No extractable text at all (a scanned paper filing) — fall back to
      // OCR, the same last resort already used for Senate's paper filings.
      // Meaningfully less certain than text-native extraction (see
      // ocrHousePtr.ts), so results land under a distinct 'ocr' status and
      // every field OCR couldn't confidently resolve is logged rather than
      // guessed at.
      if (transactions.length === 0) {
        const ocrResult = await ocrHousePtr(buffer);
        if (ocrResult) {
          for (const issue of ocrResult.issues) {
            issueRows.push({
              rawText: `[p${issue.page} row ${issue.row}]${issue.context ? ` ${issue.context}` : ""}: ${issue.reason}`,
              reason: `ocr-${issue.field}`,
            });
          }
          if (ocrResult.transactions.length > 0) {
            transactions = ocrResult.transactions;
            parseStatus = "ocr";
            ocrCount++;
          }
        }
      }

      await sql.transaction((tx) => {
        const queries = [
          tx.query(
            `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
             VALUES ($1, 'house', $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (doc_id) DO UPDATE SET
               parse_status = EXCLUDED.parse_status,
               transaction_count = EXCLUDED.transaction_count,
               ingested_at = NOW()`,
            [
              filing.docId,
              filing.memberName,
              filing.stateDistrict,
              filing.filingType,
              filing.filingDate,
              filing.year,
              pdfUrl,
              parseStatus,
              transactions.length,
            ]
          ),
          tx.query(`DELETE FROM transactions WHERE doc_id = $1`, [filing.docId]),
          tx.query(`DELETE FROM parse_issues WHERE doc_id = $1`, [filing.docId]),
          ...transactions.map((t) =>
            tx.query(
              `INSERT INTO transactions
                 (doc_id, member_name, state_district, asset_name, ticker, asset_type_code, owner, transaction_type, transaction_date, notification_date, amount_range, amount_low, amount_high)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                filing.docId,
                filing.memberName,
                filing.stateDistrict,
                t.assetName,
                t.ticker,
                t.assetTypeCode,
                t.owner,
                t.transactionType,
                t.transactionDate,
                t.notificationDate,
                t.amountRange,
                t.amountLow,
                t.amountHigh,
              ]
            )
          ),
          ...issueRows.map((issue) =>
            tx.query(`INSERT INTO parse_issues (doc_id, raw_text, reason) VALUES ($1, $2, $3)`, [
              filing.docId,
              issue.rawText,
              issue.reason,
            ])
          ),
        ];
        return queries;
      });

      totalTransactions += transactions.length;
      console.log(
        `  [${i + 1}/${capped.length}] ${filing.memberName} (${filing.docId}): ${transactions.length} transactions${parseStatus === "ocr" ? " [OCR]" : ""}`
      );
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${capped.length}] FAILED ${filing.docId} (${filing.memberName}):`, (err as Error).message);
      await sql.query(
        `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
         VALUES ($1, 'house', $2, $3, $4, $5, $6, $7, 'failed', 0)
         ON CONFLICT (doc_id) DO UPDATE SET parse_status = 'failed', ingested_at = NOW()`,
        [filing.docId, filing.memberName, filing.stateDistrict, filing.filingType, filing.filingDate, filing.year, pdfUrl]
      );
    }

    // be polite to the Clerk's server
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `\nDone. Processed ${capped.length} filings, ${totalTransactions} transactions extracted (${ocrCount} filings via OCR), ${failed} failed.`
  );

  // Runs unconditionally, including on a "nothing new" run — this is the
  // signal that the scheduled job is alive, separate from filings.ingested_at
  // which only moves when a filing actually changes.
  await sql.query(
    `INSERT INTO ingest_runs (id, checked_at, filings_found, filings_processed, transactions_extracted, failed)
     VALUES (TRUE, NOW(), $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       checked_at = EXCLUDED.checked_at,
       filings_found = EXCLUDED.filings_found,
       filings_processed = EXCLUDED.filings_processed,
       transactions_extracted = EXCLUDED.transactions_extracted,
       failed = EXCLUDED.failed`,
    [ptrFilings.length, capped.length, totalTransactions, failed]
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
