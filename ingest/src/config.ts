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

/**
 * The SEC's list of every ticker it has a registrant for, with the company's
 * name as registered: public data, free to use, and where company names come
 * from. The SEC asks automated clients to say who they are.
 */
export const SEC_COMPANY_TICKERS = {
  url: "https://www.sec.gov/files/company_tickers.json",
  userAgent: "CongTrade contact@congtrade.com",
};

/**
 * The SEC's lists and XBRL data for market caps (syncMarketCaps.ts): the
 * fund and ETF tickers, and one reported figure (a "concept") for one
 * company. Public data; the SEC asks for under 10 requests a second.
 */
export const SEC_DATA = {
  fundTickersUrl: "https://www.sec.gov/files/company_tickers_mf.json",
  conceptUrl: (cik: string, concept: string) =>
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik.padStart(10, "0")}/${concept}.json`,
};

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
