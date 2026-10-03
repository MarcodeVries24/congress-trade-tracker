import { sql } from "../db/index.js";
import type { PushMessage } from "./pushMessage.js";

export { pushMessageFor } from "./pushMessage.js";

/**
 * Push notifications for alerts, through Expo's push service, which hands
 * them to Apple and Google. The app registers each phone's Expo push token
 * (web/app/api/push/devices); this sends to every phone an alert's owner has.
 *
 * No credentials needed by default: Expo accepts a token from the project it
 * was issued to. If "enhanced push security" is ever switched on for the
 * project, set EXPO_ACCESS_TOKEN and it is sent along.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo's own limit per request.
const BATCH = 100;

export async function pushTokensFor(userId: string): Promise<string[]> {
  const rows = (await sql.query(`SELECT token FROM push_devices WHERE user_id = $1`, [userId])) as {
    token: string;
  }[];
  return rows.map((r) => r.token);
}

interface Ticket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Sends one message to each token. Returns how many Expo accepted; a token
 * Expo says no longer exists (the app was deleted, or notifications were
 * revoked in a way that retires the token) is removed so it is not tried
 * again. Throws only when Expo refuses the whole request.
 */
export async function sendPush(tokens: string[], message: PushMessage): Promise<number> {
  let accepted = 0;
  const gone: string[] = [];
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          priority: "high",
          // Created by the app on Android; see mobile/src/lib/push.tsx.
          channelId: "alerts",
        }))
      ),
    });
    if (!res.ok) throw new Error(`Expo push refused the request: ${res.status} ${await res.text().catch(() => "")}`);
    const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
    tickets.forEach((ticket, j) => {
      if (ticket.status === "ok") accepted++;
      else if (ticket.details?.error === "DeviceNotRegistered") gone.push(batch[j]);
      else console.warn(`    push to one device failed: ${ticket.message ?? ticket.details?.error ?? "unknown"}`);
    });
  }
  if (gone.length) {
    await sql.query(`DELETE FROM push_devices WHERE token = ANY($1::text[])`, [gone]);
    console.log(`    removed ${gone.length} device(s) Expo no longer knows.`);
  }
  return accepted;
}
