// Which subscription states still grant access.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/subscription.test.ts
//
// grantsAccess is pure, so this needs no database and no Stripe. It is the
// rule that decides whether the filters open, and it is the one place where a
// mistake is invisible until a customer complains.

import { anyGrantsAccess, grantsAccess, rowForProvider, type SubscriptionRow } from "../lib/subscription";

const row = (o: Partial<SubscriptionRow>): SubscriptionRow => ({
  clerk_user_id: "u",
  provider: "stripe",
  provider_account_id: "cus_1",
  provider_subscription_id: "sub_1",
  status: "active",
  product_id: "price_1",
  current_period_end: null,
  cancel_at_period_end: false,
  ...o,
});

const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
const past = new Date(Date.now() - 5 * 86_400_000).toISOString();

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${got}, want ${want}`}`);
}

check("no row at all", grantsAccess(null), false);
check("active", grantsAccess(row({ status: "active" })), true);
check("trialing", grantsAccess(row({ status: "trialing" })), true);
// A declined renewal is usually one retry from succeeding.
check("past_due", grantsAccess(row({ status: "past_due" })), true);
check("incomplete", grantsAccess(row({ status: "incomplete" })), false);
check("unpaid", grantsAccess(row({ status: "unpaid" })), false);
check("paused", grantsAccess(row({ status: "paused" })), false);

// "Cancel any time" on the pricing page promises the rest of the period.
check("canceled, period still running", grantsAccess(row({ status: "canceled", current_period_end: soon })), true);
check("canceled, period over", grantsAccess(row({ status: "canceled", current_period_end: past })), false);
check("canceled, no end date recorded", grantsAccess(row({ status: "canceled", current_period_end: null })), false);

// Cancelling schedules the end; it doesn't take access away today.
check(
  "active but cancelling at period end",
  grantsAccess(row({ status: "active", cancel_at_period_end: true, current_period_end: soon })),
  true
);
check("garbage status", grantsAccess(row({ status: "" })), false);

// --- More than one provider per person -------------------------------
//
// The website bills through Stripe and the app bills through Apple or Google,
// so one human can hold two subscriptions. Cancelling either must not shut the
// other one off, which reading "the first row" would have done.
check("no rows grants nothing", anyGrantsAccess([]), false);
check(
  "a live Apple row grants access on its own",
  anyGrantsAccess([row({ provider: "apple", status: "active", provider_account_id: null })]),
  true
);
check(
  "a dead Stripe row does not hide a live Apple one",
  anyGrantsAccess([
    row({ provider: "stripe", status: "canceled", current_period_end: past }),
    row({ provider: "apple", status: "active" }),
  ]),
  true
);
check(
  "two dead rows grant nothing",
  anyGrantsAccess([
    row({ provider: "stripe", status: "canceled", current_period_end: past }),
    row({ provider: "google", status: "incomplete_expired" }),
  ]),
  false
);
check(
  "the portal asks for the Stripe row, not the first one",
  rowForProvider([row({ provider: "apple" }), row({ provider: "stripe", provider_account_id: "cus_9" })], "stripe")
    ?.provider_account_id,
  "cus_9"
);
check(
  "a provider with no row is null",
  rowForProvider([row({ provider: "stripe" })], "google"),
  null
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
