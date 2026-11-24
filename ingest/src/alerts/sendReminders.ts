import "../loadEnv.js";
import { periodForStoreProduct } from "@congtrade/shared/storeProducts";
import { ensureSchema, sql } from "../db/index.js";
import { ALERT_FROM_SQL, buildAlertConditions } from "../../../web/lib/alertFilters";
import { resolveEntitlements } from "./entitlements.js";
import { pushTokensFor, sendPush } from "./push.js";
import { reminderMessageFor } from "./pushMessage.js";
import { inTrial, reminderFor, type Reminder } from "./reminderRules.js";

/**
 * A push notification that new trades were published, for subscribers who
 * would otherwise hear nothing: those with no alert, and those whose alerts
 * have sent nothing for a while (two weeks, or one in a free trial). Who is
 * due, and how rarely, is in reminderRules.ts. Runs after every ingest, right
 * after the alerts themselves (.github/workflows/ingest.yml), so an alert
 * that just found something is not called quiet.
 *
 *  - Only Pro, and only a confirmed yes: for an alert an unanswered check
 *    sends anyway, here it waits.
 *  - Only right after filings were approved in /admin, the moment they are
 *    published, like the alerts themselves.
 *  - Never to someone who switched it off in the app (push_reminders, set by
 *    web/app/api/push/reminders).
 *
 * Usage:
 *   npm run alerts:remind                # send what is due
 *   npm run alerts:remind -- --dry-run   # print who would get one, send nothing
 */

/** A run comes every four hours; with some room for a late one. */
const JUST_APPROVED = "6 hours";
/** As the alert sender: an old filing only now approved is not news. */
const MAX_FILING_AGE_DAYS = 60;

interface PersonRow {
  user_id: string;
  registered_at: string;
  opened_at: string;
  reminded_at: string | null;
  alerts: number;
  active_alerts: number;
  alerts_touched_at: string | null;
  /** Their store subscription, for telling a trial. */
  product_id: string | null;
  started_at: string | null;
  period_end: string | null;
}

async function whoIsDue(now: Date): Promise<{ userId: string; reminder: Reminder }[]> {
  const rows = (await sql.query(
    `SELECT d.user_id, d.registered_at, d.opened_at, e.reminded_at,
            COALESCE(a.alerts, 0)::int AS alerts, COALESCE(a.active_alerts, 0)::int AS active_alerts,
            a.alerts_touched_at, s.product_id, s.started_at, s.period_end
     FROM (
       SELECT user_id, MIN(created_at) AS registered_at, MAX(last_seen_at) AS opened_at
       FROM push_devices GROUP BY user_id
     ) d
     LEFT JOIN user_entitlements e ON e.user_id = d.user_id
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS alerts, COUNT(*) FILTER (WHERE active) AS active_alerts,
              MAX(GREATEST(created_at, updated_at, last_sent_at)) AS alerts_touched_at
       FROM alerts GROUP BY user_id
     ) a ON a.user_id = d.user_id
     LEFT JOIN LATERAL (
       SELECT product_id, created_at AS started_at, current_period_end AS period_end
       FROM subscriptions
       WHERE clerk_user_id = d.user_id AND provider IN ('apple', 'google')
       ORDER BY current_period_end DESC NULLS LAST
       LIMIT 1
     ) s ON TRUE
     WHERE COALESCE(e.push_reminders, TRUE)
     ORDER BY d.user_id`
  )) as PersonRow[];

  const date = (value: string | null) => (value ? new Date(value) : null);
  return rows.flatMap((r) => {
    const reminder = reminderFor(
      {
        registeredAt: new Date(r.registered_at),
        openedAt: new Date(r.opened_at),
        remindedAt: date(r.reminded_at),
        alerts: r.alerts,
        activeAlerts: r.active_alerts,
        alertsTouchedAt: date(r.alerts_touched_at),
        trial:
          r.started_at !== null &&
          inTrial(
            {
              annual: r.product_id !== null && periodForStoreProduct(r.product_id) === "annual",
              startedAt: new Date(r.started_at),
              periodEnd: date(r.period_end),
            },
            now
          ),
      },
      now
    );
    return reminder ? [{ userId: r.user_id, reminder }] : [];
  });
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
  const due = await whoIsDue(new Date());
  if (due.length === 0) {
    console.log("No reminders due.");
    return;
  }
  const trades = await newTrades();
  if (trades.now === 0) {
    console.log("Nothing was just approved, so no reminders.");
    return;
  }

  const entitlements = await resolveEntitlements(due.map((d) => d.userId));
  let sent = 0;
  let failed = 0;
  for (const { userId, reminder } of due) {
    if (entitlements.get(userId)?.status !== "entitled") continue;
    const message = reminderMessageFor(reminder, trades.week);
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
