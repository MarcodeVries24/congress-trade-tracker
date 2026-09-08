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

export const MEMBERS_REFERENCE = {
  legislatorsYamlUrl: "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml",
  // The Bioguide (bioguide.congress.gov) is Congress's own biographical
  // directory and covers ~99% of current members, vs. ~77% for the photo
  // congress.gov's own site CDN happens to have on file (newer members in
  // particular are often missing there but present here).
  photoUrl: (bioguideId: string) =>
    `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0].toUpperCase()}/${bioguideId.toUpperCase()}.jpg`,
};
