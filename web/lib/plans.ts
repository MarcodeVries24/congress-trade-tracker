import { CURRENCY_SYMBOL, type Currency } from "@/lib/currency";

/**
 * What Pro costs, per currency.
 *
 * Plain constants rather than a lookup against Stripe: Stripe is the authority
 * on what a customer is charged, but the pricing page has to render before
 * anyone has a customer record, and a price that fails to load is worse than
 * one that is a deploy behind.
 *
 * Change these together with the prices in the Stripe dashboard. They are the
 * displayed figures; the ids in lib/stripe.ts are what actually gets charged,
 * and the two disagreeing is the failure mode worth watching for.
 */
export type PlanPricing = {
  monthly: string;
  annualMonthly: string;
  annualTotal: string;
  currency: Currency;
  currencySymbol: string;
  /** Whole percent saved by paying annually, or null when there's no saving. */
  annualSavingPercent: number | null;
};

const AMOUNTS: Record<Currency, { monthly: number; annualTotal: number }> = {
  eur: { monthly: 19.99, annualTotal: 199.8 },
  usd: { monthly: 19.99, annualTotal: 199.8 },
};

export function getProPricing(currency: Currency): PlanPricing {
  const { monthly, annualTotal } = AMOUNTS[currency];
  const annualMonthly = annualTotal / 12;
  const saving = 1 - annualMonthly / monthly;
  return {
    monthly: monthly.toFixed(2),
    annualMonthly: annualMonthly.toFixed(2),
    annualTotal: annualTotal.toFixed(2),
    currency,
    currencySymbol: CURRENCY_SYMBOL[currency],
    annualSavingPercent: saving > 0.005 ? Math.round(saving * 100) : null,
  };
}
