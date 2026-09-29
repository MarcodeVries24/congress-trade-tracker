/**
 * Which subscription states grant access.
 *
 * Import-free on purpose, like lib/sql.ts and lib/memberDisplay.ts: the web
 * app reads it inside a request, and the alert sender reads it from a
 * standalone script in another workspace. One rule, one place, no database
 * client dragged along behind it.
 */
export type SubscriptionRow = {
  clerk_user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/**
 * Statuses that still grant access.
 *
 * `past_due` is included because a declined renewal is usually one retry from
 * succeeding, and a customer shouldn't lose what they bought over a card that
 * expired yesterday. `trialing` is included so that switching a trial on in
 * Stripe needs no code change here.
 */
export const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * A cancelled subscription keeps its access until the period it was paid for
 * runs out, which is what "cancel any time" on the pricing page promises.
 */
export function grantsAccess(row: SubscriptionRow | null): boolean {
  if (!row) return false;
  if (PAYING_STATUSES.has(row.status)) return true;
  if (row.status === "canceled" && row.current_period_end) {
    return new Date(row.current_period_end).getTime() > Date.now();
  }
  return false;
}
