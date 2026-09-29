// The price lookup in lib/stripePrices.ts.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/stripePrices.test.ts
//
// Env vars are set before the dynamic import, because PRICES reads them at
// module load and a static import would hoist above the assignments. Weekly is
// deliberately left out of the dollar set here, to check that a missing weekly
// price hides one option rather than degrading the whole currency.
//
// Prints one line per assertion and exits non-zero if any failed.

process.env.STRIPE_SECRET_KEY = "sk_test_stub";
process.env.STRIPE_PRICE_WEEKLY = "price_eur_weekly";
process.env.STRIPE_PRICE_MONTHLY = "price_eur_monthly";
process.env.STRIPE_PRICE_ANNUAL = "price_eur_annual";
process.env.STRIPE_PRICE_MONTHLY_USD = "price_usd_monthly";
process.env.STRIPE_PRICE_ANNUAL_USD = "price_usd_annual";
delete process.env.STRIPE_PRICE_WEEKLY_USD;

let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

async function main() {
  const { priceIdFor, periodConfigured, currencyConfigured, billingConfigured, BILLING_PERIODS } = await import(
    "../lib/stripePrices"
  );

  check("weekly is offered before the longer commitments", BILLING_PERIODS, ["weekly", "monthly", "annual"]);

  check("euro weekly resolves to its own price", priceIdFor("weekly", "eur"), "price_eur_weekly");
  check("euro monthly resolves to its own price", priceIdFor("monthly", "eur"), "price_eur_monthly");
  check("euro annual resolves to its own price", priceIdFor("annual", "eur"), "price_eur_annual");
  check("dollar monthly resolves to its own price", priceIdFor("monthly", "usd"), "price_usd_monthly");

  // The euro fallback is what makes an unconfigured currency safe rather than
  // broken, but it charges in euros, so nothing may quote dollars on the back of
  // it. That is what periodConfigured is for.
  check("an unconfigured dollar weekly falls back to euros", priceIdFor("weekly", "usd"), "price_eur_weekly");
  check("weekly is configured in euros", periodConfigured("weekly", "eur"), true);
  check("weekly is NOT configured in dollars", periodConfigured("weekly", "usd"), false);
  check("monthly is configured in dollars", periodConfigured("monthly", "usd"), true);

  // A missing weekly price must not take the whole currency down with it.
  check("dollars stay quotable without a weekly price", currencyConfigured("usd"), true);
  check("euros are quotable", currencyConfigured("eur"), true);
  check("billing is configured", billingConfigured(), true);

}

main().then(() => {
  console.log(failed === 0 ? "\nall assertions passed" : `\n${failed} assertion(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
});
