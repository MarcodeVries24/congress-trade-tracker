// What an Apple notification does to a subscription's status.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/appleStatus.test.ts
//
// The type alone does not say whether a subscription will renew: a plan change
// arrives whether renewal is on or off. The renewal info sent with it does, and
// a subscription that is paid for but will not renew is "canceled" (Pro to the
// end of the period, then nothing).

import { statusForNotification } from "../lib/appleStore";
import { subscriptionElsewhereMessage } from "@congtrade/shared/storeProducts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${got}, want ${want}`}`);
}

check("a plan change with renewal off stays cancelled", statusForNotification("DID_CHANGE_RENEWAL_PREF", "DOWNGRADE", 0), "canceled");
check("a plan change with renewal on is active", statusForNotification("DID_CHANGE_RENEWAL_PREF", "DOWNGRADE", 1), "active");
check("a plan change without renewal info is active, as before", statusForNotification("DID_CHANGE_RENEWAL_PREF", undefined), "active");
check("turning renewal off is cancelled", statusForNotification("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED", 0), "canceled");
check("turning renewal back on is active", statusForNotification("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_ENABLED", 1), "active");
check("a renewal is active", statusForNotification("DID_RENEW", undefined, 1), "active");
check("a failed renewal stays past_due whatever renewal says", statusForNotification("DID_FAIL_TO_RENEW", undefined, 0), "past_due");
check("an expiry is cancelled", statusForNotification("EXPIRED", "VOLUNTARY", 0), "canceled");
check("a refund is cancelled", statusForNotification("REFUND", undefined, 1), "canceled");
check("an unknown type is left alone", statusForNotification("PRICE_INCREASE", undefined, 0), null);

const renewing = subscriptionElsewhereMessage("apple", "Nov 20, 2026", true);
check("renewing: says until when", renewing.includes("until Nov 20, 2026"), true);
check("renewing: says it renews", renewing.includes("renews automatically"), true);
const ending = subscriptionElsewhereMessage("apple", "Nov 20, 2026", false);
check("not renewing: says until when", ending.includes("until Nov 20, 2026"), true);
check("not renewing: does not claim it renews", ending.includes("renews"), false);
const play = subscriptionElsewhereMessage("google", "Nov 20, 2026", true);
check("Play: names Google, not Apple", play.includes("Google Play") && !/Apple|App Store/.test(play), true);
check("no date: still points at the other account", subscriptionElsewhereMessage("apple", null, true).includes("Sign in with that account"), true);

console.log(failures ? `\n${failures} failed` : "\nall passed");
if (failures) process.exit(1);
