import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { fetchYearIndex } from "./fetchIndex.js";
import { getPtrPdfText } from "./pdfText.js";
import { parsePtrText } from "./parsePtr.js";
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

  const ingestedRows = (await sql.query(`SELECT doc_id FROM filings WHERE parse_status != 'pending'`)) as {
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

  for (let i = 0; i < capped.length; i++) {
    const filing = capped[i];
    const pdfUrl = HOUSE_CLERK.ptrPdfUrl(filing.year, filing.docId);

    try {
      const text = await getPtrPdfText(filing.year, filing.docId);
      const { transactions, issues } = parsePtrText(text, filing.docId);

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
              transactions.length > 0 ? "ok" : "empty",
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
          ...issues.map((issue) =>
            tx.query(`INSERT INTO parse_issues (doc_id, raw_text, reason) VALUES ($1, $2, $3)`, [
              filing.docId,
              issue,
              "asset-name-not-found",
            ])
          ),
        ];
        return queries;
      });

      totalTransactions += transactions.length;
      console.log(`  [${i + 1}/${capped.length}] ${filing.memberName} (${filing.docId}): ${transactions.length} transactions`);
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

  console.log(`\nDone. Processed ${capped.length} filings, ${totalTransactions} transactions extracted, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
