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
