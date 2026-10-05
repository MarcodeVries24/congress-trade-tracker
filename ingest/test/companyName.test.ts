// The SEC-name casing in ingest/src/ingest/companyName.ts.
//
//   npx tsx ingest/test/companyName.test.ts
//
// Cases are real SEC titles with asset names as members filed them.
// Prints one line per assertion and exits non-zero if any failed.

import { companyNameFrom, secTicker, withoutStateTag } from "../src/ingest/companyName.js";

let failed = 0;
function eq(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

eq("NVIDIA keeps its capitals", companyNameFrom("NVIDIA CORP", [["NVIDIA Corporation - Common Stock", 40]]), "NVIDIA Corp");
eq("Amazon.com from the filing", companyNameFrom("AMAZON COM INC", [["Amazon.com, Inc. - Common Stock", 30]]), "Amazon.com Inc");
eq("Coca-Cola's hyphen", companyNameFrom("COCA COLA CO", [["The Coca-Cola Company", 12]]), "Coca-Cola Co");
eq("half-capital title", companyNameFrom("PROCTER & GAMBLE Co", [["Procter & Gamble Company (The) - Common Stock", 9]]), "Procter & Gamble Co");
eq("state tag", companyNameFrom("BANK OF AMERICA CORP /DE/", [["Bank of America Corporation", 5]]), "Bank of America Corp");
eq("state tag after a space", withoutStateTag("Rivian Automotive, Inc. / DE"), "Rivian Automotive, Inc.");
eq("A/S is not a tag", withoutStateTag("Novo Nordisk A/S"), "Novo Nordisk A/S");
eq("mixed-case SEC title kept", companyNameFrom("Apple Inc.", [["APPLE INC", 3]]), "Apple Inc.");
eq("no filing to copy: title case", companyNameFrom("HOME DEPOT, INC.", []), "Home Depot Inc.");
eq("acronyms stay", companyNameFrom("AT&T INC.", []), "AT&T Inc.");
eq("small words", companyNameFrom("BANK OF NEW YORK MELLON CORP", []), "Bank of New York Mellon Corp");
eq("odd casing in a filing ignored", companyNameFrom("NGL ENERGY PARTNERS LP", [["NGl Energy Partners lP", 2]]), "NGL Energy Partners LP");
eq("odd mid-word casing ignored", companyNameFrom("AEGON LTD.", [["AEgON Ltd. ADR", 2], ["Aegon Ltd", 1]]), "Aegon Ltd");
eq("capitals the company uses", companyNameFrom("AECOM", [["AECOM Technology Corporation - Common Stock", 6]]), "AECOM");
eq("abbreviation keeps its full stop", companyNameFrom("ALLIANCEBERNSTEIN HOLDING L.P.", [["AllianceBernstein Holding L.P. Units", 4]]), "AllianceBernstein Holding L.P.");
eq("share class ticker", secTicker("brk.b"), "BRK-B");

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
