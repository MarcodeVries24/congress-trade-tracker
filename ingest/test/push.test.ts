// The wording of an alert's push notification: one trade named outright,
// several counted with the first few spelled out.
//
//   npx tsx ingest/test/push.test.ts
//
// Prints one line per assertion and exits non-zero if any failed.

import { pushMessageFor } from "../src/alerts/pushMessage.js";
import type { AlertTradeRow } from "../../web/lib/alertFilters";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

function trade(over: Partial<AlertTradeRow>): AlertTradeRow {
  return {
    id: 1,
    doc_id: "d",
    member_name: "Hon. Nancy Pelosi",
    bioguide_id: null,
    state_district: "CA11",
    asset_name: "NVIDIA Corporation - Common Stock",
    ticker: "NVDA",
    asset_type_code: "ST",
    owner: "SP",
    transaction_type: "P",
    transaction_date: "2026-09-01",
    amount_range: "$1,000,001 - $5,000,000",
    amount_low: 1000001,
    amount_high: 5000000,
    filing_date: "2026-09-20",
    pdf_url: "",
    chamber: "house",
    ingested_at: "",
    party: "Democrat",
    member_state: "CA",
    market_cap: null,
    company_name: "NVIDIA Corp",
    ...over,
  };
}

const alert = { id: "7", name: "Big buys" };

const one = pushMessageFor(alert, [trade({})]);
check("one trade: title names who did what", one.title, "Nancy Pelosi bought NVDA");
check("one trade: body has amount, company and alert", one.body, "$1M–$5M · NVIDIA Corp · Big buys");
check("tap opens the alert", one.data, { type: "alert", alertId: "7" });

const sold = pushMessageFor(alert, [trade({ transaction_type: "S (partial)", ticker: null, amount_low: 15001, amount_high: 50000 })]);
check("a sale without a ticker uses the asset name", sold.title, "Nancy Pelosi sold NVIDIA Corporation - Common Stock");
check("thousands are compact", sold.body.startsWith("$15K–$50K"), true);

const many = pushMessageFor(alert, [1, 2, 3, 4, 5].map((id) => trade({ id })));
check("several: title counts", many.title, "Big buys: 5 new trades");
check("several: body lists three and the rest", many.body.endsWith(", and 2 more"), true);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
