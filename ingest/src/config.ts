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
