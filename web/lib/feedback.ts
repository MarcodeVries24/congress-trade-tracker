import { FEEDBACK_KINDS, type FeedbackInput, type FeedbackKind } from "@congtrade/shared/feedback";
import { sql } from "./db";
import { SITE_URL } from "./site";

/**
 * Feedback from the app and the website. See the feedback table in
 * ingest/src/db/schema.ts; POST /api/feedback writes it, /admin/feedback reads
 * it, and the daily report counts what is new.
 */

export type FeedbackStatus = "new" | "read" | "done";
export const FEEDBACK_STATUSES: FeedbackStatus[] = ["new", "read", "done"];

export interface FeedbackRow {
  id: string;
  created_at: string;
  user_id: string | null;
  email: string | null;
  kind: FeedbackKind;
  message: string;
  source: string;
  app_version: string | null;
  os_version: string | null;
  screen: string | null;
  status: FeedbackStatus;
  note: string | null;
}

// How much one sender can send in an hour. Signed in, that is per account;
// without an account there is nothing to tell senders apart by except their
// network address, which is not worth storing for this, so anonymous messages
// share one allowance: plenty for real people at CongTrade's size, and a cap
// on what a script can pile into the inbox.
const PER_ACCOUNT_PER_HOUR = 5;
const ANONYMOUS_PER_HOUR = 20;

/** Whether this sender has already used up the hour's allowance. */
export async function feedbackLimitReached(userId: string | null): Promise<boolean> {
  const rows = (await (userId
    ? sql.query(
        `SELECT COUNT(*)::int AS count FROM feedback WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId]
      )
    : sql.query(
        `SELECT COUNT(*)::int AS count FROM feedback WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 hour'`
      ))) as { count: number }[];
  return (rows[0]?.count ?? 0) >= (userId ? PER_ACCOUNT_PER_HOUR : ANONYMOUS_PER_HOUR);
}

export async function saveFeedback(userId: string | null, f: FeedbackInput): Promise<string> {
  const rows = (await sql.query(
    `INSERT INTO feedback (user_id, email, kind, message, source, app_version, os_version, screen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text`,
    [userId, f.email, f.kind, f.message, f.source, f.appVersion, f.osVersion, f.screen]
  )) as { id: string }[];
  return rows[0].id;
}

export async function listFeedback(status: FeedbackStatus | null, limit = 100): Promise<FeedbackRow[]> {
  return (await (status
    ? sql.query(
        `SELECT id::text, created_at, user_id, email, kind, message, source, app_version, os_version, screen, status, note
         FROM feedback WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
        [status, limit]
      )
    : sql.query(
        `SELECT id::text, created_at, user_id, email, kind, message, source, app_version, os_version, screen, status, note
         FROM feedback ORDER BY created_at DESC LIMIT $1`,
        [limit]
      ))) as FeedbackRow[];
}

export async function countFeedbackByStatus(): Promise<Record<FeedbackStatus, number>> {
  const rows = (await sql.query(`SELECT status, COUNT(*)::int AS count FROM feedback GROUP BY status`)) as {
    status: FeedbackStatus;
    count: number;
  }[];
  const counts: Record<FeedbackStatus, number> = { new: 0, read: 0, done: 0 };
  for (const r of rows) if (r.status in counts) counts[r.status] = r.count;
  return counts;
}

/** Sets the status and, when given, the note. False when there is no such row. */
export async function updateFeedback(id: string, status: FeedbackStatus, note?: string | null): Promise<boolean> {
  const rows = (await (note === undefined
    ? sql.query(`UPDATE feedback SET status = $2, updated_at = NOW() WHERE id = $1::bigint RETURNING id`, [id, status])
    : sql.query(`UPDATE feedback SET status = $2, note = $3, updated_at = NOW() WHERE id = $1::bigint RETURNING id`, [
        id,
        status,
        note,
      ]))) as unknown[];
  return rows.length > 0;
}

const SOURCE_LABEL: Record<string, string> = { ios: "iPhone app", android: "Android app", web: "Website" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * Tells the inbox a message came in, with the sender as reply-to so it can be
 * answered from the mail client. Never throws: the message is already saved,
 * and /admin/feedback shows it whatever happens to the email.
 *
 * Uses RESEND_API_KEY and ALERT_FROM_EMAIL, as alerts do, and sends to
 * FEEDBACK_TO_EMAIL, or contact@congtrade.com when that is not set.
 */
export async function emailFeedback(id: string, userId: string | null, f: FeedbackInput): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  const to = process.env.FEEDBACK_TO_EMAIL || "contact@congtrade.com";
  if (!key || !from) {
    console.warn("feedback email not sent: RESEND_API_KEY or ALERT_FROM_EMAIL is not set for the website");
    return;
  }
  const kind = FEEDBACK_KINDS[f.kind];
  const firstLine = f.message.split("\n")[0].slice(0, 60);
  const details = [
    `From: ${f.email ?? "no reply address"}${userId ? ` (account ${userId})` : " (no account)"}`,
    `Sent from: ${SOURCE_LABEL[f.source] ?? f.source}${f.screen ? `, ${f.screen} screen` : ""}`,
    f.appVersion || f.osVersion ? `Version: app ${f.appVersion ?? "?"}, OS ${f.osVersion ?? "?"}` : null,
  ].filter(Boolean) as string[];
  const text = `${kind}\n\n${f.message}\n\n${details.join("\n")}\n\nAll feedback: ${SITE_URL}/admin/feedback\n`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;color:#111;">
      <p style="margin:0 0 4px;color:#3A82C2;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(kind)}</p>
      <p style="white-space:pre-wrap;font-size:15px;line-height:1.5;margin:0 0 16px;">${escapeHtml(f.message)}</p>
      <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 16px;">${details.map(escapeHtml).join("<br/>")}</p>
      <p style="font-size:13px;margin:0;"><a href="${SITE_URL}/admin/feedback" style="color:#0070f3;">All feedback in the admin panel</a></p>
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        ...(f.email ? { reply_to: f.email } : {}),
        subject: `Feedback #${id}: ${kind}: ${firstLine}`,
        text,
        html,
      }),
    });
    if (!res.ok) console.error(`feedback email #${id} failed: ${res.status} ${await res.text().catch(() => "")}`);
  } catch (err) {
    console.error(`feedback email #${id} failed: ${(err as Error).message}`);
  }
}
