import { headers } from "next/headers";
import { currencyConfigured } from "@/lib/stripePrices";

/**
 * Which currency to quote this visitor.
 *
 * Wherever the euro is the money in people's pockets, quote euros; everywhere
 * else, quote dollars. Dollars are the default rather than the exception
 * because they are the currency a price is most likely to be readable in when
 * it isn't the local one, and this site's subject is US congressional filings.
 *
 * The country comes from the edge header Vercel sets on every request, so
 * there is no geo-IP service to call and nothing to fail. Vercel overwrites
 * any value a client sends, so this cannot be steered from the browser.
 */
export type Currency = "eur" | "usd";

export const CURRENCY_SYMBOL: Record<Currency, string> = { eur: "€", usd: "$" };

/**
 * Where the euro is legal tender, by ISO 3166-1 alpha-2, which is what the
 * edge header carries.
 *
 * The euro area itself, plus the microstates that mint it under agreement
 * with the EU, the two Balkan states that adopted it unilaterally, and the
 * overseas territories that use it but carry a country code of their own.
 * Bulgaria joined on 1 January 2026; anyone joining after that has to be
 * added here by hand.
 */
const EURO_COUNTRIES = new Set([
  // Euro area
  "AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
  // By monetary agreement with the EU
  "AD", "MC", "SM", "VA",
  // Adopted unilaterally
  "ME", "XK",
  // Territories with their own code that use the euro
  "AX", "GF", "GP", "MQ", "RE", "YT", "BL", "MF", "PM", "TF",
]);

/** The country rule on its own, before asking what we can actually charge. */
export function currencyForCountry(country: string): Currency {
  return EURO_COUNTRIES.has(country) ? "eur" : "usd";
}

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
