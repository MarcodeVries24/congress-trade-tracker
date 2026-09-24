// Imported for the CLI path (`npm run review:queue`), where nothing else has
// loaded .env yet — db/index.js reads DATABASE_URL at import time. Idempotent,
// so it's harmless when sendDailyReport has already done it.
import "../loadEnv.js";
import { sql } from "../db/index.js";

/**
 * Filings whose numbers are NOT on the site yet because nobody has verified
 * the scan by hand. These are documents with no usable text layer, where the
 * pipeline either produced a low-confidence OCR draft or nothing at all:
 *
 *   'ocr'         OCR found rows, but they are a draft — held back, not shown.
 *   'empty'       OCR (House) found nothing. NOT the same as "no trades":
 *                 18 of Blumenthal's 'empty' filings turned out to hold 139
 *                 real transactions once read by eye.
 *   'unsupported' Senate paper filing the OCR declined outright. Same story —
 *                 9 of his 'unsupported' filings held 43 real transactions.
 *
 * 'failed' is deliberately excluded: that's a download/parse *error* to fix
 * in code, not a document waiting to be transcribed. It keeps its own bucket
 * in the daily report.
 *
 * Nothing leaves this queue on its own. A filing leaves it when a human has
 * read the scan, corrected the rows, and set parse_status = 'manual' — which
 * is also exactly what publishes it (see PUBLISHED_FILING_SQL in web/lib/db).
 */
export const REVIEW_STATUSES = ["ocr", "empty", "unsupported"] as const;

export interface ReviewItem {
  doc_id: string;
  chamber: "house" | "senate";
  member_name: string;
  state_district: string | null;
  filing_date: string;
  parse_status: string;
  /** Rows OCR managed to read. A draft to check against, never a total to trust. */
  draft_transactions: number;
  pdf_url: string;
  /** Distinct fields OCR flagged as unreadable on this filing. */
  issue_count: number;
}

/**
 * @param ingestedSince  Only filings *discovered* after this instant — i.e.
 *   what is newly in front of you since the last report. Omit for the whole
 *   backlog; the daily email shows both, so a filing you don't get to on day
 *   one doesn't quietly vanish from the report.
 *
 *   Deliberately keyed on when we ingested the filing, not on its filing_date.
 *   A scanned filing is usually discovered a day or more after it was filed
 *   (the House Clerk publishes on its own schedule), so a filing_date window
 *   would keep missing exactly the documents this queue exists to surface —
 *   the same bug the report itself had. See report_runs in db/schema.ts.
 */
export async function getReviewQueue(ingestedSince?: string | Date): Promise<ReviewItem[]> {
  const rows = (await sql.query(
    `SELECT f.doc_id, f.chamber, f.member_name, f.state_district, f.filing_date,
            f.parse_status, f.transaction_count AS draft_transactions, f.pdf_url,
            (SELECT COUNT(*)::int FROM parse_issues pi WHERE pi.doc_id = f.doc_id) AS issue_count
     FROM filings f
     WHERE f.parse_status = ANY($1)
       ${ingestedSince ? "AND f.ingested_at > $2::timestamptz" : ""}
     ORDER BY f.filing_date DESC, f.member_name`,
    ingestedSince ? [REVIEW_STATUSES, ingestedSince] : [REVIEW_STATUSES]
  )) as ReviewItem[];
  return rows;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * One line per filing that needs reading by eye. Carries the doc_id (what
 * the audit scripts key on) and a direct link to the scan, so the email is
 * a worklist you can act on rather than just a count.
 */
export function renderReviewRows(items: ReviewItem[]): string {
  return items
    .map((r) => {
      const draft =
        r.parse_status === "ocr"
          ? `${r.draft_transactions} draft row${r.draft_transactions === 1 ? "" : "s"}`
          : "nothing read";
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${escapeHtml(r.member_name.replace(/^Hon\.\s+/, ""))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${r.chamber === "house" ? "House" : "Senate"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${escapeHtml(r.filing_date ?? "")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;"><code style="font-size:12px;">${escapeHtml(r.parse_status)}</code></td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${draft}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;"><a href="${r.pdf_url}" style="color:#0070f3;">scan</a></td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;"><code style="font-size:11px;color:#666;">${escapeHtml(r.doc_id)}</code></td>
      </tr>`;
    })
    .join("");
}

export function reviewTable(items: ReviewItem[]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase;">
      <th style="padding:6px 10px;">Member</th><th style="padding:6px 10px;">Chamber</th>
      <th style="padding:6px 10px;">Filed</th><th style="padding:6px 10px;">Status</th>
      <th style="padding:6px 10px;">OCR</th><th style="padding:6px 10px;">Source</th>
      <th style="padding:6px 10px;">Doc ID</th>
    </tr>
    ${renderReviewRows(items)}
  </table>`;
}

/**
 * The whole "needs review" block of the daily email. Lives here rather than
 * in sendDailyReport so the queue owns both what it is and how it reads, and
 * so it can be rendered from fabricated rows in a preview without touching
 * the database.
 */
export function reviewSectionHtml(
  backlog: ReviewItem[],
  arrivedToday: ReviewItem[],
  reportDate: string,
  maxRows = 150
): string {
  const older = backlog.filter((b) => !arrivedToday.some((t) => t.doc_id === b.doc_id));
  return `
      <h3 style="margin-bottom:4px;margin-top:28px;color:#a35c00;">Needs pixel-by-pixel review (${backlog.length})</h3>
      <p style="color:#666;font-size:13px;margin-top:0;">
        Scanned filings with no usable text layer. <strong>Their numbers are not on the site.</strong>
        OCR is not accurate enough to publish unreviewed — read the scan, correct the rows, then run
        <code>npm run review:approve -- &lt;docId&gt;</code> to publish.
      </p>
      ${
        backlog.length === 0
          ? `<p style="color:#666;">None — the queue is empty.</p>`
          : `
        ${
          arrivedToday.length
            ? `<p style="font-size:13px;margin:12px 0 4px;"><strong>Arrived ${reportDate} (${arrivedToday.length})</strong></p>
               ${reviewTable(arrivedToday.slice(0, maxRows))}`
            : `<p style="color:#666;font-size:13px;margin:12px 0 4px;">Nothing new arrived for review ${reportDate}.</p>`
        }
        ${
          older.length
            ? `<p style="font-size:13px;margin:18px 0 4px;"><strong>Still outstanding from earlier (${older.length})</strong></p>
               ${reviewTable(older.slice(0, maxRows))}
               ${older.length > maxRows ? `<p style="color:#666;font-size:13px;">and ${older.length - maxRows} more.</p>` : ""}`
            : ""
        }`
      }`;
}

/** Plain-text worklist for the text/plain half of the email. */
export function reviewTextLines(backlog: ReviewItem[], maxRows = 150): string {
  if (backlog.length === 0) return "  (queue empty)";
  return backlog
    .slice(0, maxRows)
    .map(
      (r) =>
        `  ${r.filing_date}  ${r.chamber.padEnd(6)} ${r.parse_status.padEnd(11)} ` +
        `${r.parse_status === "ocr" ? `${r.draft_transactions} draft` : "nothing read"}`.padEnd(14) +
        `  ${r.member_name}  ${r.doc_id}\n      ${r.pdf_url}`
    )
    .join("\n");
}

/** CLI: `npm run review:queue [-- --since=2026-09-01]` (--since filters on when we ingested it) */
async function main() {
  const since = process.argv.slice(2).find((a) => a.startsWith("--since="))?.split("=")[1];
  const items = await getReviewQueue(since);

  if (items.length === 0) {
    console.log(since ? `Nothing ingested since ${since} is awaiting review.` : "Nothing awaiting review — the queue is empty.");
    return;
  }

  console.log(`${items.length} filing(s) awaiting pixel-by-pixel review${since ? ` (ingested since ${since})` : ""}:\n`);
  for (const i of items) {
    const draft = i.parse_status === "ocr" ? `${i.draft_transactions} draft row(s)` : "no rows read";
    console.log(
      `  ${i.filing_date}  ${i.chamber.padEnd(6)} ${i.parse_status.padEnd(11)} ${draft.padEnd(17)} ${i.member_name}`
    );
    console.log(`      ${i.doc_id}   ${i.pdf_url}${i.issue_count ? `   (${i.issue_count} flagged field(s))` : ""}`);
  }
  console.log(`\nAfter transcribing one, publish it with:  npm run review:approve -- <docId> [<docId>...]`);
}

if (process.argv[1]?.endsWith("reviewQueue.js") || process.argv[1]?.endsWith("reviewQueue.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
