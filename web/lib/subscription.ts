import { sql } from "@/lib/db";
import { anyGrantsAccess, rowForProvider, type SubscriptionProvider, type SubscriptionRow } from "@/lib/subscriptionAccess";

export { grantsAccess, anyGrantsAccess, rowForProvider } from "@/lib/subscriptionAccess";
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
/**
 * Every subscription one person holds, across providers.
 *
 * Plural because it is: the website bills through Stripe and the app bills
 * through Apple or Google, and nothing stops the same human having both.
 * Reading only the first row would let a cancelled Stripe subscription hide a
 * live App Store one.
 */
export async function getSubscriptions(clerkUserId: string): Promise<SubscriptionRow[]> {
  return (await sql.query(
    `SELECT clerk_user_id, provider, provider_account_id, provider_subscription_id,
            status, product_id, current_period_end, cancel_at_period_end
     FROM subscriptions WHERE clerk_user_id = $1`,
    [clerkUserId]
  )) as SubscriptionRow[];
}

/** The subscription from one provider, for the Stripe portal and the stores. */
export async function getSubscriptionFor(
  clerkUserId: string,
  provider: SubscriptionProvider
): Promise<SubscriptionRow | null> {
  return rowForProvider(await getSubscriptions(clerkUserId), provider);
}

/** The whole entitlement question, for one user. */
export async function isSubscriber(clerkUserId: string | null | undefined): Promise<boolean> {
  if (!clerkUserId) return false;
  return anyGrantsAccess(await getSubscriptions(clerkUserId));
}
