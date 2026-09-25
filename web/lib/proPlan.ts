// Whether a Clerk billing subscription counts as CongTrade Pro.
//
// Kept free of imports — like lib/sql.ts and lib/memberNames.ts — so it can be
// read by code that has no Clerk client and no request context, and so the
// rules below can be tested on their own.

/**
 * Subscription states that still count as paying. `past_due` is included for
 * the same reason it is in ingest/src/alerts/entitlements.ts: a declined
 * renewal is usually one retry away from succeeding, and a customer shouldn't
 * lose access over a card that expired yesterday.
 */
export const PAYING_STATUSES = new Set(["active", "past_due"]);

/**
 * The feature slugs that mean Pro. Mirrors lib/access.ts: the `pro_congtrade`
 * plan grants `notifications`, `filters` and `no_ads` together, and checking
 * two of them survives a plan being renamed or split.
 */
export const PRO_FEATURES = new Set(["notifications", "filters"]);

/** Just enough of Clerk's BillingSubscription for the check below. */
export type BillingItems = {
  subscriptionItems: readonly {
    status: string;
    plan: { features: readonly { slug: string }[] } | null;
  }[];
};

/**
 * Whether a subscription carries a paid-for Pro plan.
 *
 * Matches on features rather than plan names because a free-plan user still
 * has an active subscription item — it simply has none of these features.
 */
export function isProSubscription(subscription: BillingItems): boolean {
  return subscription.subscriptionItems.some(
    (item) =>
      PAYING_STATUSES.has(item.status) &&
      (item.plan?.features ?? []).some((feature) => PRO_FEATURES.has(feature.slug))
  );
}
