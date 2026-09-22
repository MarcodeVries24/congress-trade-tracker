import { sql } from "./db";
import {
  ALERT_FROM_SQL,
  ALERT_SELECT_SQL,
  AlertFilters,
  AlertFrequency,
  AlertTradeRow,
  buildAlertConditions,
} from "./alertFilters";

/**
 * Server-side data access for saved email alerts. Every function here takes
 * the Clerk user id and scopes its query by it — ownership is enforced in
 * the WHERE clause, not by trusting an id the client sent, so a request for
 * someone else's alert id simply matches no rows.
 */

/** Per-account ceiling. High enough to never be hit in normal use; low enough that one account can't turn the cron into a mail blast. */
export const MAX_ALERTS_PER_USER = 25;

export interface AlertRecord {
  id: string;
  name: string;
  email: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  sent_count: number;
  matched_count: number;
  /**
   * Why this alert stopped on its own. NULL when the owner paused it by hand;
   * 'subscription-ended' when the sender found the account no longer holds
   * CongTrade Pro. The account screen turns it into an explanation.
   */
  paused_reason: string | null;
}

// id is a bigint: node-postgres (and Neon's driver) hand those back as
// strings to avoid silently losing precision, so it is selected as text
// explicitly and treated as a string all the way to the client.
const ALERT_COLUMNS = `id::text AS id, name, email, filters, frequency, active,
  created_at, updated_at, last_sent_at, sent_count, matched_count, paused_reason`;

export async function listAlerts(userId: string): Promise<AlertRecord[]> {
  return (await sql.query(
    `SELECT ${ALERT_COLUMNS} FROM alerts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  )) as AlertRecord[];
}

export async function countAlerts(userId: string): Promise<number> {
  const rows = (await sql.query(`SELECT COUNT(*)::int AS count FROM alerts WHERE user_id = $1`, [userId])) as { count: number }[];
  return rows[0]?.count ?? 0;
}

export async function createAlert(input: {
  userId: string;
  email: string;
  name: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
}): Promise<AlertRecord> {
  const rows = (await sql.query(
    `INSERT INTO alerts (user_id, email, name, filters, frequency, unsubscribe_token)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING ${ALERT_COLUMNS}`,
    [input.userId, input.email, input.name, JSON.stringify(input.filters), input.frequency, crypto.randomUUID()]
  )) as AlertRecord[];
  return rows[0];
}

export async function updateAlert(
  userId: string,
  id: string,
  patch: { name?: string; filters?: AlertFilters; frequency?: AlertFrequency; active?: boolean }
): Promise<AlertRecord | null> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (patch.name !== undefined) sets.push(`name = ${addParam(patch.name)}`);
  if (patch.filters !== undefined) sets.push(`filters = ${addParam(JSON.stringify(patch.filters))}::jsonb`);
  if (patch.frequency !== undefined) sets.push(`frequency = ${addParam(patch.frequency)}`);
  if (patch.active !== undefined) {
    sets.push(`active = ${addParam(patch.active)}`);
    // Switching it back on clears the sender's explanation for switching it
    // off — the route only allows this once the caller holds Pro again, so
    // leaving a stale "subscription ended" note would just be wrong.
    if (patch.active) sets.push(`paused_reason = NULL`);
  }

  const idParam = addParam(id);
  const userParam = addParam(userId);
  const rows = (await sql.query(
    `UPDATE alerts SET ${sets.join(", ")} WHERE id = ${idParam}::bigint AND user_id = ${userParam} RETURNING ${ALERT_COLUMNS}`,
    params
  )) as AlertRecord[];
  return rows[0] ?? null;
}

export async function deleteAlert(userId: string, id: string): Promise<boolean> {
  const rows = (await sql.query(`DELETE FROM alerts WHERE id = $1::bigint AND user_id = $2 RETURNING id`, [id, userId])) as unknown[];
  return rows.length > 0;
}

/**
 * Keeps the stored delivery address in step with Clerk's, which is the
 * account screen's job: the sender runs in GitHub Actions with no Clerk
 * credentials, so this snapshot is the only address it has. Called on every
 * authenticated read of the account screen, so changing your email in Clerk
 * takes effect the next time you look at your alerts.
 */
/**
 * Records what the site already knows for free: the signed-in owner's plan
 * status. The alert sender runs in GitHub Actions and would otherwise have to
 * ask Clerk on every cycle; because this writes on every visit to /account,
 * most cron runs find a fresh answer waiting and never call out at all.
 *
 * Also keeps the two sides from disagreeing: both are now recording the same
 * verdict into the same row.
 */
export async function recordEntitlement(userId: string, isPro: boolean): Promise<void> {
  await sql.query(
    `INSERT INTO user_entitlements (user_id, is_pro, source, checked_at, last_error, last_error_at, updated_at)
     VALUES ($1, $2, 'web', NOW(), NULL, NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       is_pro = EXCLUDED.is_pro, source = 'web', checked_at = NOW(),
       last_error = NULL, last_error_at = NULL, updated_at = NOW()`,
    [userId, isPro]
  );
}

export async function syncAlertEmails(userId: string, email: string): Promise<void> {
  await sql.query(`UPDATE alerts SET email = $1 WHERE user_id = $2 AND email IS DISTINCT FROM $1`, [email, userId]);
}

export interface AlertPreview {
  /** Matches in the whole corpus — how broad the alert is overall. */
  total: number;
  /** Matches among trades filed in the last 90 days — how noisy it will actually be. */
  recent: number;
  sample: AlertTradeRow[];
}

const PREVIEW_WINDOW_DAYS = 90;

/**
 * What this alert *would* have caught, so nobody saves a filter blind.
 *
 * Runs the identical conditions the cron will run (buildAlertConditions),
 * against history rather than against new arrivals — an alert only ever
 * emails trades from filings ingested after it was created, so this is a
 * calibration tool, not a promise of what the first email will contain.
 */
export async function previewAlert(filters: AlertFilters): Promise<AlertPreview> {
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = `WHERE ${buildAlertConditions(filters, addParam).join(" AND ")}`;

  const [countRows, sampleRows] = await Promise.all([
    sql.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE NULLIF(f.filing_date, '')::date >= CURRENT_DATE - ${PREVIEW_WINDOW_DAYS})::int AS recent
       ${ALERT_FROM_SQL} ${where}`,
      params
    ),
    sql.query(
      `SELECT ${ALERT_SELECT_SQL} ${ALERT_FROM_SQL} ${where}
       ORDER BY f.filing_date DESC NULLS LAST, t.id DESC
       LIMIT 6`,
      params
    ),
  ]);

  const counts = (countRows as { total: number; recent: number }[])[0];
  return {
    total: counts?.total ?? 0,
    recent: counts?.recent ?? 0,
    sample: sampleRows as AlertTradeRow[],
  };
}
