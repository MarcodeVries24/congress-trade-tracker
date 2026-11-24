import "../loadEnv.js";
import { ensureSchema, sql } from "../db/index.js";
import { ALERT_FROM_SQL, buildAlertConditions } from "../../../web/lib/alertFilters";
import { resolveEntitlements } from "./entitlements.js";
import { pushTokensFor, sendPush } from "./push.js";
import { reminderMessageFor } from "./pushMessage.js";

/**
 * A push notification for subscribers who have never set up an alert: new
 * trades were published, and an alert would tell them about the next ones.
 * Runs after every ingest, right after the alerts themselves
 * (.github/workflows/ingest.yml).
 *
 * Deliberately rare, because a notification too many costs the permission for
 * all of them:
 *  - only Pro, since making an alert needs it, and only a confirmed yes: for
 *    an alert an unanswered check sends anyway, here it waits;
 *  - only someone with no alerts at all. One who paused theirs chose silence;
 *  - at most once a week, not in the first days after the phone was
 *    registered, and not to someone who opened the app within the last day;
 *  - only right after filings were approved in /admin, the moment they are
 *    published, like the alerts themselves.
 *
 * Turning it off needs no switch of its own: whoever gets it has no alerts,
 * so the app's switch for push on this phone stops only this.
 *
 * Usage:
 *   npm run alerts:remind                # send what is due
 *   npm run alerts:remind -- --dry-run   # print who would get one, send nothing
 */

/** Just under a week, so the runs' times shifting a little never skips one. */
const EVERY = "6 days 20 hours";
const SETTLE_IN = "2 days";
const RECENTLY_OPENED = "1 day";
/** A run comes every four hours; with some room for a late one. */
const JUST_APPROVED = "6 hours";
/** As the alert sender: an old filing only now approved is not news. */
const MAX_FILING_AGE_DAYS = 60;

async function usersDue(): Promise<string[]> {
  const rows = (await sql.query(
    `SELECT d.user_id
     FROM push_devices d
     LEFT JOIN user_entitlements e ON e.user_id = d.user_id
     WHERE NOT EXISTS (SELECT 1 FROM alerts a WHERE a.user_id = d.user_id)
       AND (e.reminded_at IS NULL OR e.reminded_at < NOW() - INTERVAL '${EVERY}')
     GROUP BY d.user_id
     HAVING MIN(d.created_at) < NOW() - INTERVAL '${SETTLE_IN}'
        AND MAX(d.last_seen_at) < NOW() - INTERVAL '${RECENTLY_OPENED}'
     ORDER BY d.user_id`
  )) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/**
 * Trades published in the last week, and whether any were just now. By
 * approval, not by ingest: nothing waiting in /admin counts, and a filing
 * read again later keeps its first approval (KEEP_APPROVAL_SQL), so a bulk
 * re-read is not news.
 */
async function newTrades(): Promise<{ week: number; now: number }> {
  const params: unknown[] = [];
  const conditions = buildAlertConditions({}, (value) => {
    params.push(value);
    return `$${params.length}`;
  });
  conditions.push(`f.approved_at > NOW() - INTERVAL '7 days'`);
  conditions.push(`NULLIF(f.filing_date, '')::date >= CURRENT_DATE - ${MAX_FILING_AGE_DAYS}`);
  const rows = (await sql.query(
    `SELECT COUNT(*)::int AS week,
            COUNT(*) FILTER (WHERE f.approved_at > NOW() - INTERVAL '${JUST_APPROVED}')::int AS now
     ${ALERT_FROM_SQL} WHERE ${conditions.join(" AND ")}`,
    params
  )) as { week: number; now: number }[];
  return rows[0] ?? { week: 0, now: 0 };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await ensureSchema();
  const due = await usersDue();
  if (due.length === 0) {
    console.log("No reminders due.");
    return;
  }
  const { week, now } = await newTrades();
  if (now === 0) {
    console.log("Nothing was just approved, so no reminders.");
    return;
  }

  const message = reminderMessageFor(week);
  const entitlements = await resolveEntitlements(due);
  let sent = 0;
  let failed = 0;
  for (const userId of due) {
    if (entitlements.get(userId)?.status !== "entitled") continue;
    if (dryRun) {
      console.log(`  ${userId}: ${message.title} | ${message.body}`);
      sent++;
      continue;
    }
    try {
      // Recorded before it is sent, unlike an alert: one lost reminder costs
      // nothing, and one repeated every few hours would cost the permission.
      await sql.query(
        `INSERT INTO user_entitlements (user_id, reminded_at) VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET reminded_at = NOW()`,
        [userId]
      );
      if (await sendPush(await pushTokensFor(userId), message)) sent++;
    } catch (err) {
      failed++;
      console.error(`  ${userId} — FAILED: ${(err as Error).message}`);
    }
  }
  console.log(`${sent} reminder(s) ${dryRun ? "would be sent" : "sent"}.`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
