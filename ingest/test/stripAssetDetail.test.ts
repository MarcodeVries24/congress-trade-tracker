// The eFD asset-name cleanup in ingest/senate/parseReport.ts.
//
//   npx tsx ingest/test/stripAssetDetail.test.ts
//
// Cases are taken from rows that were actually in the database, including the
// two that look like parser artefacts and are not: "More" is an Indian grocery
// chain, and "Business Entity" is what the filer typed in the name field.
//
// Prints one line per assertion and exits non-zero if any failed.

import { stripAssetDetail } from "../src/ingest/senate/parseReport.js";

let failed = 0;

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

check(
  "drops a Company and Description block",
  stripAssetDetail("MH Built to Last LLC Company: MH Built to Last LLC (New York, NY) Description: Partnership"),
  "MH Built to Last LLC"
);

check(
  "drops a Company block with no Description",
  stripAssetDetail("Eaton Vance Floating Rate Fund Insti Share Company: EATON VANCE FLOATING RATE CLASS I"),
  "Eaton Vance Floating Rate Fund Insti Share"
);

check(
  "keeps a name that happens to be one word",
  stripAssetDetail("More Company: More (Ebene, Muritius (India)) Description: Grocery Chain"),
  "More"
);

check(
  "keeps a long structured-note name intact",
  stripAssetDetail(
    "BofA Finance LLC Trigger Autocallable Contingent Yield Notes Company: Bank of America Corporation (Charlotte, NC) Description: Equity Index-Linked Note"
  ),
  "BofA Finance LLC Trigger Autocallable Contingent Yield Notes"
);

check(
  "leaves an ordinary public security untouched",
  stripAssetDetail("Apple Inc. (AAPL) [ST]"),
  "Apple Inc. (AAPL) [ST]"
);

check(
  "leaves a name containing the word Company untouched",
  stripAssetDetail("JP Morgan Chase Financial Company LLC"),
  "JP Morgan Chase Financial Company LLC"
);

check("trims surrounding whitespace", stripAssetDetail("  Yum! Brands  "), "Yum! Brands");

check("handles an undefined cell", stripAssetDetail(undefined), "");

// A filer who put a placeholder in the name field leaves the entity's identity
// only in the Company part, so that becomes the name. All five real cases:
check(
  "placeholder: Business Entity takes the company name",
  stripAssetDetail("Business Entity Company: Arp & Hammond Hardware Company (Cheyenne, Wyoming) Description: Real Estate"),
  "Arp & Hammond Hardware Company"
);

check(
  "placeholder: keeps a company name ending in LLC",
  stripAssetDetail("Business Entity Company: Sweetgrass Land Co. LLC (Cheyenne, Wyoming) Description: The sale of build-ready residential and commercial lots."),
  "Sweetgrass Land Co. LLC"
);

check(
  "placeholder: Shares of Stock takes the company name",
  stripAssetDetail("Shares of Stock Company: Farmers Enterprises, Inc. (Great Bend, KS) Description: Bank"),
  "Farmers Enterprises, Inc."
);

check(
  "placeholder: a share class is a placeholder too",
  stripAssetDetail("Series A-3 preferred stock Company: Boxabl (Las Vegas, Nevada) Description: Home construction"),
  "Boxabl"
);

check(
  "placeholder matching is case-insensitive",
  stripAssetDetail("BUSINESS ENTITY Company: Lummis Livestock Company LLC (Cheyenne, Wyoming) Description: Runs steers."),
  "Lummis Livestock Company LLC"
);

check(
  "a real one-word name is not a placeholder",
  stripAssetDetail("More Company: More (Ebene, Muritius (India)) Description: Grocery Chain"),
  "More"
);

check(
  "a placeholder with no company block keeps the placeholder",
  stripAssetDetail("Business Entity"),
  "Business Entity"
);

check(
  "nested parentheses in a location are removed as one group",
  stripAssetDetail("Shares of Stock Company: Acme Ltd (Ebene, Muritius (India)) Description: Widgets"),
  "Acme Ltd"
);

check(
  "a company with no location keeps its whole name",
  stripAssetDetail("Business Entity Company: Farmers Enterprises, Inc. Description: Bank"),
  "Farmers Enterprises, Inc."
);

check(
  "falls back to the original when the cell leads with the block",
  stripAssetDetail("Company: Sweetgrass Land Co. LLC (Cheyenne, Wyoming)"),
  "Company: Sweetgrass Land Co. LLC (Cheyenne, Wyoming)"
);

console.log(failed === 0 ? "\nall assertions passed" : `\n${failed} assertion(s) failed`);
process.exit(failed === 0 ? 0 : 1);
