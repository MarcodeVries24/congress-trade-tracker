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
