import "../loadEnv.js";
import { sql, ensureSchema } from "../db/index.js";
import { launchSenateBrowser } from "./senate/browser.js";
import { acceptAgreementAndOpenSearch, searchPeriodicTransactionReports } from "./senate/search.js";
import { parseSenateReportPage } from "./senate/parseReport.js";
import { getPaperFilingImageUrls, ocrPaperFiling } from "./senate/ocrPaperReport.js";
import { SENATE_EFD } from "../config.js";
import { senateMemberKey } from "./normalizeLastName.js";
import { recordUnreadSenateFiling, saveSenateFiling } from "./senate/saveFiling.js";

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const startArg = args.find((a) => a.startsWith("--start="))?.split("=")[1]; // MM/DD/YYYY
const forceArg = args.includes("--force");

const limit = limitArg ? Number(limitArg) : Infinity;
// This script runs every 4 hours (see .github/workflows/ingest.yml) and,
// unlike the House side, the search itself — not just the per-filing OCR —
// is the expensive part (a live Playwright session against efdsearch.senate.gov).
// Defaulting to Jan 1 re-ran that full-year search every single run even
// though a new filing is, by construction, always within the last few days
// of "now". Default to a rolling 1-week lookback instead; pass an explicit
// `--start=01/01/YYYY` for a one-off wider sweep (e.g. after an OCR fix).
function defaultStartDate(): string {
  const d = new Date(Date.now() - 7 * 86400000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}
const startDate = startArg ?? defaultStartDate();

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
    const reportUrl = result.isElectronic
      ? SENATE_EFD.reportUrl(result.reportId)
      : new URL(result.reportUrl, SENATE_EFD.searchUrl).toString();
    const filing = {
      docId: result.reportId,
      filerName: result.filerName,
      stateDistrict: senateMemberKey(result.lastName),
      filingDate,
      year,
      reportUrl,
    };

    if (!result.isElectronic) {
      try {
        const reportPage = await context.newPage();
        const imageUrls = await getPaperFilingImageUrls(reportPage, reportUrl);
        await reportPage.close();
        const transactions = await ocrPaperFiling(imageUrls);

        if (transactions === null) {
          unsupported++;
          console.log(`  [${i + 1}/${toProcess.length}] SKIP (unreadable paper filing) ${result.filerName} — ${result.dateReceived}`);
          await recordUnreadSenateFiling(filing, "unsupported");
          continue;
        }

        await saveSenateFiling(filing, transactions.length > 0 ? "ocr" : "empty", transactions);
        totalTransactions += transactions.length;
        ocrCount++;
        console.log(
          `  [${i + 1}/${toProcess.length}] ${result.filerName} (${result.reportId}): ${transactions.length} transactions [OCR]`
        );
      } catch (err) {
        failed++;
        console.error(`  [${i + 1}/${toProcess.length}] FAILED (OCR) ${result.filerName}:`, (err as Error).message);
        await recordUnreadSenateFiling(filing, "failed");
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
        await recordUnreadSenateFiling(filing, "unsupported");
        continue;
      }

      await saveSenateFiling(filing, transactions.length > 0 ? "ok" : "empty", transactions);
      totalTransactions += transactions.length;
      console.log(`  [${i + 1}/${toProcess.length}] ${result.filerName} (${result.reportId}): ${transactions.length} transactions`);
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${toProcess.length}] FAILED ${result.filerName}:`, (err as Error).message);
      await recordUnreadSenateFiling(filing, "failed");
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
