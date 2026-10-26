import "../loadEnv.js";
import { chromium } from "playwright";
import { senateReportPath } from "@congtrade/shared/senateReport";
import { sql, ensureSchema } from "../db/index.js";
import { senateMemberKey } from "./normalizeLastName.js";
import { parseSenateReportPage } from "./senate/parseReport.js";
import { readSenateReportHeader } from "./senate/reportHeader.js";
import { senateDocId } from "./senate/reportId.js";
import { recordUnreadSenateFiling, saveSenateFiling, type SenateFilingRecord } from "./senate/saveFiling.js";

/**
 * Reads the Senate report pages uploaded in /admin/senate (senate_uploads)
 * into filings and transactions, exactly as the automated search used to.
 *
 * eFD's bot protection has turned the automated search away since 23 Oct
 * 2026, so the admin opens the new reports in an ordinary browser and saves
 * them; this reads those saved pages. It never contacts eFD: each page is
 * loaded into a browser with JavaScript off and every network request
 * refused, purely to reuse the report parser.
 *
 * What it reads goes to the approval queue in /admin like any other filing.
 * A paper (scanned) report is recorded as unreadable for the review queue:
 * reading one needs its images, which only eFD serves.
 *
 *   npm run import-senate-uploads --workspace ingest
 */

const KEEP_DAYS = 90;

interface Upload {
  id: string;
  file_name: string | null;
  report_url: string;
  html: string;
}

async function finish(id: string, status: "done" | "failed", note: string, docId: string | null = null) {
  await sql.query(
    `UPDATE senate_uploads SET status = $2, note = $3, doc_id = $4, processed_at = NOW() WHERE id = $1::bigint`,
    [id, status, note, docId]
  );
}

async function main() {
  await ensureSchema();
  await sql.query(`DELETE FROM senate_uploads WHERE created_at < NOW() - INTERVAL '${KEEP_DAYS} days'`);

  const uploads = (await sql.query(
    `SELECT id::text, file_name, report_url, html FROM senate_uploads WHERE status = 'pending' ORDER BY created_at, id`
  )) as Upload[];
  if (!uploads.length) {
    console.log("No Senate uploads waiting.");
    return;
  }
  console.log(`Reading ${uploads.length} uploaded Senate report(s)...`);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ javaScriptEnabled: false });
  // The saved pages still point at eFD's scripts, styles and images; none of
  // them is fetched.
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();

  let read = 0;
  let failed = 0;
  for (const upload of uploads) {
    const label = upload.file_name ?? `upload #${upload.id}`;
    try {
      const ref = senateReportPath(upload.report_url);
      if (!ref) {
        failed++;
        await finish(upload.id, "failed", "Not an eFD report address.");
        continue;
      }
      const docId = senateDocId(ref);

      const existing = (await sql.query(`SELECT parse_status FROM filings WHERE doc_id = $1`, [docId])) as {
        parse_status: string;
      }[];
      const status = existing[0]?.parse_status;
      if (status && !["pending", "unsupported", "failed"].includes(status)) {
        await finish(upload.id, "done", `Already in CongTrade (${status}), left as it is.`, docId);
        console.log(`  ${label}: already in (${status})`);
        continue;
      }

      await page.setContent(upload.html, { waitUntil: "domcontentloaded" });
      const header = await readSenateReportHeader(page);
      if (!header) {
        failed++;
        await finish(
          upload.id,
          "failed",
          "Couldn't find the senator's name and filing date. Save the report page itself, not the search results."
        );
        console.log(`  ${label}: no name or filing date found`);
        continue;
      }
      const filing: SenateFilingRecord = {
        docId,
        filerName: header.filerName,
        stateDistrict: senateMemberKey(header.lastName),
        filingDate: header.filingDate,
        year: Number(header.filingDate.slice(0, 4)),
        reportUrl: ref.url,
      };

      if (ref.kind === "paper") {
        await recordUnreadSenateFiling(filing, "unsupported");
        await finish(upload.id, "done", "Paper filing: not read automatically; it is in the review queue.", docId);
        console.log(`  ${label}: ${header.filerName}, paper filing, sent to review`);
        read++;
        continue;
      }

      const transactions = await parseSenateReportPage(page);
      if (transactions === null) {
        await recordUnreadSenateFiling(filing, "unsupported");
        await finish(upload.id, "done", "No transactions table in the page; it is in the review queue.", docId);
        console.log(`  ${label}: ${header.filerName}, no transactions table`);
        read++;
        continue;
      }
      await saveSenateFiling(filing, transactions.length > 0 ? "ok" : "empty", transactions);
      await finish(
        upload.id,
        "done",
        `${header.filerName}, filed ${header.filingDate}: ${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}, waiting for approval.`,
        docId
      );
      console.log(`  ${label}: ${header.filerName}, ${transactions.length} transactions`);
      read++;
    } catch (err) {
      failed++;
      console.error(`  ${label}: FAILED ${(err as Error).message}`);
      await finish(upload.id, "failed", `Could not be read: ${(err as Error).message.slice(0, 200)}`).catch(() => {});
    }
  }

  await browser.close();
  console.log(`\nDone. ${read} read, ${failed} failed.`);
  if (failed && !read) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
