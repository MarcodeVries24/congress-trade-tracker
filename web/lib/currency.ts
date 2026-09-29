import { headers } from "next/headers";
import { currencyForCountry, type Currency } from "@congtrade/shared/currency";
import { currencyConfigured } from "@/lib/stripePrices";

// The country-to-currency rule lives in @congtrade/shared; only the part that
// reads a Next.js request header stays here, because nothing outside the
// website has a request to read.
export { CURRENCY_SYMBOL, currencyForCountry, type Currency } from "@congtrade/shared/currency";

export async function currencyForRequest(): Promise<Currency> {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase() ?? "";
  const wanted = currencyForCountry(country);
  // An unconfigured currency is quietly charged in euros by priceIdFor, so
  // quoting it anyway would show a dollar price and take a euro payment. Now
  // that dollars are the default for most of the world, that mismatch would be
  // the common case rather than a corner, so the quote follows what is
  // chargeable rather than the other way round.
  return currencyConfigured(wanted) ? wanted : "eur";
}
