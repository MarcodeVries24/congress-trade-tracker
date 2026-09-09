import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { launchSenateBrowser } from "./senate/browser.js";
import { acceptAgreementAndOpenSearch, searchPeriodicTransactionReports } from "./senate/search.js";
import { parseSenateReportPage } from "./senate/parseReport.js";
import { getPaperFilingImageUrls, ocrPaperFiling } from "./senate/ocrPaperReport.js";
import { SENATE_EFD } from "../config.js";
import { senateMemberKey } from "./normalizeLastName.js";

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const startArg = args.find((a) => a.startsWith("--start="))?.split("=")[1]; // MM/DD/YYYY
const forceArg = args.includes("--force");

const limit = limitArg ? Number(limitArg) : Infinity;
const startDate = startArg ?? `01/01/${new Date().getFullYear()}`;

function toIsoDateSlash(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

async function main() {
  await ensureSchema();

  const { browser, context } = await launchSenateBrowser();
  const page = await context.newPage();

  console.log("Opening eFD search and accepting agreement...");
  await acceptAgreementAndOpenSearch(page);

  console.log(`Searching Periodic Transaction Reports filed since ${startDate}...`);
  const results = await searchPeriodicTransactionReports(page, startDate);
  console.log(`Found ${results.length} PTR filings.`);

  // 'unsupported' filings are retried every run too — OCR coverage of paper
  // filings improves over time, and unlike 'ok'/'empty' there's no successful
  // parse to preserve, so re-attempting is cheap and can only improve things.
  const ingestedRows = (await sql.query(
    `SELECT doc_id FROM filings WHERE chamber = 'senate' AND parse_status NOT IN ('pending', 'unsupported')`
  )) as { doc_id: string }[];
  const alreadyIngested = new Set(ingestedRows.map((r) => r.doc_id));

  const notYetIngested = forceArg ? results : results.filter((r) => !alreadyIngested.has(r.reportId));
  const toProcess = notYetIngested.slice(0, limit);
  if (toProcess.length < notYetIngested.length) {
    console.log(`Limiting to first ${toProcess.length} of ${notYetIngested.length} not-yet-ingested filings.`);
  } else {
    console.log(`${toProcess.length} filings to ingest (${results.length - toProcess.length} already up to date).`);
  }

  let totalTransactions = 0;
  let failed = 0;
  let unsupported = 0;
  let ocrCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const result = toProcess[i];
    const filingDate = toIsoDateSlash(result.dateReceived) ?? result.dateReceived;
    const year = Number(filingDate.slice(0, 4)) || new Date().getFullYear();
    const stateDistrict = senateMemberKey(result.lastName);
    const reportUrl = result.isElectronic
      ? SENATE_EFD.reportUrl(result.reportId)
      : new URL(result.reportUrl, SENATE_EFD.searchUrl).toString();

    if (!result.isElectronic) {
      try {
        const reportPage = await context.newPage();
        const imageUrls = await getPaperFilingImageUrls(reportPage, reportUrl);
        await reportPage.close();
        const transactions = await ocrPaperFiling(imageUrls);

        if (transactions === null) {
          unsupported++;
          console.log(`  [${i + 1}/${toProcess.length}] SKIP (unreadable paper filing) ${result.filerName} — ${result.dateReceived}`);
          await sql.query(
            `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
             VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, 'unsupported', 0)
             ON CONFLICT (doc_id) DO UPDATE SET parse_status = 'unsupported', pdf_url = EXCLUDED.pdf_url, ingested_at = NOW()`,
            [result.reportId, result.filerName, stateDistrict, filingDate, year, reportUrl]
          );
          continue;
        }

        await sql.transaction((tx) => {
          const queries = [
            tx.query(
              `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
               VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, $7, $8)
               ON CONFLICT (doc_id) DO UPDATE SET
                 parse_status = EXCLUDED.parse_status,
                 transaction_count = EXCLUDED.transaction_count,
                 pdf_url = EXCLUDED.pdf_url,
                 ingested_at = NOW()`,
              [
                result.reportId,
                result.filerName,
                stateDistrict,
                filingDate,
                year,
                reportUrl,
                transactions.length > 0 ? "ocr" : "empty",
                transactions.length,
              ]
            ),
            tx.query(`DELETE FROM transactions WHERE doc_id = $1`, [result.reportId]),
            ...transactions.map((t) =>
              tx.query(
                `INSERT INTO transactions
                   (doc_id, member_name, state_district, asset_name, ticker, asset_type_code, owner, transaction_type, transaction_date, notification_date, amount_range, amount_low, amount_high)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12)`,
                [
                  result.reportId,
                  result.filerName,
                  stateDistrict,
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
          ];
          return queries;
        });

        totalTransactions += transactions.length;
        ocrCount++;
        console.log(
          `  [${i + 1}/${toProcess.length}] ${result.filerName} (${result.reportId}): ${transactions.length} transactions [OCR]`
        );
      } catch (err) {
        failed++;
        console.error(`  [${i + 1}/${toProcess.length}] FAILED (OCR) ${result.filerName}:`, (err as Error).message);
        await sql.query(
          `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
           VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, 'failed', 0)
           ON CONFLICT (doc_id) DO UPDATE SET parse_status = 'failed', pdf_url = EXCLUDED.pdf_url, ingested_at = NOW()`,
          [result.reportId, result.filerName, stateDistrict, filingDate, year, reportUrl]
        );
      }
      continue;
    }

    try {
      const reportPage = await context.newPage();
      await reportPage.goto(reportUrl, { waitUntil: "domcontentloaded" });
      const transactions = await parseSenateReportPage(reportPage);
      await reportPage.close();

      if (transactions === null) {
        unsupported++;
        console.log(`  [${i + 1}/${toProcess.length}] SKIP (no transactions table found) ${result.filerName}`);
        await sql.query(
          `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
           VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, 'unsupported', 0)
           ON CONFLICT (doc_id) DO UPDATE SET parse_status = 'unsupported', pdf_url = EXCLUDED.pdf_url, ingested_at = NOW()`,
          [result.reportId, result.filerName, stateDistrict, filingDate, year, reportUrl]
        );
        continue;
      }

      await sql.transaction((tx) => {
        const queries = [
          tx.query(
            `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
             VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, $7, $8)
             ON CONFLICT (doc_id) DO UPDATE SET
               parse_status = EXCLUDED.parse_status,
               transaction_count = EXCLUDED.transaction_count,
               pdf_url = EXCLUDED.pdf_url,
               ingested_at = NOW()`,
            [
              result.reportId,
              result.filerName,
              stateDistrict,
              filingDate,
              year,
              reportUrl,
              transactions.length > 0 ? "ok" : "empty",
              transactions.length,
            ]
          ),
          tx.query(`DELETE FROM transactions WHERE doc_id = $1`, [result.reportId]),
          ...transactions.map((t) =>
            tx.query(
              `INSERT INTO transactions
                 (doc_id, member_name, state_district, asset_name, ticker, asset_type_code, owner, transaction_type, transaction_date, notification_date, amount_range, amount_low, amount_high)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12)`,
              [
                result.reportId,
                result.filerName,
                stateDistrict,
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
        ];
        return queries;
      });

      totalTransactions += transactions.length;
      console.log(`  [${i + 1}/${toProcess.length}] ${result.filerName} (${result.reportId}): ${transactions.length} transactions`);
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${toProcess.length}] FAILED ${result.filerName}:`, (err as Error).message);
      await sql.query(
        `INSERT INTO filings (doc_id, chamber, member_name, state_district, filing_type, filing_date, year, pdf_url, parse_status, transaction_count)
         VALUES ($1, 'senate', $2, $3, 'P', $4, $5, $6, 'failed', 0)
         ON CONFLICT (doc_id) DO UPDATE SET parse_status = 'failed', pdf_url = EXCLUDED.pdf_url, ingested_at = NOW()`,
        [result.reportId, result.filerName, stateDistrict, filingDate, year, reportUrl]
      );
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  await browser.close();

  console.log(
    `\nDone. Processed ${toProcess.length} filings, ${totalTransactions} transactions extracted (${ocrCount} filings via OCR), ${unsupported} unsupported, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
