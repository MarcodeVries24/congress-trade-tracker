import { CURRENCY_SYMBOL, type Currency } from "./currency";

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
  weekly: string;
  monthly: string;
  annualMonthly: string;
  annualTotal: string;
  currency: Currency;
  currencySymbol: string;
  /** Whole percent saved by paying annually, or null when there's no saving. */
  annualSavingPercent: number | null;
  /** Whole percent saved by paying monthly instead of weekly. */
  monthlySavingVsWeeklyPercent: number | null;
};

/**
 * Weekly is not a discount, it is a shorter commitment, so it costs more per
 * month than monthly does: 4.99 a week is about 21.60 a month against 19.99.
 * It exists for the mobile app's hard paywall, where someone who has just
 * finished onboarding will not commit to a year, and the saving percentages
 * below are what make the longer plans argue for themselves against it.
 */
const AMOUNTS: Record<Currency, { weekly: number; monthly: number; annualTotal: number }> = {
  eur: { weekly: 4.99, monthly: 19.99, annualTotal: 199.8 },
  usd: { weekly: 4.99, monthly: 19.99, annualTotal: 199.8 },
};

/** Weeks per year, averaged, for comparing a weekly price with a monthly one. */
const WEEKS_PER_MONTH = 52 / 12;

export function getProPricing(currency: Currency): PlanPricing {
  const { weekly, monthly, annualTotal } = AMOUNTS[currency];
  const annualMonthly = annualTotal / 12;
  const saving = 1 - annualMonthly / monthly;
  const weeklyAsMonthly = weekly * WEEKS_PER_MONTH;
  const monthlySaving = 1 - monthly / weeklyAsMonthly;
  return {
    weekly: weekly.toFixed(2),
    monthly: monthly.toFixed(2),
    annualMonthly: annualMonthly.toFixed(2),
    annualTotal: annualTotal.toFixed(2),
    currency,
    currencySymbol: CURRENCY_SYMBOL[currency],
    annualSavingPercent: saving > 0.005 ? Math.round(saving * 100) : null,
    monthlySavingVsWeeklyPercent: monthlySaving > 0.005 ? Math.round(monthlySaving * 100) : null,
  };
}
