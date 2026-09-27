import Stripe from "stripe";

/**
 * Stripe, for subscriptions.
 *
 * Clerk keeps the accounts; Stripe keeps the money. Going direct rather than
 * through Clerk Billing is what makes euros, iDEAL, SEPA Direct Debit,
 * Bancontact, refunds and EU VAT possible — Clerk Billing is USD-only, card
 * only, and does not sync its subscriptions into Stripe at all.
 *
 * Lazily constructed: the key is absent in local development for anyone who
 * hasn't set it, and a missing key should break checkout, not every page that
 * happens to import something from here.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client = new Stripe(key);
  return client;
}

/** The two prices, created in the Stripe dashboard and referenced by id. */
export const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
} as const;

export type BillingPeriod = keyof typeof PRICES;

export function priceIdFor(period: BillingPeriod): string {
  const id = PRICES[period];
  if (!id) throw new Error(`No Stripe price configured for ${period} billing`);
  return id;
}

/** Whether checkout can run at all, for hiding the buttons when it can't. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && PRICES.monthly && PRICES.annual);
}
