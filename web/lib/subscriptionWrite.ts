import { sql } from "@/lib/db";
import type { SubscriptionProvider } from "@/lib/subscriptionAccess";

/**
 * The write half of the subscriptions table, used by each provider's webhook.
 *
 * Kept apart from the read helpers so that the one place allowed to change
 * who has access is easy to find, and so nothing on a page can import a
 * function that writes.
 */
export type SubscriptionUpsert = {
  clerkUserId: string;
  /** Defaults to Stripe, which is the only writer until the app ships. */
  provider?: SubscriptionProvider;
  providerAccountId: string | null;
  providerSubscriptionId: string | null;
  status: string;
  productId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * One row per user per provider, replaced wholesale.
 *
 * Stripe redelivers events and does not promise order, so this is written to
 * be safe to apply twice and harmless to apply late: the row simply ends up
 * holding whatever the most recently *applied* event said. The event ledger in
 * markEventSeen keeps the same delivery from being applied twice at all.
 */
export async function upsertSubscription(input: SubscriptionUpsert): Promise<void> {
  await sql.query(
    // The conflict target is the pair, so a Stripe update cannot overwrite the
    // same person's App Store row. stripe_customer_id is still written for now
    // because the deployed build reads it until this one replaces it.
    `INSERT INTO subscriptions (clerk_user_id, provider, provider_account_id, provider_subscription_id,
                                status, product_id, current_period_end, cancel_at_period_end,
                                stripe_customer_id, stripe_subscription_id, price_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3, $4, $6, NOW())
     ON CONFLICT (clerk_user_id, provider) DO UPDATE SET
       provider_account_id = EXCLUDED.provider_account_id,
       provider_subscription_id = EXCLUDED.provider_subscription_id,
       status = EXCLUDED.status,
       product_id = EXCLUDED.product_id,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       price_id = EXCLUDED.price_id,
       updated_at = NOW()`,
    [
      input.clerkUserId,
      input.provider ?? "stripe",
      input.providerAccountId,
      input.providerSubscriptionId,
      input.status,
      input.productId,
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
