import "../loadEnv.js";
import { sql } from "../db/index.js";
import { sendEmail } from "../lib/email.js";
import { getReviewQueue, reviewSectionHtml, reviewTextLines } from "./reviewQueue.js";

/**
 * Daily digest of yesterday's *actually newly-filed* PTRs, sent once a day
 * (see .github/workflows/daily-report.yml) rather than after every
 * 4-hourly ingest run — this rolls all six of that day's runs up into one
 * email. Every filing in the window lands in one of three buckets:
 *  - Published: a native text parse succeeded ('ok'), or a human has already
 *    verified it ('manual'). These are live on the site.
 *  - Needs pixel-by-pixel review: a scanned document with no usable text
 *    layer ('ocr' — OCR produced a draft; 'empty'/'unsupported' — it produced
 *    nothing). NOT published. OCR is not trustworthy enough to publish
 *    unreviewed: across Blumenthal's 33 scanned filings it read 623 rows
 *    where the forms actually held 1008, and got many amounts wrong. So the
 *    report names each one and waits for a human.
 *  - Errors: 'failed' — a download/parse error, i.e. something to fix in the
 *    code rather than a document to transcribe.
 *
 * The review section shows yesterday's arrivals *and* the total outstanding
 * backlog, so a filing that isn't dealt with on day one doesn't silently drop
 * out of the report the next morning.
 *
 * Scoped by filing_date (the real-world date the member filed), not by
 * when our own pipeline happened to touch the row (ingested_at) — every
 * ingest run re-checks each chamber's *entire* current-year index, so an
 * ingested_at-based window doesn't distinguish "filed yesterday" from "an
 * old filing our code just got better at reading today" (e.g. a filing
 * from March that a House OCR improvement recovers this week — a real,
 * valuable event, but not a *new filing*, and not what this report is
 * for). filing_date has day-only precision, so "yesterday" is the closest
 * a rolling 24h window can get to exact — this job runs at 01:00 UTC,
 * after the 00:17 UTC ingest run, so by the time it runs, all six of
 * yesterday's ingest runs have already had their chance to see anything
 * filed yesterday.
 */

const REPORT_TO: string = (() => {
  const value = process.env.REPORT_EMAIL;
  if (!value) throw new Error("REPORT_EMAIL is not set — the address this daily report goes to. Set it in ingest/.env (or as a GitHub Actions secret).");
  return value;
})();

interface FilingRow {
  doc_id: string;
  chamber: "house" | "senate";
  member_name: string;
  state_district: string | null;
  parse_status: string;
  transaction_count: number;
  pdf_url: string;
  filing_date: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function yesterdayIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function renderRows(rows: FilingRow[]): string {
  return rows
    .map(
      (r) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${escapeHtml(r.member_name.replace(/^Hon\.\s+/, ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${r.chamber === "house" ? "House" : "Senate"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${r.transaction_count}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;"><a href="${r.pdf_url}" style="color:#0070f3;">source</a></td>
      </tr>`
    )
    .join("");
}

async function main() {
  const rows = (await sql.query(
    `SELECT doc_id, chamber, member_name, state_district, parse_status, transaction_count, pdf_url, filing_date
     FROM filings
     WHERE NULLIF(filing_date, '')::date = CURRENT_DATE - 1
     ORDER BY transaction_count DESC, filing_date DESC`
  )) as FilingRow[];

  const successful = rows.filter((r) => r.parse_status === "ok" || r.parse_status === "manual");
  const undefinedRows = rows.filter((r) => r.parse_status === "failed");

  // Scanned filings held back from the site until verified by hand. Both
  // yesterday's and the whole outstanding backlog — see the note above.
  const needsReviewToday = await getReviewQueue(yesterdayIso());
  const backlog = await getReviewQueue();

  const totalNewTransactions = successful.reduce((sum, r) => sum + r.transaction_count, 0);
  const houseCount = rows.filter((r) => r.chamber === "house").length;
  const senateCount = rows.filter((r) => r.chamber === "senate").length;

  const reportDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const MAX_ROWS = 150;

  const reviewFlag = backlog.length > 0 ? ` — ${backlog.length} awaiting review` : "";
  const subject =
    rows.length === 0 && backlog.length === 0
      ? `CongTrade daily report — no new filings (${reportDate})`
      : `CongTrade daily report — ${successful.length} published${reviewFlag} (${reportDate})`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
      <h2 style="margin-bottom:4px;">CongTrade — daily ingest report</h2>
      <p style="color:#666;margin-top:0;">New PTR filings filed on ${reportDate}.</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:10px;background:#f5f5f5;border-radius:6px 0 0 6px;"><strong style="font-size:20px;">${rows.length}</strong><br/><span style="color:#666;font-size:12px;">New filings</span></td>
          <td style="padding:10px;background:#eafaf0;"><strong style="font-size:20px;color:#0a7d3c;">${successful.length}</strong><br/><span style="color:#666;font-size:12px;">Published</span></td>
          <td style="padding:10px;background:#fff4e5;"><strong style="font-size:20px;color:#a35c00;">${backlog.length}</strong><br/><span style="color:#666;font-size:12px;">Awaiting review</span></td>
          <td style="padding:10px;background:#fbeaea;"><strong style="font-size:20px;color:#a12b2b;">${undefinedRows.length}</strong><br/><span style="color:#666;font-size:12px;">Errors</span></td>
          <td style="padding:10px;background:#f5f5f5;border-radius:0 6px 6px 0;"><strong style="font-size:20px;">${totalNewTransactions.toLocaleString()}</strong><br/><span style="color:#666;font-size:12px;">New transactions</span></td>
        </tr>
      </table>
      <p style="color:#666;font-size:13px;">House: ${houseCount} · Senate: ${senateCount}</p>

      ${
        rows.length === 0
          ? `<p>No new filings were filed on ${reportDate}.</p>`
          : `
      <h3 style="margin-bottom:4px;color:#0a7d3c;">Published (${successful.length})</h3>
      <p style="color:#666;font-size:13px;margin-top:0;">Native text parse succeeded, or already hand-verified. Live on the site.</p>
      ${
        successful.length === 0
          ? `<p style="color:#666;">None.</p>`
          : `<table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase;">
          <th style="padding:6px 10px;">Member</th><th style="padding:6px 10px;">Chamber</th><th style="padding:6px 10px;">Transactions</th><th style="padding:6px 10px;">Filing</th>
        </tr>
        ${renderRows(successful.slice(0, MAX_ROWS))}
      </table>${successful.length > MAX_ROWS ? `<p style="color:#666;font-size:13px;">and ${successful.length - MAX_ROWS} more.</p>` : ""}`
      }

      <h3 style="margin-bottom:4px;margin-top:24px;color:#a12b2b;">Errors (${undefinedRows.length})</h3>
      <p style="color:#666;font-size:13px;margin-top:0;">Download or parse failed outright — a pipeline bug to fix, not a document to transcribe.</p>
      ${
        undefinedRows.length === 0
          ? `<p style="color:#666;">None.</p>`
          : `<table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase;">
          <th style="padding:6px 10px;">Member</th><th style="padding:6px 10px;">Chamber</th><th style="padding:6px 10px;">Transactions</th><th style="padding:6px 10px;">Filing</th>
        </tr>
        ${renderRows(undefinedRows.slice(0, MAX_ROWS))}
      </table>${undefinedRows.length > MAX_ROWS ? `<p style="color:#666;font-size:13px;">and ${undefinedRows.length - MAX_ROWS} more.</p>` : ""}`
      }
      `
      }

      ${reviewSectionHtml(backlog, needsReviewToday, reportDate, MAX_ROWS)}

      <p style="margin-top:24px;"><a href="https://congress-trade-tracker-rose.vercel.app" style="color:#0070f3;">View CongTrade</a></p>
    </div>
  `;

  const text = `CongTrade daily ingest report — ${reportDate}

New filings: ${rows.length} (House: ${houseCount}, Senate: ${senateCount})
Published: ${successful.length}
Errors: ${undefinedRows.length}
New transactions: ${totalNewTransactions}

NEEDS PIXEL-BY-PIXEL REVIEW: ${backlog.length}${needsReviewToday.length ? ` (${needsReviewToday.length} new ${reportDate})` : ""}
These are NOT on the site until reviewed.
${reviewTextLines(backlog, MAX_ROWS)}

Publish a reviewed filing with:  npm run review:approve -- <docId>
`;

  await sendEmail({ to: REPORT_TO, subject, html, text });
  console.log(`Sent daily report to ${REPORT_TO}: ${rows.length} new filings (${successful.length} successful, ${undefinedRows.length} undefined).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
