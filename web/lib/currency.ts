import { headers } from "next/headers";

/**
 * Which currency to quote this visitor.
 *
 * Americans see dollars, everyone else sees euros. That split is deliberate
 * rather than exhaustive: this site's data is US congressional filings, so the
 * audience is mostly American or European, and a Dutch buyer quoted euros is
 * right while a German one quoted dollars is not.
 *
 * The country comes from the edge header Vercel sets on every request, so
 * there is no geo-IP service to call and nothing to fail. When it's missing —
 * local development, a VPN, a crawler — the answer is euros, which is the
 * currency the account settles in.
 */
export type Currency = "eur" | "usd";

export const CURRENCY_SYMBOL: Record<Currency, string> = { eur: "€", usd: "$" };

/** Countries quoted in dollars. */
const DOLLAR_COUNTRIES = new Set(["US"]);

export async function currencyForRequest(): Promise<Currency> {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase() ?? "";
  return DOLLAR_COUNTRIES.has(country) ? "usd" : "eur";
}
