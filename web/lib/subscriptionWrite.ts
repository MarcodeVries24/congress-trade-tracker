import { sql } from "@/lib/db";

/**
 * The write half of the subscriptions table, used only by the Stripe webhook.
 *
 * Kept apart from the read helpers so that the one place allowed to change
 * who has access is easy to find, and so nothing on a page can import a
 * function that writes.
 */
export type SubscriptionUpsert = {
  clerkUserId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * One row per user, replaced wholesale.
 *
 * Stripe redelivers events and does not promise order, so this is written to
 * be safe to apply twice and harmless to apply late: the row simply ends up
 * holding whatever the most recently *applied* event said. The event ledger in
 * markEventSeen keeps the same delivery from being applied twice at all.
 */
export async function upsertSubscription(input: SubscriptionUpsert): Promise<void> {
  await sql.query(
    `INSERT INTO subscriptions (clerk_user_id, stripe_customer_id, stripe_subscription_id,
                                status, price_id, current_period_end, cancel_at_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (clerk_user_id) DO UPDATE SET
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       status = EXCLUDED.status,
       price_id = EXCLUDED.price_id,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at = NOW()`,
    [
      input.clerkUserId,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.status,
      input.priceId,
      input.currentPeriodEnd ? input.currentPeriodEnd.toISOString() : null,
      input.cancelAtPeriodEnd,
    ]
  );
}

/** The Clerk user behind a Stripe customer, for events that carry only the customer. */
export async function userIdForCustomer(stripeCustomerId: string): Promise<string | null> {
  const rows = (await sql.query(`SELECT clerk_user_id FROM subscriptions WHERE stripe_customer_id = $1`, [
    stripeCustomerId,
  ])) as { clerk_user_id: string }[];
  return rows[0]?.clerk_user_id ?? null;
}

/**
 * Records an event id, returning false if it had already been recorded.
 *
 * ON CONFLICT DO NOTHING makes the insert itself the lock: two concurrent
 * deliveries of the same event cannot both see an empty table and both apply.
 */
export async function claimEvent(id: string, type: string): Promise<boolean> {
  const rows = (await sql.query(
    `INSERT INTO stripe_events (id, type) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [id, type]
  )) as { id: string }[];
  return rows.length > 0;
}
