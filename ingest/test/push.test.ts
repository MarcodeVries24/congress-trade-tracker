// The wording of an alert's push notification: "New Trade(s)" over a count
// of the new trades and the alert's name.
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
check("one trade: title", one.title, "New Trade");
check("one trade: body counts it for the alert", one.body, "1 new trade for alert “Big buys”");
check("tap opens the alert", one.data, { type: "alert", alertId: "7" });

const many = pushMessageFor(alert, [1, 2, 3, 4, 5].map((id) => trade({ id })));
check("several: title", many.title, "New Trades");
check("several: body counts them for the alert", many.body, "5 new trades for alert “Big buys”");

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
