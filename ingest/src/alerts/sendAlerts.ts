import "../loadEnv.js";
import { ensureSchema, sql } from "../db/index.js";
import { sendEmail } from "../lib/email.js";
import {
  ALERT_CONTENT_KEY_SQL,
  ALERT_FROM_SQL,
  ALERT_SELECT_SQL,
  buildAlertConditions,
  normalizeAlertFilters,
  summarizeAlert,
} from "../../../web/lib/alertFilters";
import type { AlertFilters, AlertTradeRow } from "../../../web/lib/alertFilters";
import { alertEmailHtml, alertEmailSubject, alertEmailText } from "./renderAlertEmail.js";
import { resolveEntitlements } from "./entitlements.js";

/**
 * Sends CongTrade Pro email alerts. Runs after every ingest
 * (.github/workflows/ingest.yml), so an "as it happens" alert is emailed at
 * most ~4 hours after a filing shows up — which is as fast as the source
 * disclosure sites are polled.
 *
 * The matching SQL is not written here: it comes from web/lib/alertFilters.ts,
 * the same module the account screen uses to preview an alert before saving
 * it. That's deliberate — a preview that promised 12 matches and an email
 * that delivered a different 12 would be an invisible bug, so there is only
 * one implementation.
 *
 * Before sending, each owner's CongTrade Pro status is re-checked against
 * Clerk (see entitlements.ts) and an alert belonging to a lapsed subscriber
 * is paused with a reason rather than quietly skipped — an alert that says
 * "Active" on the account screen while sending nothing is worse than one that
 * explains itself. An inconclusive check always sends.
 *
 * Usage:
 *   npm run alerts:send                  # send everything due
 *   npm run alerts:send -- --dry-run     # print what would go out, send nothing
 *   npm run alerts:send -- --alert=42    # just one alert, ignoring its schedule
 */

// `||`, not `??`: an unset GitHub Actions secret arrives as an empty
// string, not as undefined.
const SITE_URL = (process.env.SITE_URL || "https://www.congtrade.com").replace(/\/$/, "");

/**
 * The address alerts are sent from. Unset means "alerts are not switched on
 * yet" and the job exits quietly rather than failing: Resend's sandbox
 * sender can only deliver to the account owner, so sending to real users
 * needs a verified domain first (see README). Wiring the workflow step up
 * before that is done is therefore safe — it starts working the moment this
 * is set.
 */
const ALERT_FROM = process.env.ALERT_FROM_EMAIL;

/**
 * Per-alert ceiling for one email. Anything beyond this stays unsent and is
 * picked up by the next run, which both keeps a single email readable and
 * stops any one alert turning a bulk re-ingest into a thousand-row message.
 */
const MAX_MATCHES_PER_RUN = 200;

/**
 * Two independent brakes on what counts as "new", because `ingested_at`
 * alone is not enough:
 *
 *  - `ingested_at` moves whenever a filing is re-processed, and the pipeline
 *    does re-process in bulk (a parser improvement re-read 1,400 filings in
 *    a single day in Sept 2026). Without a filing_date floor, every alert
 *    would have emailed all of them as though they were brand new.
 *  - the ingest window stops a sender that has been broken or paused for a
 *    month from waking up and blasting the whole backlog.
 *
 * A genuinely new disclosure always satisfies both.
 */
const MAX_INGEST_AGE_DAYS = 14;
const MAX_FILING_AGE_DAYS = 60;

interface DueAlert {
  id: string;
  user_id: string;
  email: string;
  name: string;
  filters: AlertFilters;
  frequency: string;
  unsubscribe_token: string;
  created_at: string;
  last_sent_at: string | null;
}

type MatchRow = AlertTradeRow & { match_key: string };

/**
 * Which alerts are due right now.
 *
 * The digest schedules are expressed as "it has been long enough since the
 * last email", not "it is 9am" — the job only wakes up when the ingest does
 * (every 4 hours), so a fixed send time would either be missed or drift. A
 * daily alert therefore means *at most* one email a day, sent on the first
 * run after something matches. An alert that matches nothing sends nothing
 * and keeps its old last_sent_at, so it stays due and simply checks again.
 */
async function loadDueAlerts(onlyId?: string): Promise<DueAlert[]> {
  if (onlyId) {
    return (await sql.query(
      `SELECT id::text AS id, user_id, email, name, filters, frequency, unsubscribe_token,
              created_at, last_sent_at
       FROM alerts WHERE id = $1::bigint`,
      [onlyId]
    )) as DueAlert[];
  }
  return (await sql.query(
    `SELECT id::text AS id, user_id, email, name, filters, frequency, unsubscribe_token,
            created_at, last_sent_at
     FROM alerts
     WHERE active
       AND (
         frequency = 'instant'
         OR (frequency = 'daily'  AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '20 hours'))
         OR (frequency = 'weekly' AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '6 days 20 hours'))
       )
     ORDER BY id`
  )) as DueAlert[];
}

/**
 * Trades this alert matches that it has never been told about.
 *
 * `occurrence` exists because two identical lines in one filing (same asset,
 * same day, same bracket — it happens) hash to the same content key; without
 * it the second one would look like a duplicate of the first and be silently
 * dropped.
 */
async function findNewMatches(alert: DueAlert): Promise<MatchRow[]> {
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  // Re-normalized on read: the row was whitelisted before it was stored, but
  // this job runs unattended against JSON in a database, so it re-checks
  // rather than assuming nothing has touched it since.
  const filters = normalizeAlertFilters(alert.filters);
  const conditions = buildAlertConditions(filters, addParam);
  conditions.push(`f.ingested_at > ${addParam(alert.created_at)}::timestamptz`);
  conditions.push(`f.ingested_at > NOW() - INTERVAL '${MAX_INGEST_AGE_DAYS} days'`);
  conditions.push(`NULLIF(f.filing_date, '')::date >= CURRENT_DATE - ${MAX_FILING_AGE_DAYS}`);

  const alertParam = addParam(alert.id);

  return (await sql.query(
    `WITH candidates AS (
       SELECT ${ALERT_SELECT_SQL},
              ${ALERT_CONTENT_KEY_SQL} AS content_key,
              ROW_NUMBER() OVER (PARTITION BY t.doc_id, ${ALERT_CONTENT_KEY_SQL} ORDER BY t.id) AS occurrence
       ${ALERT_FROM_SQL}
       WHERE ${conditions.join(" AND ")}
     )
     SELECT c.*, c.content_key || ':' || c.occurrence AS match_key
     FROM candidates c
     WHERE NOT EXISTS (
       SELECT 1 FROM alert_matches am
       WHERE am.alert_id = ${alertParam}::bigint AND am.match_key = c.content_key || ':' || c.occurrence
     )
     ORDER BY c.filing_date DESC NULLS LAST, c.id
     LIMIT ${MAX_MATCHES_PER_RUN}`,
    params
  )) as MatchRow[];
}

/**
 * Records what was just emailed, and updates the alert's counters.
 *
 * Runs *after* the send, never before: if this fails, the worst case is a
 * duplicate email next run. Recording first would mean a failed send silently
 * swallows those trades forever, which is the one failure a notification
 * product must not have.
 */
async function recordSent(alert: DueAlert, matches: MatchRow[]): Promise<void> {
  await sql.query(
    `INSERT INTO alert_matches (alert_id, match_key, doc_id)
     SELECT $1::bigint, k, d FROM UNNEST($2::text[], $3::text[]) AS m(k, d)
     ON CONFLICT DO NOTHING`,
    [alert.id, matches.map((m) => m.match_key), matches.map((m) => m.doc_id)]
  );
  await sql.query(
    `UPDATE alerts
     SET last_sent_at = NOW(), sent_count = sent_count + 1, matched_count = matched_count + $2
     WHERE id = $1::bigint`,
    [alert.id, matches.length]
  );
}

/**
 * Stops an alert whose owner no longer holds CongTrade Pro, and records why.
 *
 * Paused, never deleted: the filter they built is the valuable part, and
 * re-subscribing should bring it back in one click rather than asking them to
 * rebuild it from memory.
 */
async function pauseForLapsedSubscription(alert: DueAlert): Promise<void> {
  await sql.query(
    `UPDATE alerts SET active = FALSE, paused_reason = 'subscription-ended', updated_at = NOW() WHERE id = $1::bigint`,
    [alert.id]
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyId = args.find((a) => a.startsWith("--alert="))?.split("=")[1];

  if (!ALERT_FROM && !dryRun) {
    console.log(
      "ALERT_FROM_EMAIL is not set — user alerts are not switched on yet, so nothing was sent.\n" +
        "Verify a sending domain in Resend and set ALERT_FROM_EMAIL (e.g. \"CongTrade <alerts@congtrade.com>\")."
    );
    return;
  }

  await ensureSchema();
  const alerts = await loadDueAlerts(onlyId);
  if (alerts.length === 0) {
    console.log("No alerts due.");
    return;
  }

  console.log(`${alerts.length} alert(s) due${dryRun ? " (dry run — nothing will be sent)" : ""}.`);

  // One lookup per distinct owner, cached for hours — not one per alert.
  const entitlements = await resolveEntitlements(alerts.map((a) => a.user_id));

  let sent = 0;
  let matchedTotal = 0;
  let paused = 0;
  let unverified = 0;
  const failures: string[] = [];

  for (const alert of alerts) {
    try {
      const entitlement = entitlements.get(alert.user_id) ?? { status: "unknown" as const, reason: "not resolved" };
      if (entitlement.status === "lapsed") {
        if (!dryRun) await pauseForLapsedSubscription(alert);
        paused++;
        console.log(`  #${alert.id} ${alert.name} — owner no longer has Pro; alert paused${dryRun ? " (dry run: not actually paused)" : ""}.`);
        continue;
      }
      if (entitlement.status === "unknown") {
        // Fail open, loudly. See entitlements.ts.
        unverified++;
        console.warn(`  #${alert.id} ${alert.name} — could not verify subscription (${entitlement.reason}); sending anyway.`);
      }

      const matches = await findNewMatches(alert);
      if (matches.length === 0) {
        console.log(`  #${alert.id} ${alert.name} — nothing new.`);
        continue;
      }

      const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(alert.unsubscribe_token)}`;
      const input = {
        alertName: alert.name,
        filters: normalizeAlertFilters(alert.filters),
        trades: matches,
        totalMatched: matches.length,
        siteUrl: SITE_URL,
        unsubscribeUrl,
      };

      if (dryRun) {
        console.log(`  #${alert.id} ${alert.name} → ${alert.email}: ${matches.length} match(es)`);
        console.log(`      watching: ${summarizeAlert(input.filters)}`);
        console.log(`      subject:  ${alertEmailSubject(input)}`);
        for (const m of matches.slice(0, 5)) {
          console.log(`      · ${m.member_name} ${m.transaction_type} ${m.ticker ?? m.asset_name} ${m.amount_range ?? ""} (filed ${m.filing_date})`);
        }
        matchedTotal += matches.length;
        sent++;
        continue;
      }

      await sendEmail({
        to: alert.email,
        from: ALERT_FROM,
        subject: alertEmailSubject(input),
        html: alertEmailHtml(input),
        text: alertEmailText(input),
        headers: {
          // One-click unsubscribe, the way mailbox providers expect it: the
          // URL carries the token, and the POST body they send is ignored.
          "List-Unsubscribe": `<${SITE_URL}/api/alerts/unsubscribe?token=${encodeURIComponent(alert.unsubscribe_token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await recordSent(alert, matches);

      sent++;
      matchedTotal += matches.length;
      console.log(`  #${alert.id} ${alert.name} → ${alert.email}: ${matches.length} match(es) sent.`);
    } catch (err) {
      // One bad alert must not stop the rest — a single malformed filter or
      // a bounced address would otherwise silence every other subscriber.
      failures.push(`#${alert.id} ${alert.name}: ${(err as Error).message}`);
      console.error(`  #${alert.id} ${alert.name} — FAILED: ${(err as Error).message}`);
    }
  }

  console.log(
    `\n${sent} email(s) ${dryRun ? "would be sent" : "sent"}, ${matchedTotal} trade(s) matched` +
      `${paused ? `, ${paused} alert(s) paused (subscription ended)` : ""}` +
      `${unverified ? `, ${unverified} sent without a verified subscription` : ""}.`
  );
  if (failures.length) {
    console.error(`\n${failures.length} alert(s) failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
