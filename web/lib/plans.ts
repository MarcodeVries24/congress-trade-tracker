/**
 * The Pro plan's own prices, read from Clerk.
 *
 * The page needs to say what annual billing saves, and a number typed into
 * marketing copy is a number that goes stale the first time the price moves.
 * Clerk already knows; this asks it.
 *
 * Every failure resolves to null rather than throwing: the saving line is
 * worth having, but not worth taking the pricing page down for.
 */
export type PlanPricing = {
  monthly: string;
  annualMonthly: string;
  currencySymbol: string;
  /** Whole percent saved by paying annually, or null when there's no saving. */
  annualSavingPercent: number | null;
};

type ClerkFee = { amount: number; amount_formatted: string; currency_symbol: string };
type ClerkPlan = { slug: string; fee: ClerkFee; annual_monthly_fee: ClerkFee };

let cached: { at: number; value: PlanPricing | null } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function getProPricing(slug = "pro_congtrade"): Promise<PlanPricing | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = await fetchPricing(slug);
  // A failed lookup is cached too, briefly, so a Clerk outage doesn't turn
  // into one outbound request per page view.
  cached = { at: Date.now(), value };
  return value;
}

async function fetchPricing(slug: string): Promise<PlanPricing | null> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.clerk.com/v1/billing/plans", {
      headers: { Authorization: `Bearer ${key}` },
      // Next would otherwise cache this into the page's own revalidation.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: ClerkPlan[] };
    const plan = data?.find((p) => p.slug === slug);
    if (!plan || plan.fee.amount <= 0) return null;
    const saving = 1 - plan.annual_monthly_fee.amount / plan.fee.amount;
    return {
      monthly: plan.fee.amount_formatted,
      annualMonthly: plan.annual_monthly_fee.amount_formatted,
      currencySymbol: plan.fee.currency_symbol,
      annualSavingPercent: saving > 0.005 ? Math.round(saving * 100) : null,
    };
  } catch {
    return null;
  }
}
