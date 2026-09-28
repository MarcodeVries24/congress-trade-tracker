import type { Currency } from "@/lib/currency";

/**
 * Which Stripe price to charge, and whether we can charge at all.
 *
 * Separate from lib/stripe.ts, which holds the SDK client: the pricing page
 * needs to know which currencies are configured before it can quote one, and
 * importing the client for that would pull the whole Stripe package into a
 * page that never talks to it.
 */

/**
 * The four prices, created in the Stripe dashboard and referenced by id.
 *
 * Two currencies rather than one exchange rate: a separate dollar price lets
 * the rest of the world see $19.99 instead of whatever today's rate makes of
 * €19.99, at the cost of the rate being ours to maintain. Stripe's own
 * Adaptive Pricing does the opposite trade.
 *
 * The euro ids keep their original variable names, because they were in
 * production before the dollar ones existed.
 */
export const PRICES = {
  eur: {
    monthly: process.env.STRIPE_PRICE_MONTHLY,
    annual: process.env.STRIPE_PRICE_ANNUAL,
  },
  usd: {
    monthly: process.env.STRIPE_PRICE_MONTHLY_USD,
    annual: process.env.STRIPE_PRICE_ANNUAL_USD,
  },
} as const;

export type BillingPeriod = "monthly" | "annual";

/** Euros are the fallback: it is what the account settles in. */
export function priceIdFor(period: BillingPeriod, currency: Currency): string {
  const id = PRICES[currency]?.[period] ?? PRICES.eur[period];
  if (!id) throw new Error(`No Stripe price configured for ${period} billing in ${currency}`);
  return id;
}

/** Whether a currency has both of its prices set, for falling back cleanly. */
export function currencyConfigured(currency: Currency): boolean {
  return Boolean(PRICES[currency]?.monthly && PRICES[currency]?.annual);
}

/** Whether checkout can run at all, for refusing rather than half-working. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && currencyConfigured("eur");
}
