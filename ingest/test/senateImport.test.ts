// Reading a Senate report page saved by hand (/admin/senate): its address,
// the id it is stored under, the filer and date, and its transactions.
//
//   npx tsx ingest/test/senateImport.test.ts
//
// The page below is a stand-in shaped like an eFD report page; it is loaded
// with JavaScript off and every request refused, as the import does.
//
// Prints one line per assertion and exits non-zero if any failed.

import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { findSenateReportAddress, senateReportPath } from "@congtrade/shared/senateReport";
import { parseSenateReportPage } from "../src/ingest/senate/parseReport.js";
import { readSenateReportHeader, senateHeaderFromText } from "../src/ingest/senate/reportHeader.js";
import { senateDocId } from "../src/ingest/senate/reportId.js";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

const UUID = "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";

// Addresses.
const ptr = senateReportPath(`https://efdsearch.senate.gov/search/view/ptr/${UUID}/`);
check("an electronic report is a ptr", ptr?.kind, "ptr");
check("its id is the UUID", ptr ? senateDocId(ptr) : null, UUID);
check("a path alone is enough", senateReportPath(`/search/view/ptr/${UUID}/`)?.url, `https://efdsearch.senate.gov/search/view/ptr/${UUID}/`);
check("the search page is not a report", senateReportPath("https://efdsearch.senate.gov/search/"), null);

// A paper report has to get the id the automated search gave it: a hash
// of the link exactly as eFD writes it.
const paperPath = `/search/view/paper/${UUID.toUpperCase()}/`;
const paper = senateReportPath(`https://efdsearch.senate.gov${paperPath}`);
check(
  "a paper report's id matches the search's",
  paper ? senateDocId(paper) : null,
  `paper-${createHash("sha1").update(paperPath).digest("hex").slice(0, 20)}`
);

// Finding the address in a saved file.
check(
  "Chrome's saved-from comment",
  findSenateReportAddress(`<!-- saved from url=(0071)https://efdsearch.senate.gov/search/view/ptr/${UUID}/ -->\n<html>`),
  `https://efdsearch.senate.gov/search/view/ptr/${UUID}/`
);
check("a link in the page", findSenateReportAddress(`<a href="/search/view/ptr/${UUID}/">print</a>`), `/search/view/ptr/${UUID}/`);
check("nothing to find", findSenateReportAddress("<html><body>hello</body></html>"), null);

// The filer and the date.
const plain = senateHeaderFromText("The Honorable Shelley M Capito (Capito, Shelley M)", "Filed 10/15/2026 @ 3:31 PM");
check("name as the search wrote it", plain?.filerName, "Shelley M Capito");
check("last name for the member key", plain?.lastName, "Capito");
check("filing date", plain?.filingDate, "2026-10-15");
const suffixed = senateHeaderFromText("The Honorable A. Mitchell McConnell, Jr. (McConnell, Jr., A. Mitchell)", "Filed 1/5/2026");
check("a suffix goes last", suffixed?.filerName, "A. Mitchell McConnell, Jr.");
check("short month and day", suffixed?.filingDate, "2026-01-05");
check("no date, no header", senateHeaderFromText("The Honorable X Y (Y, X)", "nothing"), null);

// A whole page.
const PAGE = `<!doctype html><html><head><script src="https://efdsearch.senate.gov/static/x.js"></script></head><body>
<h1>Periodic Transaction Report for 10/14/2026</h1>
<h2 class="filedReport">The Honorable Shelley M Capito (Capito, Shelley M)</h2>
<p>Filed 10/15/2026 @ 3:31 PM</p>
<table class="table"><thead><tr><th>#</th><th>Transaction Date</th><th>Owner</th><th>Ticker</th><th>Asset Name</th><th>Asset Type</th><th>Type</th><th>Amount</th><th>Comment</th></tr></thead>
<tbody>
<tr><td>1</td><td>10/01/2026</td><td>Spouse</td><td>AAPL</td><td>Apple Inc</td><td>Stock</td><td>Purchase</td><td>$1,001 - $15,000</td><td>--</td></tr>
<tr><td>2</td><td>10/02/2026</td><td>Self</td><td>--</td><td>US Treasury Note</td><td>Government Security</td><td>Sale (Full)</td><td>$15,001 - $50,000</td><td>--</td></tr>
</tbody></table></body></html>`;

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ javaScriptEnabled: false });
let requests = 0;
await context.route("**/*", (route) => {
  requests++;
  return route.abort();
});
const page = await context.newPage();
await page.setContent(PAGE, { waitUntil: "domcontentloaded" });
const header = await readSenateReportHeader(page);
check("page: filer", header?.filerName, "Shelley M Capito");
const rows = await parseSenateReportPage(page);
check("page: two transactions", rows?.length, 2);
check("page: spouse's purchase", `${rows?.[0].owner} ${rows?.[0].transactionType} ${rows?.[0].ticker}`, "SP P AAPL");
check("page: full sale", rows?.[1].transactionType, "S");
// With JavaScript off the page's eFD script is not even requested; any
// request that were made would be refused by the route above.
check("page: nothing was requested from eFD", requests, 0);
await browser.close();

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
