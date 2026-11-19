/**
 * The subscription products as the two stores know them.
 *
 * Shared because three places need the same answer: the website, the mobile
 * app's paywall, and the webhooks that turn a receipt into a subscription row.
 * Neither store lets an identifier be renamed or reused once it exists, so
 * these strings are effectively permanent, and a second copy of them is a
 * second thing to get wrong.
 *
 * The prices are NOT here. The stores hold their own copy because they do the
 * charging, and Apple's matrix changes the figure per territory anyway. What
 * this maps is identifier to billing period, which is what a receipt needs to
 * become a subscription.
 */
export type StoreBillingPeriod = "weekly" | "monthly" | "annual";

export const STORE_PRODUCTS: Record<string, StoreBillingPeriod> = {
  "congtrade.pro.weekly": "weekly",
  "congtrade.pro.monthly": "monthly",
  "congtrade.pro.yearly": "annual",
};

/** Every identifier the app should ask the store about, weekly first. */
export const STORE_PRODUCT_IDS = Object.keys(STORE_PRODUCTS);

/**
 * Which period a store product is, or null if we have never heard of it.
 *
 * Null is a real case rather than an error: a product created in a console and
 * not added here still produces receipts, and the honest response is to record
 * the subscription without claiming to know what it is, not to refuse someone
 * access they have paid for.
 */
export function periodForStoreProduct(productId: string): StoreBillingPeriod | null {
  return STORE_PRODUCTS[productId] ?? null;
}

/**
 * What to say to someone whose Apple Account already pays for Pro on another
 * CongTrade account.
 *
 * Apple allows one subscription per group per Apple Account. While one is
 * active, "buying" another plan only switches that same subscription, which
 * still belongs to the account it was bought on, so the person would pay and
 * get nothing here. The app asks before Apple's sheet opens and shows this
 * instead; the server says it too, for older builds and for restoring.
 *
 * `until` is the end of the paid period, already formatted: the app writes it
 * in the phone's own time zone, the server in UTC. Null when Apple gave no
 * date, which a subscription does not normally lack.
 */
export function appleSubscriptionElsewhereMessage(until: string | null, renews: boolean): string {
  const opening = `Your Apple Account already ${renews ? "pays for" : "has"} CongTrade Pro on a different CongTrade account.`;
  if (!until) return `${opening} Sign in with that account to use it.`;
  return renews
    ? `${opening} That account has Pro until ${until}, and it renews automatically. Sign in with that account to use it, or cancel it in your App Store settings and subscribe here after ${until}.`
    : `${opening} That account has Pro until ${until}. Sign in with that account to use it, or subscribe here after ${until}.`;
}
