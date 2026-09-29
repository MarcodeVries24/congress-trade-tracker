/**
 * Which subscription states grant access.
 *
 * Import-free on purpose, like lib/sql.ts and lib/memberDisplay.ts: the web
 * app reads it inside a request, and the alert sender reads it from a
 * standalone script in another workspace. One rule, one place, no database
 * client dragged along behind it.
 */
/**
 * Who billed for it. Stripe bills the website, the two stores bill the app.
 *
 * Kept as a plain union rather than an enum so the database column and this
 * type can be read side by side without a translation step.
 */
export type SubscriptionProvider = "stripe" | "apple" | "google";

export type SubscriptionRow = {
  clerk_user_id: string;
  provider: SubscriptionProvider;
  /** A Stripe customer, or the original store transaction renewals hang off. */
  provider_account_id: string | null;
  provider_subscription_id: string | null;
  status: string;
  /** Stripe calls it a price, the stores call it a product. */
  product_id: string | null;
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

/**
 * Whether any of a person's subscriptions grants access.
 *
 * One human can hold more than one: someone who subscribed on the website and
 * later reinstalled the app through the App Store has a Stripe row and an Apple
 * row, and cancelling either must not shut the other one off. So the question
 * is "does any of these grant it", never "what does the first row say".
 */
export function anyGrantsAccess(rows: readonly SubscriptionRow[]): boolean {
  return rows.some((row) => grantsAccess(row));
}

/** The row to act on for one provider, for the Stripe portal and the stores. */
export function rowForProvider(
  rows: readonly SubscriptionRow[],
  provider: SubscriptionProvider
): SubscriptionRow | null {
  return rows.find((row) => row.provider === provider) ?? null;
}
