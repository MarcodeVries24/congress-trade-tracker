import type { BillingPeriod } from "@/lib/stripePrices";

/**
 * The subscription products as the two stores know them.
 *
 * Apple and Google each need their own product created by hand in their
 * console, and neither lets an identifier be renamed or reused once it exists.
 * So they are written down here rather than derived, and this file is the one
 * place that has to match what was typed into App Store Connect and the Play
 * Console.
 *
 * The prices are NOT here. @congtrade/shared decides what Pro costs; the stores
 * hold their own copy of that figure because they do the charging, and keeping
 * a third copy in this file would just be a third thing to get wrong. What this
 * maps is identifier to billing period, which is what a receipt needs to be
 * turned into a subscription row.
 */
export const STORE_PRODUCTS: Record<string, BillingPeriod> = {
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
export function periodForProduct(productId: string): BillingPeriod | null {
  return STORE_PRODUCTS[productId] ?? null;
}
