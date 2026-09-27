/**
 * What Pro costs, in euros.
 *
 * Plain constants rather than a lookup against the payment provider: Stripe
 * is the authority on what a customer is charged, but the pricing page has to
 * render before anyone has a customer record, and a price that fails to load
 * is worse than one that is a deploy behind. Change these together with the
 * prices in the Stripe dashboard.
 */
export type PlanPricing = {
  monthly: string;
  annualMonthly: string;
  currencySymbol: string;
  /** Whole percent saved by paying annually, or null when there's no saving. */
  annualSavingPercent: number | null;
};

const MONTHLY = 19.99;
const ANNUAL_PER_MONTH = 16.65;

export function getProPricing(): PlanPricing {
  const saving = 1 - ANNUAL_PER_MONTH / MONTHLY;
  return {
    monthly: MONTHLY.toFixed(2),
    annualMonthly: ANNUAL_PER_MONTH.toFixed(2),
    currencySymbol: "\u20ac",
    annualSavingPercent: saving > 0.005 ? Math.round(saving * 100) : null,
  };
}
