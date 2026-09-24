import "../loadEnv.js";
import { ensureSchema, sql } from "../db/index.js";
import { sendEmail } from "../lib/email.js";
import { getReviewQueue, reviewSectionHtml, reviewTextLines } from "./reviewQueue.js";
import { countEntitlementErrors } from "../alerts/entitlements.js";
import { SITE_URL } from "../lib/siteUrl.js";

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

function reportRecipient(): string {
  const value = process.env.REPORT_EMAIL;
  if (!value) throw new Error("REPORT_EMAIL is not set — the address this daily report goes to. Set it in ingest/.env (or as a GitHub Actions secret).");
  return value;
}

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

/**
 * How far back this report reaches: everything ingested since the last one
 * was successfully sent.
 *
 * Falls back to 24 hours on the very first run. Read before sending; only
 * advanced afterwards (see markReportSent), so a failed send re-reports
 * instead of skipping a day's filings forever.
 */
async function reportSince(): Promise<Date> {
  const rows = (await sql.query(`SELECT last_report_at FROM report_runs WHERE id = TRUE`)) as { last_report_at: Date }[];
  return rows[0]?.last_report_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
}

async function markReportSent(): Promise<void> {
  await sql.query(
    `INSERT INTO report_runs (id, last_report_at) VALUES (TRUE, NOW())
     ON CONFLICT (id) DO UPDATE SET last_report_at = NOW()`
  );
}

/**
 * Filings older than this are treated as re-processing, not news. Without it a
 * parser improvement that re-reads the archive (1,400 filings in a day, in
 * Sept 2026) would land in the report as "new". Counted separately rather than
 * dropped, so a big backfill is still visible.
 */
const NEWS_WINDOW_DAYS = 60;

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
  // `--dry-run` renders the report and prints what it would cover without
  // sending, and without moving the watermark. Same affordance as
  // `alerts:send --dry-run`, and the only safe way to check a scoping change
  // against live data.
  const dryRun = process.argv.slice(2).includes("--dry-run");

  await ensureSchema();
  const since = await reportSince();

  // Scoped by when we *learned* of a filing, not by its filing_date. See
  // report_runs in db/schema.ts for why the filing_date version missed
  // nearly everything.
  const rows = (await sql.query(
    `SELECT doc_id, chamber, member_name, state_district, parse_status, transaction_count, pdf_url, filing_date
     FROM filings
     WHERE ingested_at > $1
       AND NULLIF(filing_date, '')::date >= CURRENT_DATE - ${NEWS_WINDOW_DAYS}
     ORDER BY transaction_count DESC, filing_date DESC`,
    [since]
  )) as FilingRow[];

  // Older documents the pipeline re-read in the same window — a re-ingest or a
  // parse improvement, not a new disclosure.
  const [{ count: reprocessedOlder }] = (await sql.query(
    `SELECT COUNT(*)::int AS count FROM filings
     WHERE ingested_at > $1 AND NULLIF(filing_date, '')::date < CURRENT_DATE - ${NEWS_WINDOW_DAYS}`,
    [since]
  )) as { count: number }[];

  const successful = rows.filter((r) => r.parse_status === "ok" || r.parse_status === "manual");
  const undefinedRows = rows.filter((r) => r.parse_status === "failed");

  // Scanned filings held back from the site until verified by hand. Both
  // yesterday's and the whole outstanding backlog — see the note above.
  const needsReviewToday = await getReviewQueue(since);
  const backlog = await getReviewQueue();

  // Alert sending fails *open* when Clerk can't be reached — a paying
  // subscriber must never be cut off by our own outage — which means a broken
  // entitlement check is otherwise completely silent. This is where it stops
  // being silent.
  const entitlementErrors = await countEntitlementErrors();

  const totalNewTransactions = successful.reduce((sum, r) => sum + r.transaction_count, 0);
  const houseCount = rows.filter((r) => r.chamber === "house").length;
  const senateCount = rows.filter((r) => r.chamber === "senate").length;

  // The window this report covers, in words. Not "yesterday" — the watermark
  // stretches to whenever the last report actually went out, which drifts.
  const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const reportDate = `${fmt(since)} – ${fmt(new Date())} UTC`;
  const MAX_ROWS = 150;

  const reviewFlag = backlog.length > 0 ? ` — ${backlog.length} awaiting review` : "";
  const subject =
    rows.length === 0 && backlog.length === 0
      ? `CongTrade daily report — nothing new (${reportDate})`
      : `CongTrade daily report — ${successful.length} published${reviewFlag} (${reportDate})`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
      <h2 style="margin-bottom:4px;">CongTrade — daily ingest report</h2>
      <p style="color:#666;margin-top:0;">PTR filings newly published since the last report — ${reportDate}.</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:10px;background:#f5f5f5;border-radius:6px 0 0 6px;"><strong style="font-size:20px;">${rows.length}</strong><br/><span style="color:#666;font-size:12px;">New filings</span></td>
          <td style="padding:10px;background:#eafaf0;"><strong style="font-size:20px;color:#0a7d3c;">${successful.length}</strong><br/><span style="color:#666;font-size:12px;">Published</span></td>
          <td style="padding:10px;background:#fff4e5;"><strong style="font-size:20px;color:#a35c00;">${backlog.length}</strong><br/><span style="color:#666;font-size:12px;">Awaiting review</span></td>
          <td style="padding:10px;background:#fbeaea;"><strong style="font-size:20px;color:#a12b2b;">${undefinedRows.length}</strong><br/><span style="color:#666;font-size:12px;">Errors</span></td>
          <td style="padding:10px;background:#f5f5f5;border-radius:0 6px 6px 0;"><strong style="font-size:20px;">${totalNewTransactions.toLocaleString()}</strong><br/><span style="color:#666;font-size:12px;">New transactions</span></td>
        </tr>
      </table>
      <p style="color:#666;font-size:13px;">House: ${houseCount} · Senate: ${senateCount}${
        reprocessedOlder > 0
          ? ` · plus ${reprocessedOlder} older filing${reprocessedOlder === 1 ? "" : "s"} re-processed (not listed — older than ${NEWS_WINDOW_DAYS} days)`
          : ""
      }</p>

      ${
        rows.length === 0
          ? `<p>No new filings appeared in this window.</p>`
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

      ${
        entitlementErrors > 0
          ? `<h3 style="margin-bottom:4px;margin-top:28px;color:#a12b2b;">Subscription checks failing (${entitlementErrors})</h3>
             <p style="color:#666;font-size:13px;margin-top:0;">
               The alert sender couldn't confirm CongTrade Pro for ${entitlementErrors} account(s) in the last two days,
               so it kept sending to them rather than risk cutting off a paying subscriber. Check
               <code>CLERK_SECRET_KEY</code> and Clerk's Backend API — <code>last_error</code> in the
               <code>user_entitlements</code> table has the detail.
             </p>`
          : ""
      }

      <p style="margin-top:24px;"><a href="${SITE_URL}" style="color:#0070f3;">View CongTrade</a></p>
    </div>
  `;

  const text = `CongTrade daily ingest report — ${reportDate}

New filings: ${rows.length} (House: ${houseCount}, Senate: ${senateCount})${reprocessedOlder ? `\nOlder filings re-processed: ${reprocessedOlder}` : ""}
Published: ${successful.length}
Errors: ${undefinedRows.length}
New transactions: ${totalNewTransactions}

NEEDS PIXEL-BY-PIXEL REVIEW: ${backlog.length}${needsReviewToday.length ? ` (${needsReviewToday.length} new ${reportDate})` : ""}
These are NOT on the site until reviewed.
${reviewTextLines(backlog, MAX_ROWS)}

Publish a reviewed filing with:  npm run review:approve -- <docId>
${entitlementErrors > 0 ? `\nWARNING: subscription checks failed for ${entitlementErrors} account(s) in the last 2 days — alerts kept sending. See user_entitlements.last_error.\n` : ""}`;

  if (dryRun) {
    console.log(`DRY RUN — nothing sent, watermark left at ${since.toISOString()}\n`);
    console.log(`subject: ${subject}`);
    console.log(text);
    return;
  }

  await sendEmail({ to: reportRecipient(), subject, html, text });
  // Only now — a send that threw above leaves the watermark where it was, so
  // the next run re-reports rather than losing a day.
  await markReportSent();
  console.log(
    `Sent daily report to ${reportRecipient()}: ${rows.length} new filing(s) since ${since.toISOString()} ` +
      `(${successful.length} published, ${undefinedRows.length} errors, ${reprocessedOlder} older re-processed).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
