import { sql } from "@/lib/db";
import { grantsAccess, type SubscriptionRow } from "@/lib/subscriptionAccess";

export { grantsAccess } from "@/lib/subscriptionAccess";
export type { SubscriptionRow } from "@/lib/subscriptionAccess";

/**
 * Reading who has access.
 *
 * Stripe is the system of record for the money; this table is the system of
 * record for access. They are different questions: Stripe knows an invoice
 * was paid, this knows whether the filters should open. Keeping the second
 * locally means the alert sender asks it as a query rather than as an HTTP
 * call per subscriber, and a billing outage can't lock paying members out of
 * what they have already paid for.
 */
export async function getSubscription(clerkUserId: string): Promise<SubscriptionRow | null> {
  const rows = (await sql.query(
    `SELECT clerk_user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
            current_period_end, cancel_at_period_end
     FROM subscriptions WHERE clerk_user_id = $1`,
    [clerkUserId]
  )) as SubscriptionRow[];
  return rows[0] ?? null;
}

/** The whole entitlement question, for one user. */
export async function isSubscriber(clerkUserId: string | null | undefined): Promise<boolean> {
  if (!clerkUserId) return false;
  return grantsAccess(await getSubscription(clerkUserId));
}
