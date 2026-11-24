// Which account an App Store subscription belongs to.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/appleOwner.test.ts

import { appleOwner } from "../lib/appleOwner";
import type { SubscriptionRow } from "../lib/subscriptionAccess";

const now = Date.now();
const at = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();

const row = (o: Partial<SubscriptionRow>): SubscriptionRow => ({
  clerk_user_id: "holder",
  provider: "apple",
  provider_account_id: "1",
  provider_subscription_id: "2",
  status: "active",
  product_id: "congtrade.pro.weekly",
  current_period_end: at(24),
  cancel_at_period_end: false,
  ...o,
});

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${got}, want ${want}`}`);
}

check("first purchase: the account in the token", appleOwner(null, "buyer", now), "buyer");
check("first purchase without a token: nobody yet", appleOwner(null, null, now), null);
check("a renewal: the holder", appleOwner(row({}), "holder", now), "holder");
check("no token, or one of a deleted account: the holder", appleOwner(row({}), null, now), "holder");
check("another account changed the plan: stays with the holder", appleOwner(row({}), "other", now), "holder");
check(
  "cancelled but paid up, another account's token: stays with the holder",
  appleOwner(row({ status: "canceled" }), "other", now),
  "holder"
);
check(
  "ended, another account subscribed anew: theirs",
  appleOwner(row({ status: "canceled", current_period_end: at(-5) }), "other", now),
  "other"
);
check(
  "ended without word from Apple, another account subscribed anew: theirs",
  appleOwner(row({ current_period_end: at(-5) }), "other", now),
  "other"
);
check(
  "renewal a few minutes late: stays with the holder",
  appleOwner(row({ current_period_end: at(-0.1) }), "other", now),
  "holder"
);
check(
  "ended, the holder subscribes again: the holder",
  appleOwner(row({ status: "canceled", current_period_end: at(-5) }), "holder", now),
  "holder"
);

console.log(failures ? `\n${failures} failed` : "\nall passed");
if (failures) process.exit(1);
