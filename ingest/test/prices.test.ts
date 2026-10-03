// The price lookups behind "what the stock did between the trade and its
// disclosure": which close answers a date, and how a filed ticker is spelled
// at the price source.
//
//   npx tsx ingest/test/prices.test.ts
//
// Prints one line per assertion and exits non-zero if any failed.

import { closeOn } from "../src/prices/resolve.js";
import { yahooSymbol } from "../src/prices/yahoo.js";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// A week with a weekend in it: Thursday, Friday, then Monday.
const closes = [
  { day: "2026-09-24", close: 100 },
  { day: "2026-09-25", close: 104 },
  { day: "2026-09-28", close: 110 },
];

check("a trading day answers with its own close", closeOn(closes, "2026-09-25"), { day: "2026-09-25", close: 104 });
check("a Saturday filing takes Friday's close", closeOn(closes, "2026-09-26"), { day: "2026-09-25", close: 104 });
check("a Sunday filing takes Friday's close too", closeOn(closes, "2026-09-27"), { day: "2026-09-25", close: 104 });
check("the first day of the series answers", closeOn(closes, "2026-09-24"), { day: "2026-09-24", close: 100 });
check("the last day of the series answers", closeOn(closes, "2026-09-28"), { day: "2026-09-28", close: 110 });
check("a day before the series has no answer", closeOn(closes, "2026-09-23"), null);
check("a day after the series is not answered yet", closeOn(closes, "2026-09-29"), null);
check("an empty series answers nothing", closeOn([], "2026-09-25"), null);

check("a plain ticker is unchanged", yahooSymbol("NVDA"), "NVDA");
check("a share class takes a hyphen", yahooSymbol("BRK.B"), "BRK-B");
check("lower case and spaces are tidied", yahooSymbol(" bf.b "), "BF-B");

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
