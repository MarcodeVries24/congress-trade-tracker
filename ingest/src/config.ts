import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PATHS = {
  dataDir: path.join(__dirname, "..", "data"),
  rawDir: path.join(__dirname, "..", "data", "raw"),
  pdfDir: path.join(__dirname, "..", "data", "pdfs"),
};

export const HOUSE_CLERK = {
  indexZipUrl: (year: number) =>
    `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`,
  ptrPdfUrl: (year: number, docId: string) =>
    `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`,
  filingPortal: "https://disclosures-clerk.house.gov/FinancialDisclosure",
};

export const SENATE_EFD = {
  homeUrl: "https://efdsearch.senate.gov/search/home/",
  searchUrl: "https://efdsearch.senate.gov/search/",
  reportUrl: (id: string) => `https://efdsearch.senate.gov/search/view/ptr/${id}/`,
  // "Periodic Transactions" report_type checkbox value on the search form.
  periodicTransactionsReportType: "11",
};

export const FINNHUB = {
  profileUrl: (ticker: string) => `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}`,
  searchUrl: (query: string) => `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}`,
};

// Finnhub reports a market cap in the *listing's own* currency, so a foreign
// listing needs converting before it can sit in the same column as a US one
// (see syncMarketCaps.ts). Finnhub's own /forex/rates is paid-tier, and the
// ECB feed everyone reaches for first doesn't publish TWD — which the corpus
// needs, for TSMC. This one is free, needs no key, and carries 160+
// currencies including TWD, KRW and IDR.
export const FX_RATES_URL = "https://open.er-api.com/v6/latest/USD";

export const MEMBERS_REFERENCE = {
  legislatorsYamlUrl: "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml",
  // Same dataset's companion file for members no longer serving (retired,
  // resigned, lost re-election, moved to another office, etc.) — a trade
  // filed while they were still in office stays in the table under their
  // old state_district/name key forever, so this is what backfills a photo
  // for those rows once they drop out of the "current" file above.
  legislatorsHistoricalYamlUrl: "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-historical.yaml",
  // The Bioguide (bioguide.congress.gov) is Congress's own biographical
  // directory and covers ~99% of current members, vs. ~77% for the photo
  // congress.gov's own site CDN happens to have on file (newer members in
  // particular are often missing there but present here).
  photoUrl: (bioguideId: string) =>
    `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0].toUpperCase()}/${bioguideId.toUpperCase()}.jpg`,
};
