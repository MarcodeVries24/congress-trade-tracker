// Reading a Senate report printed to PDF and uploaded in /admin/senate
// (senate/readPdfReport.ts), from the text pdf.js gives for its pages.
//
//   npx tsx ingest/test/senatePdf.test.ts
//
// The pages below are built by hand with the positions Chrome's print of an
// eFD report has (Armstrong's 22 Oct 2026 report, measured), so no PDF needs
// to be checked in.
//
// Prints one line per assertion and exits non-zero if any failed.

import { senateReportFromPages, type PdfTextItem } from "../src/ingest/senate/readPdfReport.js";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

/** Text at (x, y), about 5 points a character, as pdf.js reports a run of it. */
const at = (x: number, y: number, str: string): PdfTextItem => ({ str, x, y, width: str.length * 5 });

const ADDRESS = "https://efdsearch.senate.gov/search/view/ptr/6aa5ccb2-ff27-491a-9314-778b9ab37964/";

// The header row, repeated at the top of the table on every page. "Transaction"
// and "Asset" sit on a line of their own above it.
const header = (y: number): PdfTextItem[] => [
  at(75.8, y + 12, "Transactio"),
  at(364.8, y + 12, "Asset"),
  at(51.7, y, "#"),
  at(75.8, y, "n"),
  at(84.1, y, "Date"),
  at(144.6, y, "Owner"),
  at(192.2, y, "Ticker"),
  at(238, y, "Asset Name"),
  at(364.8, y, "Type"),
  at(420.7, y, "Type"),
  at(468.1, y, "Amount"),
  at(546.7, y, "Comment"),
];
const pageTop = (y: number) => [at(24, y, "15/11/2026, 09:11"), at(402.4, y, "eFD: Print Periodic Transaction Report")];
const footer = (page: string) => [at(24, 17.5, ADDRESS), at(807.8, 17.5, page)];

const page1: PdfTextItem[] = [
  ...pageTop(572.5),
  at(39, 514.7, "Periodic Transaction Report for 10/22/2026"),
  at(39, 496, "Mr. Alan Armstrong (Armstrong, Alan)"),
  at(51.9, 477.2, "Filed 10/22/2026 @ 11:34 PM"),
  at(57.9, 352, "Transactions (2 transactions total) 0 Self 2 Joint 0 Spouse 0 Dependent Child"),
  ...header(307.7),
  // Row 1: the ticker sits a point lower than the rest of its line, the
  // asset name wraps over three lines with option details under it, and the
  // amount over two.
  at(50.2, 286, "1"),
  at(74.3, 286, "09/08/2026"),
  at(143.1, 286, "Joint"),
  at(190.7, 285.2, "WMB"),
  at(236.5, 286, "Williams Companies,"),
  at(363.3, 286, "Stock"),
  at(419.2, 286, "Sale"),
  at(466.6, 286, "$250,001 -"),
  at(545.2, 286, "--"),
  at(236.5, 274, "Inc. (The) Common"),
  at(363.3, 274, "Option"),
  at(419.2, 274, "(Full)"),
  at(466.6, 274, "$500,000"),
  at(236.5, 262, "Stock"),
  at(236.5, 249.2, "Option Type: Call"),
  ...footer("1/2"),
];

// Row 2 starts on the next page, under the repeated header.
const page2: PdfTextItem[] = [
  ...pageTop(572.5),
  ...header(520),
  at(50.2, 500, "2"),
  at(74.3, 500, "09/09/2026"),
  at(143.1, 500, "Joint"),
  at(190.7, 500, "--"),
  at(236.5, 500, "MH Built to Last LLC"),
  at(363.3, 500, "Other"),
  at(419.2, 500, "Sale"),
  at(466.6, 500, "$1,001 -"),
  at(545.2, 500, "Underlying Asset of Summa I LLC"),
  at(236.5, 488, "Company: MH Built to"),
  at(419.2, 488, "(Partial)"),
  at(466.6, 488, "$15,000"),
  at(545.2, 488, "previously reported elsewhere"),
  ...footer("2/2"),
];

const report = senateReportFromPages([page1, page2]);

check("address from the footer", report.address, ADDRESS);
check("filer as the search wrote it", report.header?.filerName, "Alan Armstrong");
check("filing date", report.header?.filingDate, "2026-10-22");
check("the count the report declares", report.declared, 2);
check("table found", report.hasTable, true);
check("one row per number, across pages", report.transactions.length, 2);

const [first, second] = report.transactions;
check("row 1 date", first?.transactionDate, "2026-09-08");
check("row 1 owner", first?.owner, "JT");
check("row 1 ticker, though a point lower", first?.ticker, "WMB");
check("row 1 asset name joins its lines", first?.assetName, "Williams Companies, Inc. (The) Common Stock Option Type: Call");
check("row 1 asset type", first?.assetTypeCode, "Stock Option");
check("row 1 type", first?.transactionType, "S");
check("row 1 amount as the page writes it", first?.amountRange, "$250,001 - $500,000");
check("row 1 bounds", [first?.amountLow, first?.amountHigh], [250001, 500000]);

check("row 2 '--' is no ticker", second?.ticker, null);
check("row 2 asset name without the company block", second?.assetName, "MH Built to Last LLC");
check("row 2 partial sale", second?.transactionType, "S (partial)");
check("row 2 amount", second?.amountRange, "$1,001 - $15,000");

const noFooter = senateReportFromPages([page1.filter((i) => i.str !== ADDRESS)]);
check("no address when the footer was not printed", noFooter.address, null);
check("the rows are still read", noFooter.transactions.length, 1);

const notAReport = senateReportFromPages([[at(39, 500, "Search results"), at(39, 480, "Nothing here")]]);
check("a page without the table", [notAReport.hasTable, notAReport.transactions.length], [false, 0]);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
