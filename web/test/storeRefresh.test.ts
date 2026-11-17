// Which subscription rows the store safety net asks the store about.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/storeRefresh.test.ts
//
// Only store rows that still say they are paid for, past the end of the
// period they were paid for: the shape a lost "expired" or "renewed"
// notification leaves behind. Everything else is never looked up.

import { isLapsed } from "../lib/storeRefresh";
import type { SubscriptionRow } from "../lib/subscription";

const row = (o: Partial<SubscriptionRow>): SubscriptionRow => ({
  clerk_user_id: "u",
  provider: "google",
  provider_account_id: "token",
  provider_subscription_id: "token",
  status: "active",
  product_id: "congtrade_pro_weekly",
  current_period_end: null,
  cancel_at_period_end: false,
  ...o,
});

const soon = new Date(Date.now() + 5 * 60_000).toISOString();
const past = new Date(Date.now() - 5 * 60_000).toISOString();

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${got}, want ${want}`}`);
}

check("an active Google row past its period is lapsed", isLapsed(row({ current_period_end: past })), true);
check("an active Apple row past its period is lapsed", isLapsed(row({ provider: "apple", current_period_end: past })), true);
check("a past_due store row past its period is lapsed", isLapsed(row({ status: "past_due", current_period_end: past })), true);
check("a row still inside its period is not", isLapsed(row({ current_period_end: soon })), false);
check("a cancelled row is already settled", isLapsed(row({ status: "canceled", current_period_end: past })), false);
check("Stripe rows are left to Stripe", isLapsed(row({ provider: "stripe", current_period_end: past })), false);
check("a row without an end date is not", isLapsed(row({ current_period_end: null })), false);
check("a row without a store id cannot be asked about", isLapsed(row({ provider_account_id: null, current_period_end: past })), false);

console.log(failures ? `\n${failures} failed` : "\nall passed");
if (failures) process.exit(1);
