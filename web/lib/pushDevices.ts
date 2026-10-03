import { sql } from "./db";

/**
 * The phones each account gets push notifications on. See push_devices in
 * ingest/src/db/schema.ts; the alert sender reads the same table.
 *
 * Every query is scoped by the Clerk user id, as in lib/alerts.ts, except the
 * upsert, which deliberately takes a token over from whoever held it: a token
 * names an install, and the install now belongs to whoever is signed in.
 */

/** What an Expo push token looks like; anything else is refused unstored. */
export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/;

export async function registerPushDevice(userId: string, token: string, platform: "ios" | "android") {
  await sql.query(
    `INSERT INTO push_devices (token, user_id, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = NOW()`,
    [token, userId, platform]
  );
}

export async function removePushDevice(userId: string, token: string): Promise<boolean> {
  const rows = (await sql.query(`DELETE FROM push_devices WHERE token = $1 AND user_id = $2 RETURNING token`, [
    token,
    userId,
  ])) as unknown[];
  return rows.length > 0;
}

export async function countPushDevices(userId: string): Promise<number> {
  const rows = (await sql.query(`SELECT COUNT(*)::int AS count FROM push_devices WHERE user_id = $1`, [
    userId,
  ])) as { count: number }[];
  return rows[0]?.count ?? 0;
}
