import { sql } from "@/lib/db";
import type { SubscriptionProvider } from "@/lib/subscriptionAccess";

/**
 * The replay guard for App Store and Play notifications.
 *
 * Apple retries a notification for five days until it gets a 200, and Google's
 * Pub/Sub push is at-least-once by design, so every handler will see the same
 * delivery more than once. The insert is the lock: whoever wins the row does
 * the work, everyone else returns early having done nothing.
 *
 * Deliberately the same shape as claimEvent for Stripe, because the failure it
 * prevents is the same one — applying a subscription change twice — and two
 * different answers to one question is how they drift.
 */
export async function claimStoreEvent(
  provider: SubscriptionProvider,
  id: string,
  type: string
): Promise<boolean> {
  const rows = (await sql.query(
    `INSERT INTO store_events (provider, id, type) VALUES ($1, $2, $3)
     ON CONFLICT (provider, id) DO NOTHING
     RETURNING id`,
    [provider, id, type]
  )) as { id: string }[];
  return rows.length > 0;
}
